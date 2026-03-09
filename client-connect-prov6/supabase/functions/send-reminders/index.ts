import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
//  ARQUITETURA V2 - À prova de falhas
//
//  Mudança principal: message_logs é a FONTE DE VERDADE.
//  Antes de enviar pra qualquer cliente, verifica se já
//  recebeu aquele lembrete hoje. Se crashar no meio,
//  próxima execução retoma de onde parou sem duplicar.
//
//  Fluxo:
//  1. Cron chama a cada minuto
//  2. Para cada lembrete ativo, verifica se a HORA bate
//  3. Busca clientes que precisam receber
//  4. Consulta message_logs: quem JÁ recebeu hoje?
//  5. Envia só pros pendentes (cada um em try/catch isolado)
//  6. last_sent_date é só otimização — marcado quando TODOS ok
// ══════════════════════════════════════════════════════════════

// ── Encryption ──
const ALGORITHM = "AES-GCM";

async function getEncryptionKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get("ENCRYPTION_KEY");
  if (!raw) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: ALGORITHM }, false, ["decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function decrypt(value: string, key: CryptoKey | null): Promise<string> {
  if (!value.startsWith("enc:")) return value;
  if (!key) return "";
  try {
    const [, ivHex, dataHex] = value.split(":");
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: hexToBytes(ivHex) },
      key,
      hexToBytes(dataHex)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

// ── Brasilia time ──
function getBrasilia(): Date {
  const now = new Date();
  return new Date(now.getTime() + (-3 * 60 + now.getTimezoneOffset()) * 60000);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Admin ID resolver ──
async function getAdminId(sb: any, userId: string): Promise<string | null> {
  const { data: role } = await sb
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "super_admin"]).maybeSingle();
  if (role) return userId;
  const { data: prof } = await sb
    .from("profiles").select("created_by").eq("user_id", userId).single();
  return prof?.created_by || null;
}

// ── Template variable replacement ──
function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, val);
  }
  return result;
}

