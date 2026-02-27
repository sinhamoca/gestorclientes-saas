import { ClubSession } from './clubSession.js';
import { fetchAntiCaptchaKey } from './settings.js';
import { log } from './utils.js';

export async function renewHandler(req, res, gatewayUrl) {
  const startTime = Date.now();
  
  try {
    if (req.headers['x-gateway-request'] !== 'true') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao gateway' });
    }
    
    const {
      credentials,
      client_id,
      client_name,
      months = 1,
      telas = 1
    } = req.body;
    
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias' });
    }
    if (!client_id) {
      return res.status(400).json({ success: false, error: 'client_id obrigatório (ID do Club)' });
    }
    
    const numMonths = parseInt(months) || 1;
    
    // Múltiplos IDs separados por vírgula
    const clientIds = String(client_id).split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    log(`Renovação: ${clientIds.length} cliente(s) x ${numMonths} mês(es) | IDs: ${clientIds.join(', ')}`);
    
    // ── Buscar Anti-Captcha key ──
    const antiCaptchaKey = await fetchAntiCaptchaKey(gatewayUrl);
    
    if (!antiCaptchaKey) {
      return res.status(500).json({
        success: false,
        error: 'Anti-Captcha API Key não configurada. Club requer hCaptcha. Configure no admin em Configurações > Captcha.'
      });
    }
    
    // ── Login (stateless - novo a cada chamada) ──
    const session = new ClubSession({
      username: credentials.username,
      password: credentials.password,
      antiCaptchaKey
    });
    
    await session.login();
    
    // ── Processar cada cliente ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < clientIds.length; i++) {
      const cid = clientIds[i];
      log(`[${i + 1}/${clientIds.length}] Processando: ${cid}`);
      
      try {
        const result = await session.renewClient(cid, numMonths);
        results.push({ ...result, name: client_name });
        totalSuccess++;
        log(`"${cid}" renovado! ${result.new_expiry ? `Expira: ${result.new_expiry}` : ''}`, 'OK');
      } catch (error) {
        results.push({ client_id: cid, success: false, error: error.message });
        totalFailed++;
        log(`Falha "${cid}": ${error.message}`, 'ERROR');
      }
      
      if (clientIds.length > 1 && i < clientIds.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // ── Logout ──
    session.logout();
    
    const responseTime = Date.now() - startTime;
    
    if (totalSuccess === clientIds.length) {
      return res.json({
        success: true,
        provider: 'club',
        total: clientIds.length,
        renewed: totalSuccess,
        months_per_client: numMonths,
        results,
        response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false,
        partial: true,
        provider: 'club',
        total: clientIds.length,
        renewed: totalSuccess,
        failed: totalFailed,
        results,
        error: `${totalFailed}/${clientIds.length} clientes falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false,
        provider: 'club',
        total: clientIds.length,
        failed: totalFailed,
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
      provider: 'club',
      error: error.message,
      response_time_ms: responseTime
    });
  }
}
