import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Crypto (mesma lógica do crypto-utils) ──────────────────────
async function getEncryptionKey(): Promise<CryptoKey> {
  const hexKey = Deno.env.get("ENCRYPTION_KEY") || "";
  if (!hexKey) throw new Error("ENCRYPTION_KEY não configurada");
  const rawKey = hexToBytes(hexKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", rawKey);
  return crypto.subtle.importKey("raw", hashBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

async function decryptPhone(encrypted: string, key: CryptoKey): Promise<string> {
  // Suporta plain text (sem prefixo enc:) E texto criptografado
  if (!encrypted.startsWith("enc:")) return encrypted;
  const raw = encrypted.slice(4);
  const combined = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  const iv  = combined.slice(0, 12);
  const ct  = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ── Horário de Brasília ─────────────────────────────────────────
function getBrasilia(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encKey = await getEncryptionKey();
    const brasilia = getBrasilia();
    const currentHour   = brasilia.getHours();
    const currentMinute = brasilia.getMinutes();
    const timeStr = `${String(currentHour).padStart(2,"0")}:${String(currentMinute).padStart(2,"0")}`;

    console.log(`[check-campaigns] ${timeStr} (Brasília)`);

    // ── Buscar campanhas ativas ───────────────────────────────
    const { data: campaigns, error: campErr } = await sb
      .from("campaigns")
      .select("*")
      .eq("status", "active");

    if (campErr) throw campErr;
    if (!campaigns?.length) {
      return respond({ message: "Nenhuma campanha ativa", queued: 0 });
    }

    let totalQueued = 0;
    let totalSkipped = 0;

    for (const campaign of campaigns) {
      // ── Verificar se algum schedule_time bate com o horário atual ──
      const times: string[] = campaign.schedule_times || ["09:00"];
      const shouldRun = times.some(t => {
        const [h, m] = t.split(":").map(Number);
        // Dispara na hora exata (janela de 1 minuto)
        return h === currentHour && m === currentMinute;
      });

      if (!shouldRun) {
        console.log(`[check-campaigns] "${campaign.name}": fora do horário (${timeStr})`);
        continue;
      }

      console.log(`[check-campaigns] "${campaign.name}": processando (horário ${timeStr})`);

      // ── Buscar perfil do usuário (WuzAPI) ────────────────────
      const { data: profile } = await sb
        .from("profiles")
        .select("wuzapi_url, wuzapi_token")
        .eq("user_id", campaign.user_id)
        .single();

      if (!profile?.wuzapi_url || !profile?.wuzapi_token) {
        console.log(`[check-campaigns] "${campaign.name}": WuzAPI não configurado`);
        continue;
      }

      // ── Verificar WhatsApp conectado ──────────────────────────
      try {
        const res = await fetch(`${profile.wuzapi_url.replace(/\/+$/,"")}/session/status`, {
          headers: { Token: profile.wuzapi_token },
        });
        const data = await res.json();
        if (!data?.data?.Connected && !data?.data?.connected) {
          console.log(`[check-campaigns] "${campaign.name}": WhatsApp desconectado`);
          continue;
        }
      } catch (e) {
        console.log(`[check-campaigns] "${campaign.name}": falha ao checar WhatsApp: ${e.message}`);
        continue;
      }

      // ── Buscar contatos pendentes (até batch_size) ────────────
      const batchSize = campaign.batch_size || 25;
      const { data: contacts } = await sb
        .from("campaign_contacts")
        .select("id, name, whatsapp_encrypted")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .limit(batchSize);

      if (!contacts?.length) {
        console.log(`[check-campaigns] "${campaign.name}": sem contatos pendentes`);
        // Se todos enviados, marca campanha como concluída
        const { count } = await sb
          .from("campaign_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");
        if (count === 0) {
          await sb.from("campaigns")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", campaign.id);
          console.log(`[check-campaigns] "${campaign.name}": ✅ concluída`);
        }
        continue;
      }

      // ── Preparar media_data (strip data URI prefix) ───────────
      let mediaData: string | null = null;
      if (campaign.media_base64 && campaign.media_type) {
        // Remove prefixo "data:image/jpeg;base64," → fica só o base64 puro
        const match = campaign.media_base64.match(/^data:[^;]+;base64,(.+)$/s);
        mediaData = match ? match[1] : campaign.media_base64;
      }

      const messages: string[] = campaign.messages || [];
      if (messages.length === 0) {
        console.log(`[check-campaigns] "${campaign.name}": sem mensagens configuradas`);
        continue;
      }

      // ── Montar itens para a fila ──────────────────────────────
      const batchId = crypto.randomUUID();
      const queueItems: Record<string, unknown>[] = [];
      const skippedIds: string[] = [];

      for (const contact of contacts) {
        // Dedup: já existe na fila com status != 'failed'?
        const { count: existing } = await sb
          .from("message_queue")
          .select("id", { count: "exact", head: true })
          .eq("campaign_contact_id", contact.id)
          .neq("status", "failed");

        if ((existing || 0) > 0) {
          skippedIds.push(contact.id);
          totalSkipped++;
          continue;
        }

        // Decrypt phone
        let phone: string;
        try {
          const raw = await decryptPhone(contact.whatsapp_encrypted, encKey);
          phone = raw.replace(/\D/g, "");
          if (!phone || phone.length < 10 || phone.length > 15) {
            throw new Error(`Número inválido: "${phone}"`);
          }
        } catch (e) {
          console.error(`[check-campaigns] Contato ${contact.id} (${contact.name}): decrypt falhou: ${e.message}`);
          // Marca como falho direto
          await sb.from("campaign_contacts").update({
            status: "failed",
            error: e.message,
          }).eq("id", contact.id);
          await sb.from("campaigns").update({
            failed_count: campaign.failed_count + 1,
            updated_at: new Date().toISOString(),
          }).eq("id", campaign.id);
          continue;
        }

        // Escolhe mensagem aleatória
        const msgIndex = Math.floor(Math.random() * messages.length);
        const message  = messages[msgIndex];

        queueItems.push({
          user_id:             campaign.user_id,
          batch_id:            batchId,
          phone,
          message,
          status:              "pending",
          source:              "campaign",
          send_mode:           campaign.media_type || "text",
          media_data:          mediaData,
          campaign_id:         campaign.id,
          campaign_contact_id: contact.id,
          created_at:          new Date().toISOString(),
          // Guarda message_index no campo extra (worker vai usar para atualizar campaign_contacts)
          // Reutilizamos o campo "message" para o texto e adicionamos metadata no payload
          metadata:            JSON.stringify({ message_index: msgIndex, contact_name: contact.name }),
        });
      }

      if (queueItems.length > 0) {
        const { error: insertErr } = await sb.from("message_queue").insert(queueItems);
        if (insertErr) {
          console.error(`[check-campaigns] Erro ao inserir na fila: ${insertErr.message}`);
        } else {
          totalQueued += queueItems.length;
          // Atualiza last_batch_at da campanha
          await sb.from("campaigns").update({
            last_batch_at: new Date().toISOString(),
            updated_at:    new Date().toISOString(),
          }).eq("id", campaign.id);

          console.log(`[check-campaigns] "${campaign.name}": ${queueItems.length} itens enfileirados (batch ${batchId})`);
        }
      }

      if (skippedIds.length > 0) {
        console.log(`[check-campaigns] "${campaign.name}": ${skippedIds.length} já na fila (dedup)`);
      }
    }

    return respond({ message: `${totalQueued} contatos enfileirados, ${totalSkipped} ignorados (dedup)`, queued: totalQueued, skipped: totalSkipped });

  } catch (err) {
    console.error(`[check-campaigns] FATAL: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function respond(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