// ── Log to message_logs ──
async function logMsg(sb: any, data: {
  user_id: string;
  client_id: string;
  client_name: string;
  whatsapp_number: string | null;
  reminder_name: string;
  template_name: string | null;
  status: "sent" | "failed";
  error_message: string | null;
  message_preview: string | null;
}) {
  try {
    await sb.from("message_logs").insert({ ...data, sent_at: new Date().toISOString() });
  } catch (e) {
    console.error(`[log] Falha ao gravar log: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encKey = await getEncryptionKey();
    const brasilia = getBrasilia();
    const todayStr = formatDate(brasilia);
    const currentHour = brasilia.getHours();
    const currentMinute = brasilia.getMinutes();
    const timeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

    console.log(`[reminders] ${todayStr} ${timeStr} (Brasilia)`);

    // ── Parse request ──
    let manualReminderId: string | null = null;
    try {
      const body = await req.json();
      manualReminderId = body?.reminder_id || null;
    } catch {}
    const isManual = !!manualReminderId;

    // ── Fetch reminders ──
    let query = sb.from("reminders").select("*, message_templates(*)");
    if (isManual) {
      query = query.eq("id", manualReminderId);
    } else {
      query = query.eq("is_active", true);
    }
    const { data: reminders, error: remErr } = await query;
    if (remErr) throw remErr;
    if (!reminders?.length) {
      return respond({ message: "Nenhum lembrete", sent: 0, errors: 0, skipped: 0 });
    }

    let totalSent = 0;
    let totalErrors = 0;
    let totalSkipped = 0;

    // ── Process each reminder ──
    for (const reminder of reminders) {

      // ── Time gate (automatic only) ──
      if (!isManual) {
        // Já completou hoje? Pula (otimização — message_logs é a verdade)
        if (reminder.last_sent_date === todayStr) continue;

        // Verifica se estamos na HORA certa (janela = hora inteira)
        const [sendHour] = (reminder.send_time || "09:00").split(":").map(Number);
        if (currentHour !== sendHour) continue;
      }

      // ── Template check ──
      const templateContent = reminder.message_templates?.content;
      const templateName = reminder.message_templates?.name || null;
      if (!templateContent) {
        console.log(`[reminders] "${reminder.name}": sem template, pulando`);
        continue;
      }

      // ── Target due_date ──
      const targetDate = new Date(brasilia);
      targetDate.setDate(targetDate.getDate() - reminder.days_offset);
      const targetDueDate = formatDate(targetDate);

      console.log(`[reminders] "${reminder.name}" (offset=${reminder.days_offset}) → due_date=${targetDueDate}`);

      // ── Profile / WuzAPI ──
      const { data: profile } = await sb
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key, messages_per_minute")
        .eq("user_id", reminder.user_id)
        .single();

      if (!profile?.wuzapi_url || !profile?.wuzapi_token) {
        console.log(`[reminders] "${reminder.name}": sem WuzAPI configurado`);
        continue;
      }

      // ── WhatsApp connected? ──
      try {
        const res = await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/session/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json", Token: profile.wuzapi_token },
        });
        const data = await res.json();
        if (!data?.data?.Connected && !data?.data?.connected) {
          console.log(`[reminders] "${reminder.name}": WhatsApp desconectado`);
          continue;
        }
      } catch (e) {
        console.log(`[reminders] "${reminder.name}": falha ao checar WhatsApp: ${e.message}`);
        continue;
      }

      // ── Fetch clients with matching due_date ──
      const { data: clients } = await sb
        .from("clients")
        .select("*, plans(name)")
        .eq("user_id", reminder.user_id)
        .eq("is_active", true)
        .eq("due_date", targetDueDate)
        .not("whatsapp_number", "is", null);

      if (!clients?.length) {
        console.log(`[reminders] "${reminder.name}": 0 clientes com due_date=${targetDueDate}`);
        if (!isManual) {
          await sb.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
        }
        continue;
      }

      // ══════════════════════════════════════════════════════
      //  DEDUP: quem já recebeu esse lembrete hoje?
      //  Esta é a proteção principal contra:
      //  - Execuções simultâneas (cron overlap)
      //  - Crashes no meio do envio (retoma do ponto certo)
      //  - Duplicatas por qualquer motivo
      // ══════════════════════════════════════════════════════
      const { data: alreadySent } = await sb
        .from("message_logs")
        .select("client_id")
        .eq("reminder_name", reminder.name)
        .eq("status", "sent")
        .gte("sent_at", `${todayStr}T00:00:00`)
        .lt("sent_at", `${todayStr}T23:59:59`);

      const sentIds = new Set((alreadySent || []).map((r: any) => r.client_id));
      const pending = clients.filter((c: any) => !sentIds.has(c.id));

      console.log(`[reminders] "${reminder.name}": ${clients.length} total, ${sentIds.size} já enviados, ${pending.length} pendentes`);

      if (pending.length === 0) {
        // Todos já receberam — marca otimização
        if (!isManual) {
          await sb.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
        }
        continue;
      }

      // ── Config ──
      const delayMs = Math.ceil(60000 / (profile.messages_per_minute || 10));
      const adminId = await getAdminId(sb, reminder.user_id);
      let appUrl = "";
      if (adminId) {
        const { data: s } = await sb
          .from("system_settings").select("value")
          .eq("user_id", adminId).eq("key", "app_url").single();
        appUrl = (s?.value || "").replace(/\/+$/, "");
      }

      // Saudação (calculada uma vez)
      const saudacao = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

      let reminderSent = 0;

      // ── Send loop ──
      for (let i = 0; i < pending.length; i++) {
        const client = pending[i];

        try {
          // Decrypt number
          const rawNumber = await decrypt(client.whatsapp_number, encKey);
          const phone = rawNumber.replace(/\D/g, "");

          // Validate
          if (!phone || phone.length < 10 || phone.length > 15) {
            throw new Error(`Número inválido: "${phone}" (len=${phone.length})`);
          }

          // Build link_pagamento
          let linkPagamento = "";
          if (client.payment_type === "pix" && profile.pix_key) {
            linkPagamento = profile.pix_key;
          } else if (client.payment_token && appUrl) {
            linkPagamento = `${appUrl}/pay/${client.payment_token}`;
          }

          // Format due date
          const dueFormatted = client.due_date
            ? (() => { const [y, m, d] = client.due_date.split("-"); return `${d}/${m}/${y}`; })()
            : "";

          // Days until/since due
          const dias = (() => {
            if (!client.due_date) return "";
            const [y, m, d] = client.due_date.split("-").map(Number);
            const due = new Date(y, m - 1, d);
            const today = new Date(brasilia.getFullYear(), brasilia.getMonth(), brasilia.getDate());
            return String(Math.ceil((due.getTime() - today.getTime()) / 86400000));
          })();

          // Replace variables
          const message = replaceVars(templateContent, {
            nome: client.name || "",
            vencimento: dueFormatted,
            valor: `R$ ${Number(client.price_value || 0).toFixed(2)}`,
            plano: client.plans?.name || "",
            whatsapp: phone,
            link_pagamento: linkPagamento,
            saudacao,
            dias,
          });

          // Send via WuzAPI
          const wuzRes = await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/chat/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Token: profile.wuzapi_token },
            body: JSON.stringify({ Phone: phone, Body: message }),
          });

          if (!wuzRes.ok) {
            const body = await wuzRes.text();
            throw new Error(`WuzAPI ${wuzRes.status}: ${body.substring(0, 150)}`);
          }

          // Success
          reminderSent++;
          totalSent++;
          console.log(`[reminders] ✅ "${client.name}" (${phone})`);

          await logMsg(sb, {
            user_id: reminder.user_id,
            client_id: client.id,
            client_name: client.name,
            whatsapp_number: phone,
            reminder_name: reminder.name,
            template_name: templateName,
            status: "sent",
            error_message: null,
            message_preview: message.substring(0, 200),
          });

        } catch (e) {
          // Falha neste cliente — loga e continua pro próximo
          totalErrors++;
          console.error(`[reminders] ❌ "${client.name}": ${e.message}`);

          await logMsg(sb, {
            user_id: reminder.user_id,
            client_id: client.id,
            client_name: client.name,
            whatsapp_number: null,
            reminder_name: reminder.name,
            template_name: templateName,
            status: "failed",
            error_message: (e.message || "Erro desconhecido").substring(0, 500),
            message_preview: null,
          });
        }

        // Delay entre mensagens (não aplica no último)
        if (i < pending.length - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }

      console.log(`[reminders] "${reminder.name}": ${reminderSent}/${pending.length} enviados nesta execução`);

      // Se TODOS os clientes (originais) já foram enviados, marca otimização
      const totalDone = sentIds.size + reminderSent;
      if (totalDone >= clients.length && !isManual) {
        await sb.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
        console.log(`[reminders] "${reminder.name}": ✅ completo (${totalDone}/${clients.length}), marcado`);
      } else if (!isManual) {
        console.log(`[reminders] "${reminder.name}": ${totalDone}/${clients.length} — pendentes serão retomados na próxima execução`);
      }

      totalSkipped += sentIds.size;
    }

    return respond({
      message: isManual
        ? `Manual: ${totalSent} enviadas, ${totalErrors} erros`
        : `${totalSent} enviadas, ${totalErrors} erros, ${totalSkipped} já enviadas`,
      time: timeStr,
      date: todayStr,
      manual: isManual,
      sent: totalSent,
      errors: totalErrors,
      skipped: totalSkipped,
    });

  } catch (error) {
    console.error(`[reminders] FATAL: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
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
