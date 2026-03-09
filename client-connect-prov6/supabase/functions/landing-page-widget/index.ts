// ══════════════════════════════════════════════════════════════
//  EDGE FUNCTION: landing-page-widget
//  Arquivo: supabase/functions/landing-page-widget/index.ts
//
//  Chamado pelo JS injetado na landing page.
//  Fluxo:
//    1. Recebe { landing_page_id, name, whatsapp }
//    2. Criptografa whatsapp
//    3. Verifica deduplicação (1 trial por número por LP)
//    4. Gera trial via iptv-renewal-api
//    5. Salva lead com credenciais
//    6. Envia WhatsApp via message_queue
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Criptografia (igual ao crypto-utils do projeto) ──────────
async function encryptWhatsapp(phone: string): Promise<string> {
  const keyHex = Deno.env.get("ENCRYPTION_KEY") || "";
  const keyBytes = hexToBytes(keyHex.substring(0, 64));
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(phone);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ── Template fixo de mensagem WhatsApp ───────────────────────
function buildWhatsappMessage(name: string, username: string, password: string, provider: string, hours: number): string {
  const providerNames: Record<string, string> = {
    sigma: "Star Play IPTV",
    cloudnation: "CloudNation",
    koffice: "Koffice",
  };
  const providerName = providerNames[provider] || provider;

  return `Olá *${name}*! 🎉

Seu teste gratuito foi gerado com sucesso!

📺 *Servidor:* ${providerName}
👤 *Usuário:* \`${username}\`
🔑 *Senha:* \`${password}\`
⏰ *Válido por:* ${hours}h

Acesse agora e teste à vontade!

_Em caso de dúvidas, entre em contato conosco._ 😊`;
}

// ── Helpers ──────────────────────────────────────────────────
async function getAdminId(supabase: any, userId: string): Promise<string> {
  const { data: role } = await supabase
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "super_admin"]).maybeSingle();
  if (role) return userId;
  const { data: profile } = await supabase
    .from("profiles").select("created_by").eq("user_id", userId).single();
  return profile?.created_by || userId;
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { landing_page_id, name, whatsapp } = await req.json();

    if (!landing_page_id || !whatsapp) {
      return new Response(JSON.stringify({ success: false, error: "Dados obrigatórios ausentes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 1. Buscar landing page ────────────────────────────────
    const { data: lp } = await supabase
      .from("landing_pages")
      .select("*, panel_credentials:panel_credential_id(*)")
      .eq("id", landing_page_id)
      .eq("is_active", true)
      .single();

    if (!lp) {
      return new Response(JSON.stringify({ success: false, error: "Landing page não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2. Criptografar e verificar duplicata ─────────────────
    const waEncrypted = await encryptWhatsapp(whatsapp.replace(/\D/g, ""));

    // Busca leads com mesmo número nessa LP
    // Como o encrypt usa IV aleatório, buscamos por número bruto via função diferente
    // Solução: guardar hash determinístico para dedup + encrypted para armazenar
    const waHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(whatsapp.replace(/\D/g, "") + landing_page_id)
    );
    const waHashHex = Array.from(new Uint8Array(waHash))
      .map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: existing } = await supabase
      .from("landing_page_leads")
      .select("id")
      .eq("landing_page_id", landing_page_id)
      .eq("whatsapp_hash", waHashHex)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: false, duplicate: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 3. Buscar config da API de renovação ──────────────────
    const adminId = await getAdminId(supabase, lp.user_id);
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .eq("user_id", adminId)
      .in("key", ["renewal_api_url", "renewal_api_key"]);

    const apiUrl = settings?.find((s: any) => s.key === "renewal_api_url")?.value;
    const apiKey = settings?.find((s: any) => s.key === "renewal_api_key")?.value;

    if (!apiUrl || !apiKey) {
      return new Response(JSON.stringify({ success: false, error: "API de renovação não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 4. Montar payload do trial ────────────────────────────
    const cred = lp.panel_credentials;
    const trialConfig = lp.trial_config || {};
    const provider = cred?.provider;

    if (!cred || !provider) {
      return new Response(JSON.stringify({ success: false, error: "Painel não configurado na landing page" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const trialPayload: any = {
      provider,
      credentials: { username: cred.username, password: cred.password },
      lead_name: name || "Lead",
      lead_whatsapp: whatsapp.replace(/\D/g, ""),
    };

    switch (provider) {
      case "sigma":
        trialPayload.sigma_domain   = cred.domain;
        trialPayload.server_id      = trialConfig.server_id;
        trialPayload.package_id     = trialConfig.trial_package_id;
        trialPayload.trial_hours    = trialConfig.trial_hours || 1;
        trialPayload.connections    = 1;
        break;
      case "cloudnation":
        trialPayload.plano_id = trialConfig.plano_id || "17";
        break;
      case "koffice":
        // Só credenciais — koffice não precisa de config extra
        break;
    }

    // ── 5. Inserir lead como pending ──────────────────────────
    const { data: lead } = await supabase
      .from("landing_page_leads")
      .insert({
        landing_page_id,
        user_id: lp.user_id,
        name: name || null,
        whatsapp_encrypted: waEncrypted,
        whatsapp_hash: waHashHex,
        provider,
        status: "pending",
      })
      .select("id")
      .single();

    // ── 6. Chamar iptv-renewal-api /trial ─────────────────────
    let trialResult: any = null;
    let trialError = "";

    try {
      const res = await fetch(`${apiUrl}/trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(trialPayload),
        signal: AbortSignal.timeout(90_000),
      });
      trialResult = await res.json();
    } catch (e: any) {
      trialError = e.message || "Timeout";
    }

    const success = trialResult?.success === true && trialResult?.username;

    // ── 7. Atualizar lead com resultado ───────────────────────
    if (lead?.id) {
      await supabase.from("landing_page_leads").update({
        trial_username: success ? trialResult.username : null,
        trial_password: success ? trialResult.password : null,
        status:         success ? "sent" : "failed",
        error_message:  success ? null : (trialResult?.error || trialError),
      }).eq("id", lead.id);
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: trialResult?.error || trialError || "Erro ao gerar trial" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 8. Enfileirar WhatsApp na message_queue ───────────────
    const trialHours = trialConfig.trial_hours || (provider === "cloudnation" ? 3 : 1);
    const message = buildWhatsappMessage(
      name || "cliente",
      trialResult.username,
      trialResult.password,
      provider,
      trialHours
    );

    await supabase.from("message_queue").insert({
      user_id:    lp.user_id,
      to_number:  waEncrypted,
      message,
      source:     "landing_page",
      batch_id:   `lp_${landing_page_id}_${Date.now()}`,
      status:     "pending",
      metadata:   { lead_name: name, landing_page_id, provider },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[landing-page-widget] erro:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
