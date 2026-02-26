import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan_id } = await req.json();
    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the platform plan
    const { data: plan, error: planError } = await supabase
      .from("platform_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The plan belongs to an admin (plan.user_id = admin_id)
    const adminId = plan.user_id;

    // Get admin's MP access token from their settings
    const { data: mpSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("user_id", adminId)
      .eq("key", "admin_mp_access_token")
      .single();

    if (!mpSetting?.value) {
      return new Response(JSON.stringify({ error: "Payment system not configured by admin" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpToken = mpSetting.value;

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("user_id", user.id)
      .single();

    // Create platform payment record (with admin_id)
    const { data: payment, error: paymentError } = await supabase
      .from("platform_payments")
      .insert({
        user_id: user.id,
        admin_id: adminId,
        platform_plan_id: plan.id,
        amount: plan.price,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError) {
      return new Response(JSON.stringify({ error: paymentError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get app_url from admin's settings for webhook
    const { data: appUrlSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("user_id", adminId)
      .eq("key", "app_url")
      .single();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/platform-mp-webhook`;

    // Create MP payment
    const mpBody = {
      transaction_amount: Number(plan.price),
      description: `GestãoPro - ${plan.name}`,
      payment_method_id: "pix",
      payer: {
        email: profile?.email || user.email,
        first_name: profile?.name || "",
      },
      external_reference: payment.id,
      notification_url: webhookUrl,
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`,
        "X-Idempotency-Key": payment.id,
      },
      body: JSON.stringify(mpBody),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      return new Response(JSON.stringify({ error: "MP error", details: mpData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment with MP id
    await supabase
      .from("platform_payments")
      .update({ mp_payment_id: String(mpData.id), mp_status: mpData.status })
      .eq("id", payment.id);

    const pixData = mpData.point_of_interaction?.transaction_data;

    return new Response(JSON.stringify({
      payment_id: payment.id,
      mp_payment_id: mpData.id,
      status: mpData.status,
      qr_code: pixData?.qr_code,
      qr_code_base64: pixData?.qr_code_base64,
      ticket_url: pixData?.ticket_url,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
