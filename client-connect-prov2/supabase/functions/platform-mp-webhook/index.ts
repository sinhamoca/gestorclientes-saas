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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { type, data: notifData } = body;

    if (type === "payment" && notifData?.id) {
      const mpPaymentId = String(notifData.id);

      // Find the platform payment to get admin_id
      const { data: platformPayment } = await supabase
        .from("platform_payments")
        .select("*, platform_plans(*)")
        .eq("mp_payment_id", mpPaymentId)
        .maybeSingle();

      if (!platformPayment) {
        // Try by external_reference - search all platform_payments
        // The external_reference is the platform_payment.id
        console.log("Payment not found by mp_payment_id, will try fetching from MP API");

        // We need to find which admin this payment belongs to
        // Search all admins' tokens
        const { data: allTokens } = await supabase
          .from("system_settings")
          .select("user_id, value")
          .eq("key", "admin_mp_access_token");

        for (const tokenRow of (allTokens || [])) {
          try {
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
              headers: { Authorization: `Bearer ${tokenRow.value}` },
            });
            if (mpRes.ok) {
              const mpPayment = await mpRes.json();
              const externalRef = mpPayment.external_reference;
              if (externalRef) {
                await processPayment(supabase, externalRef, mpPayment, tokenRow.value);
              }
              break;
            }
          } catch { /* try next admin */ }
        }

        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Get admin's MP token
      const adminId = platformPayment.admin_id;
      const { data: mpSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("user_id", adminId)
        .eq("key", "admin_mp_access_token")
        .single();

      if (!mpSetting?.value) {
        console.error("Admin MP token not configured for admin:", adminId);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Fetch payment from Mercado Pago
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
        headers: { Authorization: `Bearer ${mpSetting.value}` },
      });
      const mpPayment = await mpRes.json();

      if (!mpRes.ok) {
        console.error("MP fetch error:", mpPayment);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      await processPayment(supabase, platformPayment.id, mpPayment, mpSetting.value);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});

async function processPayment(supabase: any, paymentId: string, mpPayment: any, _mpToken: string) {
  // Update platform payment record
  const { data: updatedPayment } = await supabase
    .from("platform_payments")
    .update({
      mp_payment_id: String(mpPayment.id),
      mp_status: mpPayment.status,
      status: mpPayment.status === "approved" ? "paid" : mpPayment.status,
    })
    .eq("id", paymentId)
    .select("*, platform_plans(*)")
    .single();

  if (!updatedPayment) {
    console.log("Platform payment not found for ref:", paymentId);
    return;
  }

  // If approved, extend user's subscription
  if (mpPayment.status === "approved" && updatedPayment.platform_plans) {
    const plan = updatedPayment.platform_plans;
    const userId = updatedPayment.user_id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_end, max_clients")
      .eq("user_id", userId)
      .single();

    const now = new Date();
    let baseDate = now;
    if (profile?.subscription_end) {
      const subEnd = new Date(profile.subscription_end);
      if (subEnd > now) baseDate = subEnd;
    }

    const newEnd = new Date(baseDate);
    newEnd.setDate(newEnd.getDate() + plan.duration_days);

    await supabase
      .from("profiles")
      .update({
        subscription_end: newEnd.toISOString(),
        is_active: true,
        max_clients: plan.max_clients,
      })
      .eq("user_id", userId);

    console.log(`[platform-webhook] User ${userId} subscription extended to ${newEnd.toISOString()}`);
  }
}
