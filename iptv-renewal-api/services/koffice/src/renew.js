/* ========================================
   KOFFICE RENEW HANDLER
   
   Agora usa Session Keeper:
   - Primeira chamada: login completo (com captcha se necessário)
   - Chamadas seguintes: reutiliza sessão em memória (~1s)
   - Re-loga automaticamente se sessão expirou
   
   Recebe do gateway:
   {
     credentials: { username, password },
     client_id: "12345" ou "12345,67890" (múltiplos),
     months: 1,
     koffice_domain: "https://painel.exemplo.com"
   }
   ======================================== */

import keeper from './sessionKeeper.js';
import { fetchAntiCaptchaKey } from './settings.js';
import { log } from './utils.js';

export async function renewHandler(req, res, gatewayUrl) {
  const startTime = Date.now();
  
  try {
    // ── Verificar header do gateway ──
    if (req.headers['x-gateway-request'] !== 'true') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao gateway' });
    }
    
    const {
      credentials,
      client_id,
      client_name,
      months = 1,
      koffice_domain
    } = req.body;
    
    // ── Validações ──
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias (username, password)' });
    }
    
    if (!koffice_domain) {
      return res.status(400).json({ success: false, error: 'koffice_domain é obrigatório' });
    }
    
    if (!client_id) {
      return res.status(400).json({ success: false, error: 'client_id é obrigatório' });
    }
    
    let domain = koffice_domain.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
    
    log(`Renovação: ${domain} | Cliente(s): ${client_id} | ${months} mês(es)`);
    
    // ── Buscar chave Anti-Captcha do gateway ──
    let anticaptchaKey = null;
    try {
      anticaptchaKey = await fetchAntiCaptchaKey(gatewayUrl);
      if (anticaptchaKey) {
        log(`Anti-Captcha key carregada (${anticaptchaKey.substring(0, 6)}...)`);
      }
    } catch (e) {
      log(`Falha ao buscar Anti-Captcha key: ${e.message}`, 'WARN');
    }
    
    // ── Obter sessão via keeper (reutiliza se possível) ──
    const session = await keeper.getSession({
      domain,
      username: credentials.username,
      password: credentials.password,
      anticaptchaKey
    });
    
    // ── Processar client_ids ──
    const clientIds = String(client_id)
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
    
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (const cid of clientIds) {
      log(`Renovando cliente ${cid} por ${months} mês(es)...`);
      
      try {
        const result = await session.renewClient(cid, months);
        results.push({ client_id: cid, success: true, data: result });
        totalSuccess++;
        log(`Cliente ${cid} renovado com sucesso!`, 'OK');
      } catch (renewError) {
        results.push({ client_id: cid, success: false, error: renewError.message });
        totalFailed++;
        log(`Falha ao renovar cliente ${cid}: ${renewError.message}`, 'ERROR');
      }
      
      // Delay entre renovações em lote
      if (clientIds.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    // NÃO faz logout — keeper mantém sessão viva!
    
    const responseTime = Date.now() - startTime;
    const sessionInfo = session.getInfo();
    
    // ── Resposta ──
    if (totalSuccess === clientIds.length) {
      return res.json({
        success: true,
        provider: 'koffice',
        domain,
        total: clientIds.length,
        renewed: totalSuccess,
        months,
        results,
        session: {
          reused: sessionInfo.loginCount > 1 || sessionInfo.renewCount > clientIds.length,
          loginCount: sessionInfo.loginCount,
          totalRenewals: sessionInfo.renewCount,
          sessionMinutes: sessionInfo.sessionMinutes
        },
        response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false,
        partial: true,
        provider: 'koffice',
        domain,
        total: clientIds.length,
        renewed: totalSuccess,
        failed: totalFailed,
        months,
        results,
        error: `${totalFailed}/${clientIds.length} clientes falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false,
        provider: 'koffice',
        domain,
        total: clientIds.length,
        failed: totalFailed,
        months,
        results,
        error: results[0]?.error || 'Todas as renovações falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    
    return res.status(500).json({
      success: false,
      provider: 'koffice',
      error: error.message,
      response_time_ms: responseTime
    });
  }
}
