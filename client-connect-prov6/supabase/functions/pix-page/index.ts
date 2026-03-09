// pix-page/index.ts
// Página fallback de PIX - retorna HTML puro com QR Code.
// Uso: /functions/v1/pix-page?token=PAYMENT_TOKEN&plan_option_id=OPTIONAL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const planOptionId = url.searchParams.get("plan_option_id") || null;

  if (!token) {
    return htmlResponse(errorPage("Link inválido", "Token de pagamento não informado."));
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Buscar cliente
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, whatsapp_number, user_id, price_value, payment_token, plan_option_id, plans(name)")
      .eq("payment_token", token)
      .single();

    if (clientErr || !client) {
      return htmlResponse(errorPage("Cliente não encontrado", "Este link de pagamento é inválido ou foi removido."));
    }

    // Verificar plan_option para preço
    const optId = planOptionId || client.plan_option_id;
    let price = client.price_value;
    let optLabel = "";

    if (optId) {
      const { data: opt } = await supabase
        .from("plan_options")
        .select("price, label")
        .eq("id", optId)
        .single();
      if (opt?.price) price = opt.price;
      if (opt?.label) optLabel = opt.label;
    }

    // 2. Buscar credenciais do orchestrator
    const { data: profile } = await supabase
      .from("profiles")
      .select("orchestrator_api_url, orchestrator_api_key")
      .eq("user_id", client.user_id)
      .single();

    const apiUrl = (
      profile?.orchestrator_api_url ||
      Deno.env.get("ORCHESTRATOR_API_URL") ||
      ""
    ).replace(/\/$/, "");
    const apiKey = profile?.orchestrator_api_key || "";

    if (!apiUrl || !apiKey) {
      return htmlResponse(errorPage("Pagamento indisponível", "O sistema de pagamento não está configurado."));
    }
    const amount = Math.round(Number(price) * 100);
    const description = "Pagamento de renovação";

    // ═══ DEDUPLICAÇÃO: verificar se já existe pagamento pendente recente (últimos 5 min) ═══
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingPayments } = await supabase
      .from("payments")
      .select("mp_payment_id, created_at")
      .eq("client_id", client.id)
      .eq("status", "pending")
      .eq("payment_method", "pix")
      .eq("amount", price)
      .gte("created_at", fiveMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    let payment: any = null;

    if (existingPayments && existingPayments.length > 0) {
      // Reutilizar pagamento existente — buscar dados do Orchestrator
      const existingId = existingPayments[0].mp_payment_id;
      console.log(`[pix-page] Reusing existing payment ${existingId} for client ${client.name}`);

      try {
        const checkRes = await fetch(`${apiUrl}/payments/${existingId}`, {
          headers: { "X-Api-Key": apiKey },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.data && checkData.data.status?.toUpperCase() === "PENDING") {
            payment = checkData.data;
          }
        }
      } catch {
        // Se falhar ao buscar, cria novo
      }
    }

    // Se não tem pagamento reutilizável, criar novo
    if (!payment) {
      const orchRes = await fetch(`${apiUrl}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({
          method: "PIX",
          amount,
          description,
          externalId: client.payment_token,
          idempotencyKey: `gp-fb-${client.id}-${Date.now()}`,
          payer: {
            name: client.name || undefined,
            email: `client_${client.id}@pagamento.com`,
            phone: client.whatsapp_number || undefined,
          },
          pix: { expirationMinutes: 30 },
          metadata: {
            plan_option_id: optId || null,
          },
        }),
      });

      const orchData = await orchRes.json();

      if (!orchRes.ok) {
        console.error("[pix-page] Orchestrator error:", orchData);
        return htmlResponse(errorPage("Erro ao gerar PIX", orchData.message || "Tente novamente em instantes."));
      }

      payment = orchData.data;

      // Salvar pagamento no banco
      await supabase.from("payments").insert({
        client_id: client.id,
        user_id: client.user_id,
        amount: price,
        status: "pending",
        payment_method: "pix",
        mp_payment_id: payment.id,
        mp_status: "pending",
        plan_option_id: optId || null,
      });

      console.log(`[pix-page] Created new payment ${payment.id} for client ${client.name}`);
    }

    // 5. Retornar página HTML com QR Code
    return htmlResponse(pixPage({
      clientName: client.name,
      planName: client.plans?.name || "",
      amount: Number(price).toFixed(2),
      qrCodeBase64: payment.pixQrCode || null,
      qrCodeText: payment.pixCopiaECola || null,
      paymentId: payment.id,
      checkUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-payment`,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      paymentToken: token,
    }));

  } catch (e: any) {
    console.error("[pix-page] Fatal error:", e);
    return htmlResponse(errorPage("Erro inesperado", e.message));
  }
});

