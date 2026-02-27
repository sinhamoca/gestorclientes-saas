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
      months = 1,
      telas = 1,
      rush_type = 'IPTV'
    } = req.body;
    
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias' });
    }
    if (!client_name && !client_id) {
      return res.status(400).json({ success: false, error: 'client_name ou client_id obrigatório' });
    }
    
    const numMonths = parseInt(months) || 1;
    const screens = parseInt(telas) || 1;
    const planType = (rush_type || 'IPTV').toUpperCase();
    
    // ── Montar lista de nomes ──
    let searchNames = [];
    
    if (client_id) {
      searchNames = String(client_id).split(',').map(id => ({ name: id.trim(), isDirectId: true }));
    } else if (suffix) {
      const suffixes = String(suffix).split(',').map(s => s.trim()).filter(s => s.length > 0);
      searchNames = suffixes.map(s => ({ name: `${client_name} ${s}`.trim(), isDirectId: false }));
    } else {
      searchNames = [{ name: client_name, isDirectId: false }];
    }
    
    log(`Renovação: ${searchNames.length} cliente(s) x ${numMonths}m | Tipo: ${planType}`);
    
    // ── Obter sessão via keeper ──
    const session = await keeper.getSession({
      username: credentials.username,
      password: credentials.password
    });
    
    // ── Processar cada cliente ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < searchNames.length; i++) {
      const { name, isDirectId } = searchNames[i];
      log(`[${i + 1}/${searchNames.length}] ${isDirectId ? `ID: ${name}` : `Nome: "${name}"`}`);
      
      try {
        let clientId, clientSystem;
        
        if (isDirectId) {
          clientId = name;
          clientSystem = planType;
        } else {
          const client = await session.findClientByName(name, planType);
          if (!client) throw new Error(`Cliente "${name}" não encontrado em IPTV nem P2P`);
          clientId = client.id;
          clientSystem = client.system;
        }
        
        const result = await session.renewClient(clientId, numMonths, clientSystem, screens);
        results.push({ ...result, name, system: clientSystem });
        totalSuccess++;
        session._renewCount = (session._renewCount || 0) + 1;
        session._lastActivity = Date.now();
        
      } catch (error) {
        results.push({ success: false, name, error: error.message });
        totalFailed++;
        log(`Falha "${name}": ${error.message}`, 'ERROR');
      }
      
      if (searchNames.length > 1 && i < searchNames.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    if (totalSuccess === searchNames.length) {
      return res.json({
        success: true, provider: 'rush', total: searchNames.length,
        renewed: totalSuccess, months_per_client: numMonths, plan_type: planType,
        results, response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false, partial: true, provider: 'rush',
        total: searchNames.length, renewed: totalSuccess, failed: totalFailed,
        results, error: `${totalFailed}/${searchNames.length} clientes falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false, provider: 'rush', total: searchNames.length,
        failed: totalFailed, results,
        error: results[0]?.error || 'Todas as renovações falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    return res.status(500).json({
      success: false, provider: 'rush', error: error.message,
      response_time_ms: Date.now() - startTime
    });
  }
}
