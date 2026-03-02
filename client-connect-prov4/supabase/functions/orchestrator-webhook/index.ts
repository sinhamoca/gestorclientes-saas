// orchestrator-webhook/index.ts
// Recebe webhooks de saída do Orchestrator quando pagamento muda de status.
// Atualiza vencimento do cliente e status do pagamento no GestãoPro.
// Este é o caminho mais confiável (não depende de polling).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
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

    const body = await req.text();
    const payload = JSON.parse(body);

    console.log(`[orchestrator-webhook] Received: event=${payload.event} status=${payload.status} externalId=${payload.externalId}`);

    // Validar payload mínimo
    if (!payload.event || !payload.status) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Missing event or status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só processar eventos de mudança de status
    if (payload.event !== "payment.status_changed") {
      return new Response(JSON.stringify({ status: "ignored", reason: `Event ${payload.event} not handled` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { externalId, paymentId, status, method, gateway, amount, paidAt, payerName, payerEmail } = payload;

    // externalId = payment_token do cliente no GestãoPro
    if (!externalId) {
      return new Response(JSON.stringify({ status: "error", reason: "No externalId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar cliente pelo payment_token (externalId)
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, user_id, name, due_date, plans(duration_days)")
      .eq("payment_token", externalId)
      .single();

    if (clientErr || !client) {
      console.error(`[orchestrator-webhook] Client not found for token: ${externalId}`);
      return new Response(JSON.stringify({ status: "error", reason: "Client not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedStatus = status.toLowerCase();

    // 2. Atualizar registro de pagamento
    await supabase
      .from("payments")
      .update({
        status: normalizedStatus,
        mp_status: normalizedStatus,
      })
      .eq("mp_payment_id", paymentId)
      .eq("client_id", client.id);

    // 3. Se aprovado, renovar o cliente
    if (normalizedStatus === "approved") {
      const durationDays = (client.plans as any)?.duration_days || 30;

      // Calcular nova data de vencimento
      // Se já tem vencimento futuro, soma a partir dele; senão, soma a partir de hoje
      const currentDue = client.due_date ? new Date(client.due_date) : new Date();
      const baseDate = currentDue > new Date() ? currentDue : new Date();
      const newDueDate = new Date(baseDate);
      newDueDate.setDate(newDueDate.getDate() + durationDays);

      await supabase
        .from("clients")
        .update({
          due_date: newDueDate.toISOString().split("T")[0],
          is_active: true,
        })
        .eq("id", client.id);

      console.log(`[orchestrator-webhook] Client ${client.name} renewed until ${newDueDate.toISOString().split("T")[0]} via ${gateway}/${method}`);

      // TODO: Aqui pode chamar a API do painel IPTV pra renovar automaticamente
      // await renewOnIPTVPanel(client, durationDays);
    }

    // 4. Se rejeitado/cancelado, marcar no banco
    if (["rejected", "cancelled", "expired"].includes(normalizedStatus)) {
      console.log(`[orchestrator-webhook] Payment ${normalizedStatus} for client ${client.name}`);
    }

    return new Response(JSON.stringify({
      status: "ok",
      clientId: client.id,
      paymentStatus: normalizedStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[orchestrator-webhook error]", e);
    return new Response(JSON.stringify({ status: "error", message: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
