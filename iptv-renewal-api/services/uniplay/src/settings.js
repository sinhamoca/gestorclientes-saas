/* ========================================
   SETTINGS FETCHER - UNIPLAY
   Busca proxy SOCKS5 config do gateway
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchProxyConfig(gatewayUrl) {
  const cacheKey = 'proxy';
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.time) < CACHE_TTL) return cached.value;
  
  try {
    const url = `${gatewayUrl}/api/v1/settings/internal/proxy`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'X-Gateway-Request': 'true' }
    });
    
    if (response.data?.success && response.data?.config) {
      const c = response.data.config;
      const config = {
        protocol: (c.protocol || c.proxy_protocol || 'socks5').trim(),
        host: (c.host || c.proxy_host || '').trim(),
        port: (c.port || c.proxy_port || '').trim(),
        username: (c.username || c.proxy_username || '').trim(),
        password: (c.password || c.proxy_password || '').trim()
      };
      cache.set(cacheKey, { value: config, time: Date.now() });
      return config;
    }
    return null;
  } catch (error) {
    log(`Falha ao buscar proxy config: ${error.message}`, 'WARN');
    if (cached) return cached.value;
    return null;
  }
}

export function clearCache() { cache.clear(); }
