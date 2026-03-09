// supabase/functions/asaas-create-subscription/index.ts
// Cria customer no Asaas + subscription com cartão + armazena token no cliente

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Autenticar usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      clientId,
      card, // { holderName, number, expiryMonth, expiryYear, ccv }
      holderInfo, // { name, email, cpfCnpj, postalCode, addressNumber, phone }
    } = await req.json();

    if (!clientId || !card || !holderInfo) {
      return new Response(JSON.stringify({ error: "clientId, card e holderInfo são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar cliente
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, email, phone, user_id, price_value, payment_token, plan_id, asaas_customer_id")
      .eq("id", clientId)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar permissão (o user logado deve ser dono do cliente)
    const adminId = await getAdminId(supabase, user.id);
    if (client.user_id !== user.id && client.user_id !== adminId) {
      return new Response(JSON.stringify({ error: "Sem permissão para este cliente" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar API key do Asaas do perfil do dono
    const { data: profile } = await supabase
      .from("profiles")
      .select("asaas_api_key, asaas_sandbox")
      .eq("user_id", client.user_id)
      .single();

    if (!profile?.asaas_api_key) {
      return new Response(JSON.stringify({ error: "API key do Asaas não configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSandbox = profile.asaas_sandbox === true;
    const baseUrl = isSandbox
      ? "https://api-sandbox.asaas.com/v3"
      : "https://api.asaas.com/v3";
    const headers = {
      "Content-Type": "application/json",
      "access_token": profile.asaas_api_key,
    };

    // ── 1. Criar ou reutilizar customer no Asaas ──
    let customerId = client.asaas_customer_id;

    if (!customerId) {
      const doc = holderInfo.cpfCnpj.replace(/\D/g, "");

      // Tentar buscar pelo CPF/CNPJ primeiro
      const searchRes = await fetch(`${baseUrl}/customers?cpfCnpj=${doc}`, { headers });
      const searchData = await searchRes.json();

      if (searchData.data?.length > 0) {
        customerId = searchData.data[0].id;
      } else {
        // Criar novo customer
        const custRes = await fetch(`${baseUrl}/customers`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: holderInfo.name || client.name,
            email: holderInfo.email || client.email || `client.${client.id}@gestao.local`,
            cpfCnpj: doc,
            phone: holderInfo.phone || client.phone,
            externalReference: client.payment_token,
          }),
        });
        const custData = await custRes.json();
        if (!custRes.ok || custData.errors) {
          return new Response(JSON.stringify({
            error: "Erro ao criar customer no Asaas",
            details: custData.errors?.[0]?.description || JSON.stringify(custData),
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        customerId = custData.id;
      }

      // Salvar customer_id no cliente
      await supabase.from("clients").update({ asaas_customer_id: customerId }).eq("id", clientId);
    }

    // ── 2. Criar subscription com cartão ──
    const amount = Number(client.price_value);
    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // amanhã

    const subRes = await fetch(`${baseUrl}/subscriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: amount,
        nextDueDate,
        description: `GestãoPro - Plano recorrente`,
        externalReference: client.payment_token,
        creditCard: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: holderInfo.name,
          email: holderInfo.email || client.email || `client.${client.id}@gestao.local`,
          cpfCnpj: holderInfo.cpfCnpj.replace(/\D/g, ""),
          postalCode: holderInfo.postalCode?.replace(/\D/g, "") || "00000000",
          addressNumber: holderInfo.addressNumber || "S/N",
          phone: holderInfo.phone || client.phone || "00000000000",
        },
      }),
    });

    const subData = await subRes.json();

    if (!subRes.ok || subData.errors) {
      return new Response(JSON.stringify({
        error: "Erro ao criar subscription no Asaas",
        details: subData.errors?.[0]?.description || JSON.stringify(subData),
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cardToken = subData.creditCardToken;
    const subscriptionId = subData.id;

    // ── 3. Salvar dados no cliente ──
    await supabase.from("clients").update({
      asaas_subscription_id: subscriptionId,
      asaas_card_token: cardToken,
      asaas_subscription_status: "active",
      asaas_next_billing_date: subData.nextDueDate || nextDueDate,
      payment_type: "recurrent_card",
    }).eq("id", clientId);

    // ── 4. Registrar pagamento inicial ──
    await supabase.from("payments").insert({
      client_id: clientId,
      user_id: client.user_id,
      amount: client.price_value,
      status: "pending",
      payment_method: "card",
      mp_payment_id: `asaas_sub_${subscriptionId}`,
      mp_status: "pending",
    });

    return new Response(JSON.stringify({
      success: true,
      subscriptionId,
      cardToken: cardToken ? "✓ tokenizado" : "não retornado",
      nextDueDate: subData.nextDueDate,
      status: subData.status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[asaas-create-subscription error]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
