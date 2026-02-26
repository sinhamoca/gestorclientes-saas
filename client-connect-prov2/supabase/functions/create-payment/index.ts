import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payment_token } = await req.json();

    if (!payment_token) {
      return new Response(JSON.stringify({ error: "payment_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get client with plan
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*, plans(name, duration_months)")
      .eq("payment_token", payment_token)
      .maybeSingle();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MP token from the client owner's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("mercadopago_access_token")
      .eq("user_id", client.user_id)
      .maybeSingle();

    const mpToken = profile?.mercadopago_access_token;
    if (!mpToken) {
      return new Response(JSON.stringify({ error: "Payment not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get app_url from system settings
    const { data: appUrlSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "app_url")
      .single();
    const appUrl = (appUrlSetting?.value || req.headers.get("origin") || "").replace(/\/+$/, "");

    // Create PIX payment
    const mpPayload = {
      transaction_amount: Number(client.price_value),
      description: `Pagamento - ${client.name}${client.plans?.name ? ` (${client.plans.name})` : ""}`,
      payment_method_id: "pix",
      payer: {
        email: `client.${client.id}@gestao.pro`,
      },
      external_reference: client.payment_token,
    };

    const pixRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`,
        "X-Idempotency-Key": `pix-${client.payment_token}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify(mpPayload),
    });

    const pixData = await pixRes.json();

    if (!pixRes.ok || pixData.status === "rejected") {
      console.error("[create-payment] PIX error:", JSON.stringify({
        status: pixData.status,
        detail: pixData.status_detail,
        message: pixData.message,
      }));
    }

    // Create checkout preference for card payment
    const prefPayload = {
      items: [{
        title: `Pagamento - ${client.name}${client.plans?.name ? ` (${client.plans.name})` : ""}`,
        quantity: 1,
        unit_price: Number(client.price_value),
        currency_id: "BRL",
      }],
      external_reference: client.payment_token,
      ...(appUrl.startsWith("https") ? {
        back_urls: {
          success: `${appUrl}/pay/${client.payment_token}?status=success`,
          failure: `${appUrl}/pay/${client.payment_token}?status=failure`,
          pending: `${appUrl}/pay/${client.payment_token}?status=pending`,
        },
        auto_return: "approved",
      } : {}),
    };

    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify(prefPayload),
    });

    const prefData = await prefRes.json();

    // Save payment record
    await supabase.from("payments").insert({
      client_id: client.id,
      user_id: client.user_id,
      amount: client.price_value,
      status: "pending",
      payment_method: "pix",
      mp_payment_id: String(pixData.id || ""),
      mp_status: pixData.status || "pending",
    });

    return new Response(JSON.stringify({
      pix: {
        qr_code: pixData.point_of_interaction?.transaction_data?.qr_code || null,
        qr_code_base64: pixData.point_of_interaction?.transaction_data?.qr_code_base64 || null,
        ticket_url: pixData.point_of_interaction?.transaction_data?.ticket_url || null,
      },
      card: {
        checkout_url: prefData.init_point || null,
        sandbox_url: prefData.sandbox_init_point || null,
      },
      payment_id: pixData.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
