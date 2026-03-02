// check-payment/index.ts
// Verifica status do pagamento via Orchestrator API.
// Usado pelo PublicPayment.tsx pra polling visual (a cada 5s).

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

    const { payment_id, payment_token } = await req.json();

    if (!payment_id || !payment_token) {
      return new Response(JSON.stringify({ error: "payment_id e payment_token obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar o client pelo token pra pegar o user_id
    const { data: client } = await supabase
      .from("clients")
      .select("id, user_id, name")
      .eq("payment_token", payment_token)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Buscar config do Orchestrator na profiles do user
    const { data: profile } = await supabase
      .from("profiles")
      .select("orchestrator_api_url, orchestrator_api_key")
      .eq("user_id", client.user_id)
      .single();

    if (!profile?.orchestrator_api_url || !profile?.orchestrator_api_key) {
      return new Response(JSON.stringify({ status: "unknown", error: "Orchestrator não configurado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = profile.orchestrator_api_url.replace(/\/$/, "");
    const apiKey = profile.orchestrator_api_key;

    // 3. Consultar status no Orchestrator
    const orchRes = await fetch(`${apiUrl}/payments/${payment_id}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!orchRes.ok) {
      // Tentar sync se o pagamento existir
      const syncRes = await fetch(`${apiUrl}/payments/${payment_id}/sync`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
      });

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const status = syncData.data?.status?.toLowerCase() || "pending";
        return new Response(JSON.stringify({ status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orchData = await orchRes.json();
    const payment = orchData.data;
    const status = payment?.status?.toLowerCase() || "pending";

    // 4. Se aprovado, atualizar no banco do GestãoPro
    if (status === "approved") {
      // Atualizar payment record
      await supabase
        .from("payments")
        .update({ status: "approved", mp_status: "approved" })
        .eq("mp_payment_id", payment_id);

      // Atualizar vencimento do cliente (+30 dias)
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + 30);

      await supabase
        .from("clients")
        .update({
          due_date: newDueDate.toISOString().split("T")[0],
          is_active: true,
        })
        .eq("id", client.id);
    }

    return new Response(JSON.stringify({
      status,
      paymentId: payment?.id,
      gateway: payment?.gateway,
      paidAt: payment?.paidAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[check-payment error]", e);
    return new Response(JSON.stringify({ status: "pending", error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
