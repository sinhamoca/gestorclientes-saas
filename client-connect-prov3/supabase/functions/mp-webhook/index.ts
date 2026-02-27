import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: get admin_id for a user
async function getAdminId(supabase: any, userId: string): Promise<string | null> {
  const { data: role } = await supabase
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "super_admin"]).maybeSingle();
  if (role) return userId;
  const { data: profile } = await supabase
    .from("profiles").select("created_by").eq("user_id", userId).single();
  return profile?.created_by || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");

    let paymentId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      if (body.type === "payment" && body.data?.id) paymentId = String(body.data.id);
      if (body.action === "payment.updated" || body.action === "payment.created") paymentId = String(body.data?.id);
      if (body.id && topic === "payment") paymentId = String(body.id);
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: paymentRecord } = await supabase
      .from("payments")
      .select("*, clients(user_id, payment_token, plan_id, due_date, plans(duration_months))")
      .eq("mp_payment_id", paymentId)
      .maybeSingle();

    if (!paymentRecord) {
      return new Response(JSON.stringify({ received: true, note: "payment not found locally" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MP token from owner's profile
    const userId = paymentRecord.clients?.user_id || paymentRecord.user_id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("mercadopago_access_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.mercadopago_access_token) {
      return new Response(JSON.stringify({ error: "No MP token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check payment on MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${profile.mercadopago_access_token}` },
    });
    const mpData = await mpRes.json();

    // Update local payment
    await supabase
      .from("payments")
      .update({
        mp_status: mpData.status,
        status: mpData.status === "approved" ? "paid" : mpData.status,
        payment_method: mpData.payment_method_id || paymentRecord.payment_method,
      })
      .eq("id", paymentRecord.id);

    // If approved, extend due_date and trigger IPTV renewal
    if (mpData.status === "approved") {
      const client = paymentRecord.clients;
      if (client) {
        const durationMonths = client.plans?.duration_months || 1;
        const currentDue = client.due_date ? new Date(client.due_date + "T12:00:00") : new Date();
        const now = new Date();
        const baseDate = currentDue < now ? now : currentDue;
        baseDate.setMonth(baseDate.getMonth() + durationMonths);

        const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

        await supabase
          .from("clients")
          .update({ due_date: newDue, is_active: true })
          .eq("payment_token", client.payment_token);

        // Trigger IPTV renewal
        try {
          const clientId = paymentRecord.client_id;
          const { data: fullClient } = await supabase
            .from("clients")
            .select("*, plans!clients_plan_id_fkey(*, panel_credentials:panel_credential_id(*))")
            .eq("id", clientId)
            .single();

          if (fullClient?.plans?.panel_credential_id) {
            const plan = fullClient.plans;
            const cred = plan.panel_credentials;

            if (cred) {
              // Get admin ID for this user and fetch their API settings
              const adminId = await getAdminId(supabase, userId);

              if (adminId) {
                const { data: settings } = await supabase
                  .from("system_settings")
                  .select("key, value")
                  .eq("user_id", adminId)
                  .in("key", ["renewal_api_url", "renewal_api_key"]);

                const apiUrl = settings?.find((s: any) => s.key === "renewal_api_url")?.value;
                const apiKey = settings?.find((s: any) => s.key === "renewal_api_key")?.value;

                if (apiUrl && apiKey) {
                  const payload: any = {
                    provider: cred.provider,
                    credentials: { username: cred.username, password: cred.password },
                    client_name: fullClient.name,
                    months: plan.duration_months,
                    telas: plan.num_screens || 1,
                  };

                  if (fullClient.suffix) payload.suffix = fullClient.suffix;
                  if (fullClient.username) payload.client_id = fullClient.username;

                  switch (cred.provider) {
                    case "sigma":
                      payload.sigma_domain = cred.domain;
                      payload.sigma_plan_code = plan.package_id;
                      break;
                    case "koffice":
                      payload.koffice_domain = cred.domain;
                      payload.client_id = fullClient.username;
                      break;
                    case "painelfoda":
                      payload.painelfoda_domain = cred.domain;
                      payload.painelfoda_package_id = plan.package_id;
                      break;
                    case "rush":
                      payload.rush_type = plan.rush_type || "IPTV";
                      break;
                    case "club":
                      payload.client_id = fullClient.username;
                      break;
                  }

                  const apiResponse = await fetch(`${apiUrl}/renew`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
                    body: JSON.stringify(payload),
                  });

                  const result = await apiResponse.json();

                  await supabase.from("activity_logs").insert({
                    user_id: userId,
                    client_id: clientId,
                    type: "renewal",
                    status: result.success ? "success" : "error",
                    details: result,
                  });

                  if (!result.success) {
                    await supabase.from("renewal_retry_queue").insert({
                      user_id: userId,
                      client_id: clientId,
                      attempt: 1,
                      next_retry_at: new Date(Date.now() + 5 * 60000).toISOString(),
                      payload,
                      last_error: result.error || "Unknown error",
                      status: "pending",
                    });
                  }
                }
              }
            }
          }
        } catch (renewErr) {
          console.error("IPTV renewal error:", renewErr);
        }
      }
    }

    return new Response(JSON.stringify({ received: true, status: mpData.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
