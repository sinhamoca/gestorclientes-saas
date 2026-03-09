// supabase/functions/asaas-webhook/index.ts
// Processa webhooks do Asaas para pagamentos recorrentes (subscription)
// Usa atomic claim pattern para evitar renovações duplicadas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const body = await req.json();
    console.log("[asaas-webhook] event:", body.event, "| payment:", body.payment?.id);

    // Asaas envia eventos como PAYMENT_CONFIRMED, PAYMENT_RECEIVED, etc.
    const relevantEvents = [
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
    ];

    if (!relevantEvents.includes(body.event)) {
      return new Response(JSON.stringify({ received: true, note: `event ${body.event} ignored` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = body.payment;
    if (!payment?.id) {
      return new Response(JSON.stringify({ received: true, note: "no payment id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só processar pagamentos de subscription (recorrentes)
    if (!payment.subscription) {
      return new Response(JSON.stringify({ received: true, note: "not a subscription payment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── ATOMIC CLAIM: travar o cliente antes de processar ──
    // Busca o cliente pelo subscription_id E garante que não foi processado ainda
    // usando o asaas_subscription_id + um campo de controle no payments
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, user_id, due_date, payment_token, plan_id, asaas_subscription_id, asaas_customer_id, plans(duration_months, panel_credential_id, num_screens, package_id, rush_type, duration_months), username, suffix, name")
      .eq("asaas_subscription_id", payment.subscription)
      .single();

    if (clientErr || !client) {
      // Tentar pelo externalReference
      if (payment.externalReference) {
        const { data: clientByToken } = await supabase
          .from("clients")
          .select("id, user_id, due_date, payment_token, plan_id, asaas_subscription_id, asaas_customer_id, plans(duration_months, panel_credential_id, num_screens, package_id, rush_type, duration_months), username, suffix, name")
          .eq("payment_token", payment.externalReference)
          .single();

        if (!clientByToken) {
          console.error("[asaas-webhook] client not found for subscription:", payment.subscription);
          return new Response(JSON.stringify({ received: true, note: "client not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await processPayment(supabase, payment, clientByToken);
      }

      return new Response(JSON.stringify({ received: true, note: "client not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return await processPayment(supabase, payment, client);

  } catch (e) {
    console.error("[asaas-webhook] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processPayment(supabase: any, payment: any, client: any) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const asaasPaymentId = payment.id;
  const userId = client.user_id;

  // ── ATOMIC CLAIM: tenta inserir o pagamento com status "processing" ──
  // Se já existe um pagamento com esse asaas ID, o insert falha (unique constraint)
  // Isso evita que dois webhooks simultâneos processem o mesmo pagamento
  const { data: insertedPayment, error: insertErr } = await supabase
    .from("payments")
    .insert({
      client_id: client.id,
      user_id: userId,
      amount: payment.value,
      status: "processing", // estado temporário de "travado"
      payment_method: "card",
      mp_payment_id: asaasPaymentId,
      mp_status: "processing",
    })
    .select("id")
    .single();

  if (insertErr) {
    // Já existe — outro processo está tratando ou já tratou
    console.log("[asaas-webhook] payment already claimed:", asaasPaymentId);
    return new Response(JSON.stringify({ received: true, note: "already processed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const paymentDbId = insertedPayment.id;

  try {
    // ── Calcular nova data de vencimento ──
    const plan = client.plans;
    const durationMonths = plan?.duration_months || 1;
    const currentDue = client.due_date
      ? new Date(client.due_date + "T12:00:00")
      : new Date();
    const now = new Date();
    const baseDate = currentDue < now ? now : currentDue;
    baseDate.setMonth(baseDate.getMonth() + durationMonths);

    const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

    // Atualizar cliente
    await supabase
      .from("clients")
      .update({
        due_date: newDue,
        is_active: true,
        asaas_next_billing_date: payment.dueDate || newDue,
      })
      .eq("id", client.id);

    // Atualizar pagamento como pago
    await supabase
      .from("payments")
      .update({ status: "paid", mp_status: "confirmed" })
      .eq("id", paymentDbId);

    // ── Renovação IPTV ──
    try {
      if (plan?.panel_credential_id) {
        const { data: cred } = await supabase
          .from("panel_credentials")
          .select("*")
          .eq("id", plan.panel_credential_id)
          .single();

        if (cred) {
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
                client_name: client.name,
                months: plan.duration_months,
                telas: plan.num_screens || 1,
              };

              if (client.suffix) payload.suffix = client.suffix;
              if (client.username) payload.client_id = client.username;

              switch (cred.provider) {
                case "sigma":
                  payload.sigma_domain = cred.domain;
                  payload.sigma_plan_code = plan.package_id;
                  break;
                case "koffice":
                  payload.koffice_domain = cred.domain;
                  payload.client_id = client.username;
                  break;
                case "painelfoda":
                  payload.painelfoda_domain = cred.domain;
                  payload.painelfoda_package_id = plan.package_id;
                  break;
                case "rush":
                  payload.rush_type = plan.rush_type || "IPTV";
                  break;
                case "club":
                  payload.client_id = client.username;
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
                client_id: client.id,
                type: "renewal",
                status: result.success ? "success" : "error",
                details: result,
              });

              if (!result.success) {
                await supabase.from("renewal_retry_queue").insert({
                  user_id: userId,
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
        }
      }
    } catch (renewErr) {
      console.error("[asaas-webhook] IPTV renewal error:", renewErr);
      // Não falha o webhook por erro de renovação — pagamento já foi registrado
    }

    console.log("[asaas-webhook] ✓ processed payment", asaasPaymentId, "for client", client.id);
    return new Response(JSON.stringify({ received: true, status: "processed", newDueDate: newDue }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    // Rollback: marcar pagamento como erro
    await supabase
      .from("payments")
      .update({ status: "error", mp_status: "error" })
      .eq("id", paymentDbId);

    throw e;
  }
}
