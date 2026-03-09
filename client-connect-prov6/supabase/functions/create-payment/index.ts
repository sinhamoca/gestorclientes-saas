// create-payment/index.ts
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

    const body = await req.json();
    const token = body.token || body.payment_token;
    const method = body.method || body.payment_method;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar cliente pelo payment_token
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, whatsapp_number, user_id, price_value, payment_token, plan_option_id, plans(name)")
      .eq("payment_token", token)
      .single();

    if (clientErr || !client) {
      console.error("[create-payment] Client error:", clientErr);
      return new Response(JSON.stringify({ error: "Cliente não encontrado", details: clientErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar plan_option para preço
    let price = client.price_value;
    const planOptionId = body.plan_option_id || client.plan_option_id;
    if (planOptionId) {
      const { data: opt } = await supabase
        .from("plan_options")
        .select("price")
        .eq("id", planOptionId)
        .single();
      if (opt?.price) price = opt.price;
    }

    // 2. Buscar configuração do Orchestrator (banco tem prioridade, env é fallback)
    const { data: profile } = await supabase
      .from("profiles")
      .select("orchestrator_api_url, orchestrator_api_key")
      .eq("user_id", client.user_id)
      .single();

    const apiUrl = (
      profile?.orchestrator_api_url ||
      Deno.env.get("ORCHESTRATOR_API_URL") ||
      ""
    ).replace(/\/$/, "");

    const apiKey = profile?.orchestrator_api_key || "";

    if (!apiUrl || !apiKey) {
      console.error("[create-payment] Orchestrator não configurado. URL:", apiUrl, "Key:", apiKey ? "presente" : "ausente");
      return new Response(JSON.stringify({
        error: "Gateway de pagamento não configurado. Configure o Orchestrator em Configurações de Pagamento.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Montar payload
    const amount = Math.round(Number(price) * 100);
    const description = "pagamento de renovação";

    const orchestratorPayload: Record<string, unknown> = {
      amount,
      description,
      externalId: client.payment_token,
      idempotencyKey: `gp-${client.id}-${Date.now()}`,
      payer: {
        name: client.name || undefined,
        email: `client_${client.id}@pagamento.com`,
        phone: client.whatsapp_number || undefined,
      },
      metadata: {
        plan_option_id: planOptionId || null,
      },
    };

    if (method === "card") {
      orchestratorPayload.method = "CREDIT_CARD";
      orchestratorPayload.checkout = {
        backUrl: body.back_url || undefined,
        excludedPaymentTypes: ["ticket", "atm"],
        excludedPaymentMethods: ["bolbradesco", "pec"],
      };
    } else {
      orchestratorPayload.method = "PIX";
      orchestratorPayload.pix = { expirationMinutes: 30 };
    }

    console.log("[create-payment] Calling orchestrator:", apiUrl, "method:", method);

    const orchRes = await fetch(`${apiUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "User-Agent": "GestãoPro/1.0",
        "Accept": "application/json",
      },
      body: JSON.stringify(orchestratorPayload),
    });

    const orchText = await orchRes.text();
    let orchData: any;
    try {
      orchData = JSON.parse(orchText);
    } catch {
      console.error("[create-payment] Orchestrator retornou não-JSON:", orchRes.status, orchText.substring(0, 500));
      return new Response(JSON.stringify({
        error: "Erro no gateway de pagamento",
        details: `Status ${orchRes.status} - resposta inválida`,
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orchRes.ok) {
      console.error("[create-payment] Orchestrator error:", orchData);
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
      amount: price,
      status: "pending",
      payment_method: method === "card" ? "credit_card" : "pix",
      mp_payment_id: payment.id,
      mp_status: payment.status?.toLowerCase() || "pending",
      plan_option_id: planOptionId || null,
    });

    // 5. Retornar dados pro frontend
    return new Response(JSON.stringify({
      pix: {
        qr_code: payment.pixCopiaECola || null,
        qr_code_base64: payment.pixQrCode || null,
        ticket_url: null,
      },
      checkout_url: payment.checkoutUrl || null,
      payment_id: payment.id,
      gateway: payment.gateway || null,
      status: payment.status || "PENDING",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[create-payment] Fatal error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
