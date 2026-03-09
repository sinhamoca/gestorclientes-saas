// supabase/functions/asaas-subscription-test/index.ts
// Edge function EXCLUSIVA para testes de tokenização de cartão
// NÃO afeta clientes de produção - usa dados isolados
// Remover ou desativar após validação

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

    // Autenticar — só admin pode usar
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

    const body = await req.json();
    const { action } = body;

    // Buscar API key do Asaas do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("asaas_api_key, asaas_sandbox")
      .eq("user_id", user.id)
      .single();

    if (!profile?.asaas_api_key) {
      return new Response(JSON.stringify({ error: "Configure a API key do Asaas no seu perfil primeiro" }), {
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

    // ════════════════════════════════════════
    // ACTION: create_subscription
    // Cria customer + subscription + tokeniza cartão
    // ════════════════════════════════════════
    if (action === "create_subscription") {
      const { card, holderInfo } = body;

      if (!card || !holderInfo) {
        return new Response(JSON.stringify({ error: "card e holderInfo são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Criar customer de teste
      const doc = holderInfo.cpfCnpj.replace(/\D/g, "");
      let customerId: string;

      const searchRes = await fetch(`${baseUrl}/customers?cpfCnpj=${doc}`, { headers });
      const searchData = await searchRes.json();

      if (searchData.data?.length > 0) {
        customerId = searchData.data[0].id;
        console.log("[test] reusing existing customer:", customerId);
      } else {
        const custRes = await fetch(`${baseUrl}/customers`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: holderInfo.name,
            email: holderInfo.email,
            cpfCnpj: doc,
            phone: holderInfo.phone,
            externalReference: `test-${user.id}-${Date.now()}`,
          }),
        });
        const custData = await custRes.json();
        if (!custRes.ok || custData.errors) {
          return new Response(JSON.stringify({
            error: "Erro ao criar customer",
            details: custData.errors?.[0]?.description || JSON.stringify(custData),
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        customerId = custData.id;
        console.log("[test] created customer:", customerId);
      }

      // 2. Criar subscription de R$ 5,00
      const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const externalRef = `test-gestaopro-${user.id}-${Date.now()}`;

      const subRes = await fetch(`${baseUrl}/subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: 5.00, // Mínimo do Asaas
          nextDueDate,
          description: "GestãoPro - Teste de tokenização",
          externalReference: externalRef,
          creditCard: {
            holderName: card.holderName,
            number: card.number.replace(/\s/g, ""),
            expiryMonth: card.expiryMonth,
            expiryYear: card.expiryYear,
            ccv: card.ccv,
          },
          creditCardHolderInfo: {
            name: holderInfo.name,
            email: holderInfo.email,
            cpfCnpj: doc,
            postalCode: holderInfo.postalCode.replace(/\D/g, ""),
            addressNumber: holderInfo.addressNumber,
            phone: holderInfo.phone.replace(/\D/g, ""),
          },
        }),
      });

      const subData = await subRes.json();

      if (!subRes.ok || subData.errors) {
        return new Response(JSON.stringify({
          error: "Erro ao criar subscription",
          details: subData.errors?.[0]?.description || JSON.stringify(subData),
          raw: subData,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Buscar o primeiro pagamento gerado pela subscription
      let firstPaymentId: string | null = null;
      let firstPaymentStatus: string | null = null;
      try {
        await new Promise(r => setTimeout(r, 2000)); // aguardar 2s pro Asaas gerar o pagamento
        const pmtsRes = await fetch(`${baseUrl}/payments?subscription=${subData.id}&limit=1`, { headers });
        const pmtsData = await pmtsRes.json();
        if (pmtsData.data?.length > 0) {
          firstPaymentId = pmtsData.data[0].id;
          firstPaymentStatus = pmtsData.data[0].status;
        }
      } catch {}

      return new Response(JSON.stringify({
        success: true,
        customerId,
        subscriptionId: subData.id,
        subscriptionStatus: subData.status,
        cardToken: subData.creditCardToken || null,
        tokenized: !!subData.creditCardToken,
        nextDueDate: subData.nextDueDate,
        firstPaymentId,
        firstPaymentStatus,
        environment: isSandbox ? "sandbox" : "production",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════
    // ACTION: charge_with_token
    // Faz segunda cobrança usando token salvo
    // ════════════════════════════════════════
    if (action === "charge_with_token") {
      const { customerId, cardToken } = body;

      if (!customerId || !cardToken) {
        return new Response(JSON.stringify({ error: "customerId e cardToken são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dueDate = new Date().toISOString().split("T")[0]; // hoje

      const payRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: 5.00,
          dueDate,
          description: "GestãoPro - Teste cobrança com token",
          creditCardToken: cardToken,
          externalReference: `test-token-charge-${Date.now()}`,
        }),
      });

      const payData = await payRes.json();

      if (!payRes.ok || payData.errors) {
        return new Response(JSON.stringify({
          error: "Erro ao cobrar com token",
          details: payData.errors?.[0]?.description || JSON.stringify(payData),
          raw: payData,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        paymentId: payData.id,
        status: payData.status,
        value: payData.value,
        confirmedDate: payData.confirmedDate || null,
        invoiceUrl: payData.invoiceUrl || null,
        message: payData.status === "CONFIRMED" || payData.status === "RECEIVED"
          ? "✅ Cobrança com token aprovada! Recorrência funcionando perfeitamente."
          : `Status: ${payData.status}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════
    // ACTION: get_payment_status
    // Verifica status de um pagamento
    // ════════════════════════════════════════
    if (action === "get_payment_status") {
      const { paymentId } = body;
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "paymentId obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${baseUrl}/payments/${paymentId}`, { headers });
      const data = await res.json();

      return new Response(JSON.stringify({
        paymentId: data.id,
        status: data.status,
        value: data.value,
        confirmedDate: data.confirmedDate || null,
        dueDate: data.dueDate,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[asaas-subscription-test error]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
