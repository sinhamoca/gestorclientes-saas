/* ========================================
   SIGMA RENEW HANDLER (+ busca por nome)
   
   Recebe do gateway:
   {
     credentials: { username, password },
     client_id: "sigmaUser123" ou "user1,user2",  ← usernames diretos
     client_name: "João Silva",                    ← busca por nome (note)
     suffix: "tela 1,tela 2",                     ← multi-tela por nome
     telas: 1,
     sigma_domain: "https://painel.exemplo.com",
     sigma_plan_code: "42"
   }
   
   Modos:
   A) client_id → busca direta por username (como antes)
   B) client_name → carrega todos clientes, busca por note (nome)
   C) client_name + suffix → busca "João tela 1", "João tela 2"
   
   IMPORTANTE: No Sigma, package_id já contém a duração (months ignorado).
   ======================================== */

import keeper from './sessionKeeper.js';
import { fetchWorkerConfig } from './settings.js';
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
      suffix,
      telas = 1,
      sigma_domain,
      sigma_plan_code
    } = req.body;
    
    // ── Validações ──
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias' });
    }
    if (!sigma_domain) {
      return res.status(400).json({ success: false, error: 'sigma_domain é obrigatório' });
    }
    if (!client_id && !client_name) {
      return res.status(400).json({ success: false, error: 'client_id (username) ou client_name (nome) obrigatório' });
    }
    if (!sigma_plan_code) {
      return res.status(400).json({ success: false, error: 'sigma_plan_code (package_id) é obrigatório' });
    }
    
    let domain = sigma_domain.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
    const connections = parseInt(telas) || 1;
    
    // ── Determinar modo: por username ou por nome ──
    const searchByName = !client_id && !!client_name;
    
    // Montar lista de buscas
    let searchItems = [];
    
    if (client_id) {
      // Modo username direto (compatibilidade)
      searchItems = String(client_id).split(',').map(u => ({
        value: u.trim(), mode: 'username'
      }));
    } else if (suffix) {
      // Nome + sufixos: "João" + "tela 1,tela 2" → ["João tela 1", "João tela 2"]
      const suffixes = String(suffix).split(',').map(s => s.trim()).filter(s => s.length > 0);
      searchItems = suffixes.map(s => ({
        value: `${client_name} ${s}`.trim(), mode: 'name'
      }));
    } else {
      searchItems = [{ value: client_name, mode: 'name' }];
    }
    
    log(`Renovação: ${domain} | ${searchItems.length} cliente(s) | Mode: ${searchByName ? 'NOME' : 'USERNAME'} | Pkg: ${sigma_plan_code} | Conn: ${connections}`);
    
    // ── Buscar Worker config ──
    const workerConfig = await fetchWorkerConfig(gatewayUrl);
    
    if (!workerConfig.workerUrl || !workerConfig.workerSecret) {
      return res.status(500).json({
        success: false,
        error: 'Cloudflare Worker não configurado. Configure no admin em Configurações > Cloudflare Workers.'
      });
    }
    
    // ── Obter sessão via keeper (com cache de clientes se busca por nome) ──
    const session = await keeper.getSession({
      domain,
      username: credentials.username,
      password: credentials.password,
      workerUrl: workerConfig.workerUrl,
      workerSecret: workerConfig.workerSecret,
      loadClients: searchByName
    });
    
    // ── Processar cada item ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < searchItems.length; i++) {
      const { value, mode } = searchItems[i];
      log(`[${i + 1}/${searchItems.length}] ${mode === 'name' ? `Nome: "${value}"` : `Username: ${value}`}`);
      
      try {
        let customer;
        
        if (mode === 'username') {
          // Busca direta por username via API (como antes)
          customer = await session.findCustomerByUsername(value);
        } else {
          // Busca por nome no cache
          customer = session.findCustomerByName(value);
          
          if (!customer) {
            // Refresh do cache e tentar novamente
            log(`"${value}" não encontrado no cache. Atualizando lista...`, 'WARN');
            const key = keeper.getKey(domain, credentials.username);
            await keeper.refreshCustomers(key);
            customer = session.findCustomerByName(value);
          }
          
          if (!customer) {
            throw new Error(`Cliente "${value}" não encontrado (buscado por nome no campo note)`);
          }
        }
        
        if (!customer?.id) throw new Error('Cliente não tem ID interno');
        
        log(`ID: ${customer.id} | Username: ${customer.username} | Expira: ${customer.expires_at || 'N/A'}`);
        
        // Renovar (1x - package_id já contém duração)
        const result = await session.renewClient(customer.id, sigma_plan_code, connections);
        
        results.push({
          name: value,
          username: customer.username,
          sigma_id: customer.id,
          success: true,
          expires_at: result.expires_at,
          data: result
        });
        totalSuccess++;
        log(`${value} renovado!`, 'OK');
        
      } catch (error) {
        results.push({ name: value, success: false, error: error.message });
        totalFailed++;
        log(`Falha ${value}: ${error.message}`, 'ERROR');
      }
      
      if (searchItems.length > 1 && i < searchItems.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    const responseTime = Date.now() - startTime;
    const sessionInfo = session.getInfo();
    
    if (totalSuccess === searchItems.length) {
      return res.json({
        success: true, provider: 'sigma', domain,
        package_id: sigma_plan_code, connections,
        total: searchItems.length, renewed: totalSuccess,
        results, session: {
          reused: sessionInfo.loginCount > 1,
          loginCount: sessionInfo.loginCount, totalRenewals: sessionInfo.renewCount,
          sessionMinutes: sessionInfo.sessionMinutes,
          clientsCached: session._cachedCustomers?.length || 0
        },
        response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false, partial: true, provider: 'sigma', domain,
        total: searchItems.length, renewed: totalSuccess, failed: totalFailed,
        results, error: `${totalFailed}/${searchItems.length} falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false, provider: 'sigma', domain,
        total: searchItems.length, failed: totalFailed,
        results, error: results[0]?.error || 'Todas as renovações falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    return res.status(500).json({
      success: false, provider: 'sigma', error: error.message,
      response_time_ms: Date.now() - startTime
    });
  }
}
