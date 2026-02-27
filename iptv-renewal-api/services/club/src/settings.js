import axios from 'axios';
import { log } from './utils.js';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchAntiCaptchaKey(gatewayUrl) {
  const cacheKey = 'captcha';
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.time) < CACHE_TTL) return cached.value;
  
  try {
    const url = `${gatewayUrl}/api/v1/settings/internal/captcha`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'X-Gateway-Request': 'true' }
    });
    
    if (response.data?.success && response.data?.config) {
      const c = response.data.config;
      // Endpoint remove prefixo 'captcha_' → chave vem como 'anticaptcha_key'
      const key = (c.anticaptcha_key || '').trim() || null;
      cache.set(cacheKey, { value: key, time: Date.now() });
      return key;
    }
    return null;
  } catch (error) {
    log(`Falha ao buscar Anti-Captcha key: ${error.message}`, 'WARN');
    if (cached) return cached.value;
    return null;
  }
}

export function clearCache() { cache.clear(); }
