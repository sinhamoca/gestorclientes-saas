/* ========================================
   UNIPLAY RENEW HANDLER (SEM KEEPER)
   
   Cada chamada: login → busca → renova → logout
   
   Recebe do gateway:
   {
     credentials: { username, password },
     client_name: "João Silva",
     client_id: "João Silva",
     suffix: "TV,Cel,PC",
     months: 1,
     telas: 3
   }
   ======================================== */

import { UniplaySession } from './uniplaySession.js';
import { fetchProxyConfig } from './settings.js';
import { log } from './utils.js';
import tracker from './bandwidthTracker.js';

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
    
    const baseName = client_name || client_id;
    if (!baseName) {
      return res.status(400).json({ success: false, error: 'client_name é obrigatório para Uniplay (busca por nome)' });
    }
    
    const credits = parseInt(months) || 1;
    
    // ── Montar lista de nomes ──
    let searchNames = [];
    
    if (suffix && suffix.trim().length > 0) {
      const suffixes = suffix.split(',').map(s => s.trim()).filter(s => s.length > 0);
      searchNames = suffixes.map(s => `${baseName} ${s}`);
      log(`Multi-tela com sufixos: ${searchNames.length} tela(s)`);
    } else if (parseInt(telas) > 1 && client_id && client_id.includes(',')) {
      searchNames = client_id.split(',').map(n => n.trim()).filter(n => n.length > 0);
    } else {
      searchNames = [baseName];
    }
    
    log(`Renovação: ${searchNames.length} tela(s) | ${credits} crédito(s) cada | Nomes: ${searchNames.join(', ')}`);
    
    // ── Buscar proxy config ──
    const proxyConfig = await fetchProxyConfig(gatewayUrl);
    
    if (!proxyConfig?.host) {
      return res.status(500).json({
        success: false,
        error: 'Proxy SOCKS5 não configurado. Uniplay requer proxy brasileiro. Configure no admin em Configurações > Proxy.'
      });
    }
    
    log(`Proxy: ${proxyConfig.host}:${proxyConfig.port}`);
    
    // ── Criar sessão e logar ──
    const session = new UniplaySession({
      username: credentials.username,
      password: credentials.password,
      proxyConfig
    });
    
    await session.login();
    log('Login realizado!', 'OK');
    
    // ── Processar cada nome/tela ──
    const results = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < searchNames.length; i++) {
      const name = searchNames[i];
      log(`[${i + 1}/${searchNames.length}] Processando: "${name}"`);
      
      try {
        const client = await session.findClientByName(name);
        log(`Encontrado: ID ${client.id} | Tipo: ${client.serviceType}`);
        
        const result = await session.renewClient(client.id, client.serviceType, credits);
        
        results.push({
          name,
          uniplay_id: client.id,
          service_type: client.serviceType,
          success: true,
          new_expiry: result.new_expiry || null,
          data: result
        });
        totalSuccess++;
        log(`"${name}" renovado! ${result.new_expiry ? `Expiração: ${result.new_expiry}` : ''}`, 'OK');
        
      } catch (error) {
        results.push({ name, success: false, error: error.message });
        totalFailed++;
        log(`Falha "${name}": ${error.message}`, 'ERROR');
      }
      
      if (searchNames.length > 1 && i < searchNames.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    
    // ── Logout ──
    await session.logout();
    
    const responseTime = Date.now() - startTime;
    const bw = tracker.getUserStats(credentials.username);
    
    if (totalSuccess === searchNames.length) {
      return res.json({
        success: true,
        provider: 'uniplay',
        total: searchNames.length,
        renewed: totalSuccess,
        credits_per_screen: credits,
        results,
        bandwidth: bw,
        response_time_ms: responseTime
      });
    } else if (totalSuccess > 0) {
      return res.json({
        success: false,
        partial: true,
        provider: 'uniplay',
        total: searchNames.length,
        renewed: totalSuccess,
        failed: totalFailed,
        results,
        bandwidth: bw,
        error: `${totalFailed}/${searchNames.length} telas falharam`,
        response_time_ms: responseTime
      });
    } else {
      return res.status(422).json({
        success: false,
        provider: 'uniplay',
        total: searchNames.length,
        failed: totalFailed,
        results,
        bandwidth: bw,
        error: results[0]?.error || 'Todas as renovações falharam',
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    log(`ERRO CRÍTICO: ${error.message}`, 'ERROR');
    return res.status(500).json({
      success: false,
      provider: 'uniplay',
      error: error.message,
      response_time_ms: responseTime
    });
  }
}
