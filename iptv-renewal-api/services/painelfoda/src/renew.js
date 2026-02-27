import keeper from './sessionKeeper.js';
import { log } from './utils.js';

export async function renewHandler(req, res) {
  const startTime = Date.now();
  
  try {
    if (req.headers['x-gateway-request'] !== 'true') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao gateway' });
    }
    
    const {
      credentials,
      client_name,
      client_id,
      suffix,
      package_id: pkgId,
      painelfoda_package_id,
      painelfoda_domain,
      months = 1,
      telas = 1,
      connections = 1
    } = req.body;
    
    // Aceitar ambos formatos
    const package_id = pkgId || painelfoda_package_id;
    let domain = (credentials?.domain || painelfoda_domain || '').replace(/\/$/, '');
    if (domain && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
    
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias (username, password)' });
    }
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domínio obrigatório (credentials.domain ou painelfoda_domain)' });
    }
    if (!package_id) {
      return res.status(400).json({ success: false, error: 'package_id obrigatório para PainelFoda' });
    }
    if (!client_name && !client_id) {
      return res.status(400).json({ success: false, error: 'client_name ou client_id obrigatório' });
    }
    
    const numConnections = parseInt(connections) || parseInt(telas) || 1;
    const numMonths = parseInt(months) || 1;
    
    // ── Montar lista de buscas ──
    let searchItems = [];
    
    if (client_id) {
      searchItems = String(client_id).split(',').map(id => ({ name: id.trim(), isDirectId: true }));
    } else if (suffix) {
      const suffixes = String(suffix).split(',').map(s => s.trim()).filter(s => s.length > 0);
      searchItems = suffixes.map(s => ({ name: `${client_name} ${s}`.trim(), isDirectId: false }));
    } else {
      searchItems = [{ name: client_name, isDirectId: false }];
    }
    
    log(`Renovação: ${searchItems.length} cliente(s) | pkg: ${package_id} | conn: ${numConnections}`);
    
    // ── Obter sessão via keeper (login + member_id + clientes já em cache) ──
    const session = await keeper.getSession({
      domain,
      username: credentials.username,
      password: credentials.password
    });
    
    // ── Processar cada cliente ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < searchItems.length; i++) {
      const { name, isDirectId } = searchItems[i];
      log(`[${i + 1}/${searchItems.length}] ${isDirectId ? `ID: ${name}` : `Nome: "${name}"`}`);
      
      try {
        let targetId;
        
        if (isDirectId) {
          targetId = name;
        } else {
          const client = session.findClientByName(name);
          if (!client) {
            // Tentar refresh da lista (cliente pode ter sido adicionado recentemente)
            const key = keeper.getKey(domain, credentials.username);
            await keeper.refreshClients(key);
            const retryClient = session.findClientByName(name);
            if (!retryClient) throw new Error(`Cliente "${name}" não encontrado`);
            targetId = retryClient.id;
          } else {
            targetId = client.id;
          }
        }
        
        // Renovar N meses (loop, 1 renew = 1 mês)
        let allOk = true;
        const monthResults = [];
        
        for (let m = 1; m <= numMonths; m++) {
          try {
            const result = await session.renewClient(targetId, package_id, numConnections);
            monthResults.push({ month: m, ...result });
            if (m < numMonths) await new Promise(r => setTimeout(r, 2000));
          } catch (error) {
            monthResults.push({ month: m, success: false, error: error.message });
            allOk = false;
            break;
          }
        }
        
        const completed = monthResults.filter(r => r.success).length;
        results.push({
          name, client_id: targetId, success: allOk, months_renewed: completed,
          details: numMonths > 1 ? monthResults : undefined,
          message: monthResults[monthResults.length - 1]?.message
        });
        
        if (allOk) totalSuccess++; else totalFailed++;
        session._keeperRenewCount = (session._keeperRenewCount || 0) + 1;
        session._keeperLastActivity = Date.now();
        
      } catch (error) {
        results.push({ name, success: false, error: error.message });
        totalFailed++;
        log(`Falha "${name}": ${error.message}`, 'ERROR');
      }
      
      if (searchItems.length > 1 && i < searchItems.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    if (totalSuccess === searchItems.length) {
      return res.json({
        success: true, provider: 'painelfoda', total: searchItems.length,
        renewed: totalSuccess, package_id, results, response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false, partial: true, provider: 'painelfoda',
        total: searchItems.length, renewed: totalSuccess, failed: totalFailed,
        results, error: `${totalFailed}/${searchItems.length} clientes falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false, provider: 'painelfoda', total: searchItems.length,
        failed: totalFailed, results,
        error: results[0]?.error || 'Todas as renovações falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    return res.status(500).json({
      success: false, provider: 'painelfoda', error: error.message,
      response_time_ms: Date.now() - startTime
    });
  }
}
