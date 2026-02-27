/* ========================================
   SETTINGS FETCHER
   
   Busca configurações do gateway via endpoint
   interno (GET /api/v1/settings/internal/:category)
   
   O microserviço NÃO armazena chaves sensíveis.
   Sempre consulta o gateway, que lê do banco.
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

// Cache simples com TTL (5 minutos)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Busca a chave Anti-Captcha do gateway
 * Usa cache de 5 minutos para evitar chamadas excessivas
 */
export async function fetchAntiCaptchaKey(gatewayUrl) {
  return fetchSetting(gatewayUrl, 'captcha', 'anticaptcha_key');
}

/**
 * Busca uma configuração específica de uma categoria
 */
async function fetchSetting(gatewayUrl, category, key) {
  const cacheKey = `${category}:${key}`;
  
  // Verificar cache
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.time) < CACHE_TTL) {
    return cached.value;
  }
  
  try {
    const url = `${gatewayUrl}/api/v1/settings/internal/${category}`;
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'X-Gateway-Request': 'true' }
    });
    
    if (response.data?.success && response.data?.config) {
      const value = response.data.config[key] || null;
      
      // Salvar no cache
      cache.set(cacheKey, { value, time: Date.now() });
      
      return value;
    }
    
    return null;
  } catch (error) {
    log(`Falha ao buscar setting ${category}/${key}: ${error.message}`, 'WARN');
    
    // Retornar valor do cache mesmo expirado (fallback)
    if (cached) {
      log('Usando valor do cache (expirado) como fallback');
      return cached.value;
    }
    
    return null;
  }
}

/**
 * Limpar cache (útil se o admin atualizou as configs)
 */
export function clearCache() {
  cache.clear();
}
