// ══════════════════════════════════════════════════════════════
//  EDGE FUNCTION: serve-landing-page
//  Arquivo: supabase/functions/serve-landing-page/index.ts
//
//  Rota Nginx: /lp/* → esta função
//  URL de acesso: https://supergestor.pro/lp/SLUG
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Widget JS injetado no HTML do revendedor
// Procura por <div id="gestaopro-widget"></div> e renderiza o formulário
function buildWidgetScript(landingPageId: string, supabaseUrl: string, anonKey: string): string {
  return `
<script>
(function() {
  var LP_ID = "${landingPageId}";
  var API_URL = "${supabaseUrl}/functions/v1/landing-page-widget";
  var ANON_KEY = "${anonKey}";

  function maskWhatsapp(value) {
    var digits = value.replace(/\\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return '(' + digits.slice(0,2) + ') ' + digits.slice(2);
    return '(' + digits.slice(0,2) + ') ' + digits.slice(2,7) + '-' + digits.slice(7,11);
  }

  function render() {
    var el = document.getElementById('gestaopro-widget');
    if (!el) return;

    el.innerHTML = \`
      <div id="gp-form-wrap" style="font-family:sans-serif;max-width:380px;margin:0 auto;">
        <div id="gp-form">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:inherit;">Seu nome</label>
            <input id="gp-name" type="text" placeholder="Digite seu nome" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:14px;box-sizing:border-box;outline:none;" />
          </div>
          <div style="margin-bottom:18px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:inherit;">WhatsApp</label>
            <input id="gp-whatsapp" type="tel" placeholder="(99) 99999-9999" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:14px;box-sizing:border-box;outline:none;" />
          </div>
          <button id="gp-btn" style="width:100%;padding:12px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">
            Quero meu teste grátis
          </button>
          <div id="gp-msg" style="margin-top:12px;font-size:13px;text-align:center;min-height:18px;"></div>
        </div>
      </div>
    \`;

    var nameEl = document.getElementById('gp-name');
    var waEl   = document.getElementById('gp-whatsapp');
    var btn    = document.getElementById('gp-btn');
    var msg    = document.getElementById('gp-msg');

    waEl.addEventListener('input', function() {
      var pos = waEl.selectionStart;
      var raw = waEl.value.replace(/\\D/g, '').slice(0, 11);
      waEl.value = maskWhatsapp(raw);
    });

    btn.addEventListener('click', async function() {
      var name     = nameEl.value.trim();
      var whatsapp = waEl.value.replace(/\\D/g, '');

      if (!name) { msg.style.color = '#ef4444'; msg.textContent = 'Por favor, informe seu nome.'; return; }
      if (whatsapp.length < 10) { msg.style.color = '#ef4444'; msg.textContent = 'WhatsApp inválido.'; return; }

      btn.disabled = true;
      btn.textContent = 'Gerando seu teste...';
      msg.textContent = '';

      try {
        var res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
          body: JSON.stringify({ landing_page_id: LP_ID, name: name, whatsapp: whatsapp })
        });
        var data = await res.json();

        if (data.success) {
          document.getElementById('gp-form-wrap').innerHTML = \`
            <div style="text-align:center;padding:20px 0;">
              <div style="font-size:40px;margin-bottom:12px;">✅</div>
              <h3 style="margin:0 0 8px;font-size:18px;">Teste enviado!</h3>
              <p style="margin:0;font-size:14px;color:#6b7280;">Verifique seu WhatsApp. As credenciais foram enviadas para você.</p>
            </div>
          \`;
        } else if (data.duplicate) {
          msg.style.color = '#f59e0b';
          msg.textContent = 'Você já solicitou um teste nesta página.';
          btn.disabled = false;
          btn.textContent = 'Quero meu teste grátis';
        } else {
          msg.style.color = '#ef4444';
          msg.textContent = data.error || 'Erro ao gerar teste. Tente novamente.';
          btn.disabled = false;
          btn.textContent = 'Quero meu teste grátis';
        }
      } catch(e) {
        msg.style.color = '#ef4444';
        msg.textContent = 'Erro de conexão. Tente novamente.';
        btn.disabled = false;
        btn.textContent = 'Quero meu teste grátis';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
</script>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);

    // Extrai slug: /lp/MEU-SLUG ou ?slug=MEU-SLUG
    let slug = "";
    const pathParts = url.pathname.split("/").filter(Boolean);
    // pathParts pode ser ["lp", "slug"] ou ["serve-landing-page", "lp", "slug"]
    const lpIdx = pathParts.indexOf("lp");
    if (lpIdx !== -1 && pathParts[lpIdx + 1]) {
      slug = pathParts[lpIdx + 1];
    } else {
      slug = url.searchParams.get("slug") || "";
    }

    if (!slug) {
      return new Response("Landing page não encontrada", { status: 404 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar landing page pelo slug
    const { data: lp, error } = await supabase
      .from("landing_pages")
      .select("id, html_content, is_active, name")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !lp) {
      return new Response(`
        <html><body style="font-family:sans-serif;text-align:center;padding:80px 20px;">
          <h2>Página não encontrada</h2>
          <p style="color:#6b7280;">Este link não existe ou foi desativado.</p>
        </body></html>
      `, { status: 404, headers: { "Content-Type": "text/html" } });
    }

    // Decodificar HTML de base64
    let html = "";
    if (lp.html_content) {
      try {
        html = atob(lp.html_content);
      } catch {
        html = lp.html_content; // fallback: já é string plana
      }
    } else {
      html = `<html><body><div id="gestaopro-widget"></div></body></html>`;
    }

    // Injetar widget antes do </body>
    const widgetScript = buildWidgetScript(
      lp.id,
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${widgetScript}\n</body>`);
    } else {
      html = html + widgetScript;
    }

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  } catch (err) {
    return new Response("Erro interno", { status: 500 });
  }
});
