/* ========================================
   CLOUDNATION RENEW HANDLER (+ busca por nome)
   
   Recebe do gateway:
   {
     credentials: { username, password },
     client_id: "789134030" ou "id1,id2",    ← IDs diretos
     client_name: "João Silva",               ← busca por nome (scraping)
     suffix: "tela 1,tela 2",                ← multi-tela por nome
     months: 3,
     telas: 1
   }
   
   Modos:
   A) client_id → ID direto (como antes)
   B) client_name → scrapa lista, busca por nome
   C) client_name + suffix → busca "João tela 1", "João tela 2"
   
   1 renovação = 1 mês (loop para multi-mês)
   ======================================== */

import keeper from './sessionKeeper.js';
import { fetch2CaptchaKey } from './settings.js';
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
      months = 1,
      telas = 1
    } = req.body;
    
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias' });
    }
    if (!client_id && !client_name) {
      return res.status(400).json({ success: false, error: 'client_id ou client_name obrigatório' });
    }
    
    const numMonths = parseInt(months) || 1;
    const searchByName = !client_id && !!client_name;
    
    // Montar lista de buscas
    let searchItems = [];
    
    if (client_id) {
      // IDs diretos (compatibilidade)
      searchItems = String(client_id).split(',').map(id => ({
        value: id.trim(), mode: 'id'
      }));
    } else if (suffix) {
      const suffixes = String(suffix).split(',').map(s => s.trim()).filter(s => s.length > 0);
      searchItems = suffixes.map(s => ({
        value: `${client_name} ${s}`.trim(), mode: 'name'
      }));
    } else {
      searchItems = [{ value: client_name, mode: 'name' }];
    }
    
    log(`Renovação: ${searchItems.length} cliente(s) x ${numMonths}m | Mode: ${searchByName ? 'NOME' : 'ID'}`);
    
    // ── Buscar 2Captcha key ──
    const apiKey2captcha = await fetch2CaptchaKey(gatewayUrl);
    
    if (!apiKey2captcha) {
      return res.status(500).json({
        success: false,
        error: '2Captcha API Key não configurada. Configure no admin em Configurações > Captcha.'
      });
    }
    
    // ── Obter sessão via keeper (com cache de clientes se busca por nome) ──
    const session = await keeper.getSession({
      username: credentials.username,
      password: credentials.password,
      apiKey2captcha,
      loadClients: searchByName
    });
    
    // ── Processar cada cliente ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < searchItems.length; i++) {
      const { value, mode } = searchItems[i];
      log(`[${i + 1}/${searchItems.length}] ${mode === 'name' ? `Nome: "${value}"` : `ID: ${value}`}`);
      
      let userId;
      
      // Resolver ID
      if (mode === 'id') {
        userId = value;
      } else {
        // Buscar por nome no cache
        let client = session.findClientByName(value);
        
        if (!client) {
          // Refresh e tentar novamente
          log(`"${value}" não encontrado no cache. Atualizando lista...`, 'WARN');
          const key = keeper.getKey(credentials.username);
          await keeper.refreshClients(key);
          client = session.findClientByName(value);
        }
        
        if (!client) {
          results.push({ name: value, success: false, error: `Cliente "${value}" não encontrado` });
          totalFailed++;
          log(`"${value}" não encontrado`, 'ERROR');
          continue;
        }
        
        userId = client.id;
        log(`"${value}" → ID ${userId}`);
      }
      
      // Renovar N meses (loop)
      const monthResults = [];
      let allMonthsOk = true;
      
      for (let m = 1; m <= numMonths; m++) {
        try {
          if (numMonths > 1) log(`  Mês ${m}/${numMonths}...`);
          const result = await session.renewUser(userId);
          monthResults.push({ month: m, success: true, message: result.message });
          if (m < numMonths) await new Promise(r => setTimeout(r, 2000));
        } catch (error) {
          monthResults.push({ month: m, success: false, error: error.message });
          allMonthsOk = false;
          log(`  Mês ${m} falhou: ${error.message}`, 'ERROR');
          break;
        }
      }
      
      const completed = monthResults.filter(r => r.success).length;
      
      if (allMonthsOk) {
        results.push({ name: value, userId, success: true, months_renewed: completed, details: monthResults });
        totalSuccess++;
        log(`${value}: ${completed}/${numMonths} meses OK`, 'OK');
      } else {
        results.push({ name: value, userId, success: false, months_renewed: completed, months_failed: numMonths - completed, details: monthResults });
        totalFailed++;
      }
      
      if (searchItems.length > 1 && i < searchItems.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    const responseTime = Date.now() - startTime;
    const sessionInfo = session.getInfo();
    
    if (totalSuccess === searchItems.length) {
      return res.json({
        success: true, provider: 'cloudnation',
        total: searchItems.length, renewed: totalSuccess, months_per_client: numMonths,
        results, session: {
          reused: sessionInfo.loginCount > 1,
          loginCount: sessionInfo.loginCount, totalRenewals: sessionInfo.renewCount,
          sessionMinutes: sessionInfo.sessionMinutes,
          clientsCached: sessionInfo.clientsCached
        },
        response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false, partial: true, provider: 'cloudnation',
        total: searchItems.length, renewed: totalSuccess, failed: totalFailed,
        results, error: `${totalFailed}/${searchItems.length} clientes falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false, provider: 'cloudnation',
        total: searchItems.length, failed: totalFailed,
        results, error: results[0]?.details?.[0]?.error || results[0]?.error || 'Todas falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    return res.status(500).json({
      success: false, provider: 'cloudnation', error: error.message,
      response_time_ms: Date.now() - startTime
    });
  }
}
