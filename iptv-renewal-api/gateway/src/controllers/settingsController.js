/* ========================================
   SETTINGS CONTROLLER
   
   Gerencia configurações globais do sistema:
   - Chaves de captcha (2Captcha, Anti-Captcha)
   - Proxy residencial (host, porta, auth)
   - Cloudflare Workers (URLs, secrets)
   
   CORREÇÕES:
   - Valores mascarados (••••) NUNCA sobrescrevem o real
   - 2Captcha usa API v2 para consultar saldo
   - Proxy SOCKS5 usa socks-proxy-agent
   ======================================== */

import { query } from '../config/database.js';
import { successResponse, errorResponse } from '../utils/helpers.js';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

// ========================================
// LISTAR TODAS AS CONFIGURAÇÕES
// GET /api/v1/admin/settings
// ========================================
export async function getSettings(req, res) {
  try {
    const result = await query(`
      SELECT key, value, description, category, is_secret, updated_at
      FROM system_settings
      ORDER BY category, key
    `);
    
    // Mascarar valores secretos
    const settings = result.rows.map(s => ({
      ...s,
      value: s.is_secret && s.value ? maskSecret(s.value) : s.value
    }));
    
    // Agrupar por categoria
    const grouped = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
    
    return successResponse(res, { settings: grouped });
  } catch (error) {
    console.error('❌ Erro ao buscar settings:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// ATUALIZAR UMA CONFIGURAÇÃO
// PUT /api/v1/admin/settings
// Body: { key, value }
// ========================================
export async function updateSetting(req, res) {
  try {
    const { key, value } = req.body;
    
    if (!key) {
      return errorResponse(res, 'Key é obrigatória');
    }
    
    // Verificar se é campo secreto sendo atualizado com valor mascarado
    const existing = await query('SELECT is_secret, value FROM system_settings WHERE key = $1', [key]);
    
    if (existing.rows.length === 0) {
      return errorResponse(res, `Configuração "${key}" não encontrada`, 404);
    }
    
    const setting = existing.rows[0];
    
    // Se é secreto e o valor contém caracteres de máscara, ignorar (não sobrescrever)
    if (setting.is_secret && value && value.includes('•')) {
      return successResponse(res, {
        message: `Configuração "${key}" não alterada (valor mascarado detectado)`,
        setting: { key, value: maskSecret(setting.value) }
      });
    }
    
    const result = await query(`
      UPDATE system_settings 
      SET value = $2, updated_at = NOW()
      WHERE key = $1
      RETURNING key, description, category, is_secret
    `, [key, value || '']);
    
    const updated = result.rows[0];
    
    return successResponse(res, {
      message: `Configuração "${key}" atualizada`,
      setting: {
        ...updated,
        value: updated.is_secret ? maskSecret(value) : value
      }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar setting:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// ATUALIZAR MÚLTIPLAS CONFIGURAÇÕES
// PUT /api/v1/admin/settings/bulk
// Body: { settings: [{ key, value }, ...] }
// ========================================
export async function updateSettingsBulk(req, res) {
  try {
    const { settings } = req.body;
    
    if (!settings || !Array.isArray(settings)) {
      return errorResponse(res, 'Envie um array de settings');
    }
    
    const updated = [];
    const skipped = [];
    
    for (const { key, value } of settings) {
      if (!key) continue;
      
      // Verificar se é secreto com valor mascarado
      const existing = await query('SELECT is_secret, value FROM system_settings WHERE key = $1', [key]);
      
      if (existing.rows.length === 0) continue;
      
      const setting = existing.rows[0];
      
      // Pular campos secretos com valor mascarado
      if (setting.is_secret && value && value.includes('•')) {
        skipped.push(key);
        continue;
      }
      
      const result = await query(`
        UPDATE system_settings 
        SET value = $2, updated_at = NOW()
        WHERE key = $1
        RETURNING key
      `, [key, value || '']);
      
      if (result.rows.length > 0) {
        updated.push(key);
      }
    }
    
    return successResponse(res, {
      message: `${updated.length} configurações atualizadas${skipped.length ? `, ${skipped.length} não alteradas (mascaradas)` : ''}`,
      updated,
      skipped
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar settings:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// TESTAR PROXY
// POST /api/v1/admin/settings/test-proxy
// Suporta HTTP, HTTPS e SOCKS5
// ========================================
export async function testProxy(req, res) {
  try {
    const proxyConfig = await getProxyConfig();
    
    if (!proxyConfig.host || !proxyConfig.port) {
      return errorResponse(res, 'Proxy não configurado. Preencha host e porta.');
    }
    
    const protocol = proxyConfig.protocol || 'socks5';
    const startTime = Date.now();
    
    try {
      let response;
      
      if (protocol === 'socks5' || protocol === 'socks4') {
        // ── SOCKS5 via socks-proxy-agent ──
        const auth = proxyConfig.username 
          ? `${proxyConfig.username}:${proxyConfig.password || ''}@` 
          : '';
        const proxyUrl = `${protocol}://${auth}${proxyConfig.host}:${proxyConfig.port}`;
        
        const agent = new SocksProxyAgent(proxyUrl);
        
        response = await axios.get('https://api.ipify.org?format=json', {
          httpAgent: agent,
          httpsAgent: agent,
          timeout: 15000,
          proxy: false  // Desabilitar proxy padrão do axios
        });
        
      } else {
        // ── HTTP/HTTPS proxy padrão ──
        response = await axios.get('https://api.ipify.org?format=json', {
          proxy: {
            protocol,
            host: proxyConfig.host,
            port: parseInt(proxyConfig.port),
            auth: proxyConfig.username ? {
              username: proxyConfig.username,
              password: proxyConfig.password || ''
            } : undefined
          },
          timeout: 15000
        });
      }
      
      const responseTime = Date.now() - startTime;
      
      return successResponse(res, {
        status: 'online',
        ip: response.data.ip,
        response_time_ms: responseTime,
        proxy_url: `${protocol}://${proxyConfig.host}:${proxyConfig.port}`,
        message: `Proxy funcionando! IP: ${response.data.ip} (${responseTime}ms)`
      });
      
    } catch (proxyError) {
      const responseTime = Date.now() - startTime;
      
      return successResponse(res, {
        status: 'offline',
        response_time_ms: responseTime,
        proxy_url: `${protocol}://${proxyConfig.host}:${proxyConfig.port}`,
        error: proxyError.code || proxyError.message,
        message: `Proxy offline ou inacessível: ${proxyError.code || proxyError.message}`
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar proxy:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// TESTAR CHAVE DE CAPTCHA
// POST /api/v1/admin/settings/test-captcha
// Body: { service: "2captcha" | "anticaptcha" }
// ========================================
export async function testCaptcha(req, res) {
  try {
    const { service } = req.body;
    
    if (!service || !['2captcha', 'anticaptcha'].includes(service)) {
      return errorResponse(res, 'Serviço deve ser "2captcha" ou "anticaptcha"');
    }
    
    const keyName = service === '2captcha' ? 'captcha_2captcha_key' : 'captcha_anticaptcha_key';
    const result = await query('SELECT value FROM system_settings WHERE key = $1', [keyName]);
    
    const apiKey = result.rows[0]?.value;
    
    if (!apiKey) {
      return errorResponse(res, `Chave ${service} não configurada`);
    }
    
    // Verificar se não é valor mascarado
    if (apiKey.includes('•')) {
      return errorResponse(res, `Chave ${service} contém valor inválido (mascarado). Salve a chave novamente.`);
    }
    
    const startTime = Date.now();
    
    try {
      if (service === '2captcha') {
        // ── 2Captcha - API v2 (nova) + fallback v1 ──
        let balance = null;
        
        // Tentar API nova primeiro
        try {
          const v2Response = await axios.post('https://api.2captcha.com/getBalance', {
            clientKey: apiKey
          }, { timeout: 10000 });
          
          if (v2Response.data && v2Response.data.errorId === 0) {
            balance = v2Response.data.balance;
          }
        } catch (e) {
          // Fallback silencioso
        }
        
        // Fallback: API legada
        if (balance === null) {
          const legacyResponse = await axios.get(
            `https://2captcha.com/res.php?key=${apiKey}&action=getbalance&json=1`, 
            { timeout: 10000 }
          );
          const data = legacyResponse.data;
          
          // A API legada pode retornar o saldo em data.request (string) ou direto como número
          if (data.status === 1) {
            balance = parseFloat(data.request);
          } else if (typeof data === 'string') {
            balance = parseFloat(data);
          } else if (data.request && !isNaN(parseFloat(data.request))) {
            balance = parseFloat(data.request);
          } else {
            const responseTime = Date.now() - startTime;
            return successResponse(res, {
              status: 'error',
              service: '2captcha',
              error: data.error_text || data.request || 'Resposta inesperada',
              response_time_ms: responseTime,
              message: `Erro: ${data.error_text || data.request || JSON.stringify(data)}`
            });
          }
        }
        
        const responseTime = Date.now() - startTime;
        balance = balance || 0;
        
        return successResponse(res, {
          status: 'ok',
          service: '2captcha',
          balance: `$${balance.toFixed(2)}`,
          response_time_ms: responseTime,
          message: `2Captcha ativo! Saldo: $${balance.toFixed(2)}`
        });
        
      } else {
        // ── Anti-Captcha ──
        const balanceResponse = await axios.post('https://api.anti-captcha.com/getBalance', { 
          clientKey: apiKey 
        }, { timeout: 10000 });
        
        const data = balanceResponse.data;
        const responseTime = Date.now() - startTime;
        
        if (data.errorId === 0) {
          return successResponse(res, {
            status: 'ok',
            service: 'Anti-Captcha',
            balance: `$${data.balance.toFixed(2)}`,
            response_time_ms: responseTime,
            message: `Anti-Captcha ativo! Saldo: $${data.balance.toFixed(2)}`
          });
        } else {
          return successResponse(res, {
            status: 'error',
            service: 'Anti-Captcha',
            error: data.errorDescription,
            response_time_ms: responseTime,
            message: `Erro: ${data.errorDescription}`
          });
        }
      }
      
    } catch (testError) {
      return successResponse(res, {
        status: 'error',
        service,
        error: testError.message,
        response_time_ms: Date.now() - startTime,
        message: `Falha ao conectar: ${testError.message}`
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar captcha:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// BUSCAR CONFIGURAÇÕES PARA MICROSERVIÇOS
// GET /api/v1/internal/settings/:category
// ========================================
export async function getSettingsByCategory(req, res) {
  try {
    const { category } = req.params;
    
    if (req.headers['x-gateway-request'] !== 'true') {
      return errorResponse(res, 'Acesso restrito', 403);
    }
    
    const result = await query(
      'SELECT key, value FROM system_settings WHERE category = $1',
      [category]
    );
    
    const config = {};
    for (const row of result.rows) {
      const cleanKey = row.key.replace(`${category}_`, '');
      config[cleanKey] = row.value;
    }
    
    return successResponse(res, { config });
  } catch (error) {
    console.error('❌ Erro ao buscar settings por categoria:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// HELPERS
// ========================================

function maskSecret(value) {
  if (!value || value.length < 8) return value ? '••••••••' : '';
  return value.substring(0, 4) + '•'.repeat(Math.min(value.length - 8, 20)) + value.substring(value.length - 4);
}

async function getProxyConfig() {
  const result = await query("SELECT key, value FROM system_settings WHERE category = 'proxy'");
  const config = {};
  for (const row of result.rows) {
    const cleanKey = row.key.replace('proxy_', '');
    config[cleanKey] = row.value;
  }
  return config;
}

function buildProxyUrl(config) {
  const auth = config.username ? `${config.username}:${config.password || ''}@` : '';
  return `${config.protocol || 'socks5'}://${auth}${config.host}:${config.port}`;
}
