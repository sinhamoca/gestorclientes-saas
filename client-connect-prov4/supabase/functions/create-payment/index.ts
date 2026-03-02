// create-payment/index.ts
// Cria pagamento via Orchestrator API ao invés de chamar MP/Asaas diretamente.
// O Orchestrator cuida de qual gateway usar baseado no roteamento configurado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { token, method } = await req.json();
    // method: "pix" ou "card" (vindo do frontend)
    const paymentMethod = method === "card" ? "CREDIT_CARD" : "PIX";

    if (!token) {
      return new Response(JSON.stringify({ error: "Token obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar cliente pelo payment_token
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, email, phone, user_id, price_value, payment_token, plans(name)")
      .eq("payment_token", token)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Buscar configuração do Orchestrator do PROFILES do user (dono do cliente)
    const { data: profile } = await supabase
      .from("profiles")
      .select("orchestrator_api_url, orchestrator_api_key")
      .eq("user_id", client.user_id)
      .single();

    if (!profile?.orchestrator_api_url || !profile?.orchestrator_api_key) {
      return new Response(JSON.stringify({
        error: "Gateway de pagamento não configurado. Configure o Orchestrator em Configurações de Pagamento.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = profile.orchestrator_api_url.replace(/\/$/, ""); // Remove trailing slash
    const apiKey = profile.orchestrator_api_key;

    // 3. Chamar Orchestrator API
    const amount = Math.round(Number(client.price_value) * 100); // Converter pra centavos
    const description = `Pagamento - ${client.name}${client.plans?.name ? ` (${client.plans.name})` : ""}`;

    const orchestratorPayload: Record<string, unknown> = {
      method: paymentMethod,
      amount,
      description,
      externalId: client.payment_token, // Referência pro GestãoPro
      idempotencyKey: `gp-${client.id}-${Date.now()}`,
      payer: {
        name: client.name || undefined,
        email: client.email || `client.${client.id}@gestao.local`,
        phone: client.phone || undefined,
      },
    };

    // Se PIX, definir expiração
    if (paymentMethod === "PIX") {
      orchestratorPayload.pix = { expirationMinutes: 30 };
    }

    const orchRes = await fetch(`${apiUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(orchestratorPayload),
    });

    const orchData = await orchRes.json();

    if (!orchRes.ok) {
      console.error("[Orchestrator Error]", orchData);
      return new Response(JSON.stringify({
        error: "Erro ao criar pagamento",
        details: orchData.message || orchData.code || "Erro desconhecido",
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = orchData.data;

    // 4. Salvar registro no banco do GestãoPro
    await supabase.from("payments").insert({
      client_id: client.id,
      user_id: client.user_id,
      amount: client.price_value,
      status: "pending",
      payment_method: method || "pix",
      mp_payment_id: payment.id, // Usar o ID do Orchestrator
      mp_status: payment.status?.toLowerCase() || "pending",
    });

    // 5. Retornar dados pro frontend (mesmo formato que antes)
    return new Response(JSON.stringify({
      pix: {
        qr_code: payment.pixCopiaECola || null,
        qr_code_base64: payment.pixQrCode || null,
        ticket_url: null,
      },
      card: {
        checkout_url: null, // Cartão no Orchestrator é processado direto, não via redirect
        sandbox_url: null,
      },
      payment_id: payment.id, // ID do Orchestrator (usado no polling)
      gateway: payment.gateway || null,
      status: payment.status || "PENDING",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[create-payment error]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