function htmlResponse(html: string) {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin-bottom: 12px; color: #e53e3e; }
    p { font-size: 14px; color: #666; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function pixPage(data: {
  clientName: string;
  planName: string;
  amount: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
  paymentId: string;
  checkUrl: string;
  anonKey: string;
  paymentToken: string;
}) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento PIX - ${data.clientName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { font-size: 18px; color: #333; }
    .header p { font-size: 13px; color: #888; margin-top: 4px; }
    .info { background: #f8f8f8; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 13px; }
    .info-row .label { color: #888; }
    .info-row .value { font-weight: 600; color: #333; }
    .price-box { text-align: center; padding: 16px; background: linear-gradient(135deg, #e8f5e9, #f1f8e9); border-radius: 12px; margin-bottom: 16px; }
    .price-box .amount { font-size: 28px; font-weight: 700; color: #2e7d32; }
    .qr-box { display: flex; justify-content: center; padding: 16px; background: white; border: 2px solid #e0e0e0; border-radius: 12px; margin-bottom: 16px; }
    .qr-box img { width: 200px; height: 200px; }
    .code-box { margin-bottom: 16px; }
    .code-box label { font-size: 12px; color: #888; display: block; text-align: center; margin-bottom: 6px; }
    .code-row { display: flex; gap: 8px; }
    .code-input { flex: 1; padding: 10px; font-size: 11px; font-family: monospace; border: 1px solid #ddd; border-radius: 8px; background: #f8f8f8; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .btn { width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-copy { background: #1976d2; color: white; margin-bottom: 8px; }
    .btn-copy:hover { background: #1565c0; }
    .btn-copy.copied { background: #2e7d32; }
    .status-box { text-align: center; padding: 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; font-weight: 500; }
    .status-waiting { background: #fff3e0; color: #e65100; }
    .status-confirmed { background: #e8f5e9; color: #2e7d32; }
    .footer { text-align: center; font-size: 11px; color: #aaa; margin-top: 12px; }
    .no-qr { text-align: center; padding: 20px; color: #888; font-size: 13px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Pagamento PIX</h1>
      <p>Escaneie o QR Code ou copie o código</p>
    </div>

    <div class="info">
      <div class="info-row">
        <span class="label">Cliente</span>
        <span class="value">${data.clientName}</span>
      </div>
      ${data.planName ? `<div class="info-row"><span class="label">Plano</span><span class="value">${data.planName}</span></div>` : ""}
    </div>

    <div class="price-box">
      <div class="amount">R$ ${data.amount}</div>
    </div>

    <div id="paymentContent">
      ${data.qrCodeBase64
        ? `<div class="qr-box"><img src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code PIX"></div>`
        : '<div class="no-qr">QR Code não disponível</div>'}

      ${data.qrCodeText ? `
      <div class="code-box">
        <label>Código PIX (copia e cola)</label>
        <div class="code-row">
          <input type="text" class="code-input" id="pixCode" value="${data.qrCodeText}" readonly>
        </div>
      </div>
      <button class="btn btn-copy" id="copyBtn" onclick="copyPix()">Copiar código PIX</button>
      ` : ""}
    </div>

    <div id="confirmedContent" class="hidden" style="text-align:center; padding: 24px 0;">
      <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
      <h2 style="color: #2e7d32; font-size: 18px; margin-bottom: 8px;">Pagamento Confirmado!</h2>
      <p style="color: #666; font-size: 13px;">Seu plano foi renovado com sucesso.</p>
    </div>

    <div class="status-box status-waiting" id="statusBox">
      ⏳ Aguardando pagamento...
    </div>

    <div class="footer">
      Abra o app do seu banco e escaneie o QR Code ou cole o código PIX
    </div>
  </div>

  <script>
    function copyPix() {
      var code = document.getElementById('pixCode').value;
      var btn = document.getElementById('copyBtn');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code);
      } else {
        var ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      btn.textContent = '✓ Copiado!';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = 'Copiar código PIX';
        btn.classList.remove('copied');
      }, 3000);
    }

    // Polling para verificar status do pagamento
    var attempts = 0;
    var maxAttempts = 360; // 30 min (5s * 360)
    var confirmed = false;
    var interval = setInterval(function() {
      if (confirmed) return;
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        document.getElementById('statusBox').textContent = '⚠ Tempo esgotado. Recarregue a página para tentar novamente.';
        return;
      }
      fetch('${data.checkUrl}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': '${data.anonKey}' },
        body: JSON.stringify({ payment_id: '${data.paymentId}', payment_token: '${data.paymentToken}' })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.status === 'approved' || d.status === 'APPROVED') {
          confirmed = true;
          clearInterval(interval);
          // Esconder QR/código e mostrar confirmação
          document.getElementById('paymentContent').classList.add('hidden');
          document.getElementById('confirmedContent').classList.remove('hidden');
          var box = document.getElementById('statusBox');
          box.textContent = '✅ Pagamento confirmado! Seu plano foi renovado.';
          box.classList.remove('status-waiting');
          box.classList.add('status-confirmed');
        }
      })
      .catch(function() {});
    }, 5000);
  </script>
</body>
</html>`;
}
