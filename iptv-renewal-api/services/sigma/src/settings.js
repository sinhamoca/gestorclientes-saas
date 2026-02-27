/* ========================================
   SETTINGS FETCHER - SIGMA
   Busca Worker URL e Secret do gateway
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchWorkerConfig(gatewayUrl) {
  const cacheKey = 'workers';
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.time) < CACHE_TTL) return cached.value;
  
  try {
    const url = `${gatewayUrl}/api/v1/settings/internal/workers`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'X-Gateway-Request': 'true' }
    });
    
    if (response.data?.success && response.data?.config) {
      const config = {
        workerUrl: (response.data.config.sigma_worker_url || '').trim() || null,
        workerSecret: (response.data.config.sigma_worker_secret || '').trim() || null
      };
      cache.set(cacheKey, { value: config, time: Date.now() });
      return config;
    }
    return { workerUrl: null, workerSecret: null };
  } catch (error) {
    log(`Falha ao buscar worker config: ${error.message}`, 'WARN');
    if (cached) return cached.value;
    return { workerUrl: null, workerSecret: null };
  }
}

export function clearCache() { cache.clear(); }
