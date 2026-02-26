import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payment_id, payment_token } = await req.json();

    if (!payment_id || !payment_token) {
      return new Response(JSON.stringify({ error: "payment_id and payment_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get client to find the owner's MP token
    const { data: client } = await supabase
      .from("clients")
      .select("id, user_id, payment_token")
      .eq("payment_token", payment_token)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("mercadopago_access_token")
      .eq("user_id", client.user_id)
      .maybeSingle();

    if (!profile?.mercadopago_access_token) {
      return new Response(JSON.stringify({ error: "Payment not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check payment status on MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: {
        Authorization: `Bearer ${profile.mercadopago_access_token}`,
      },
    });

    const mpData = await mpRes.json();
    const status = mpData.status || "unknown";
    const statusDetail = mpData.status_detail || "";

    // If approved, update everything
    if (status === "approved") {
      // Check if we already processed this payment (avoid double processing)
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("status")
        .eq("mp_payment_id", String(payment_id))
        .maybeSingle();

      if (existingPayment?.status === "paid") {
        return new Response(JSON.stringify({ status: "approved", status_detail: "already_processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update payment record
      await supabase
        .from("payments")
        .update({ status: "paid", mp_status: status })
        .eq("mp_payment_id", String(payment_id));

      // Get full client with plan info
      const { data: fullClient } = await supabase
        .from("clients")
        .select("*, plans!clients_plan_id_fkey(*, panel_credentials:panel_credential_id(*))")
        .eq("id", client.id)
        .single();

      if (fullClient) {
        // Extend due_date
        const durationMonths = fullClient.plans?.duration_months || 1;
        const currentDue = fullClient.due_date ? new Date(fullClient.due_date + "T12:00:00") : new Date();
        const now = new Date();
        const baseDate = currentDue < now ? now : currentDue;
        baseDate.setMonth(baseDate.getMonth() + durationMonths);

        const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

        await supabase
          .from("clients")
          .update({ due_date: newDue, is_active: true })
          .eq("id", client.id);

        console.log(`[check-payment] Client ${fullClient.name} renewed until ${newDue}`);

        // Trigger IPTV panel renewal if configured
        if (fullClient.plans?.panel_credential_id) {
          try {
            const plan = fullClient.plans;
            const cred = plan.panel_credentials;

            if (cred) {
              const { data: settings } = await supabase
                .from("system_settings")
                .select("key, value")
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
                    payload.painelfoda_package_id = plan.painelfoda_package_id;
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

                // Log activity
                await supabase.from("activity_logs").insert({
                  user_id: client.user_id,
                  client_id: client.id,
                  type: "renewal",
                  status: result.success ? "success" : "error",
                  details: result,
                });

                console.log(`[check-payment] IPTV renewal for ${fullClient.name}: ${result.success ? "OK" : "FAILED"}`);

                // If failed, queue for retry
                if (!result.success) {
                  await supabase.from("renewal_retry_queue").insert({
                    user_id: client.user_id,
                    client_id: client.id,
                    attempt: 1,
                    next_retry_at: new Date(Date.now() + 5 * 60000).toISOString(),
                    payload,
                    last_error: result.error || "Unknown error",
                    status: "pending",
                  });
                }
              }
            }
          } catch (renewErr) {
            console.error("[check-payment] IPTV renewal error:", renewErr);
          }
        }
      }
    }

    return new Response(JSON.stringify({ status, status_detail: statusDetail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
