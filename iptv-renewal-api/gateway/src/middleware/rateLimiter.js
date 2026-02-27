/* ========================================
   RATE LIMITER MIDDLEWARE
   
   Rate limit por API Key usando memória.
   Cada API Key tem seu próprio limite configurável.
   
   Janela deslizante de 1 minuto.
   ======================================== */

import { errorResponse } from '../utils/helpers.js';

// Map em memória: apiKeyId → { requests: [], windowStart }
const rateLimitStore = new Map();

// Limpar entries antigas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore) {
    if (now - data.windowStart > 300000) { // 5 min sem uso
      rateLimitStore.delete(key);
    }
  }
}, 300000);

// ========================================
// RATE LIMITER POR API KEY
// ========================================
export function rateLimiterByApiKey(req, res, next) {
  // Precisa do apiUser (vem do middleware de auth)
  if (!req.apiUser) {
    return next();
  }
  
  const keyId = req.apiUser.apiKeyId;
  const maxRequests = req.apiUser.rateLimit || 60;
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minuto
  const now = Date.now();
  
  // Inicializar se não existe
  if (!rateLimitStore.has(keyId)) {
    rateLimitStore.set(keyId, {
      requests: [],
      windowStart: now
    });
  }
  
  const data = rateLimitStore.get(keyId);
  
  // Remover requests fora da janela
  data.requests = data.requests.filter(timestamp => now - timestamp < windowMs);
  
  // Verificar limite
  if (data.requests.length >= maxRequests) {
    const retryAfter = Math.ceil((data.requests[0] + windowMs - now) / 1000);
    
    res.set('Retry-After', retryAfter);
    res.set('X-RateLimit-Limit', maxRequests);
    res.set('X-RateLimit-Remaining', 0);
    res.set('X-RateLimit-Reset', new Date(data.requests[0] + windowMs).toISOString());
    
    return errorResponse(res, `Rate limit excedido. Tente novamente em ${retryAfter}s.`, 429);
  }
  
  // Registrar request
  data.requests.push(now);
  
  // Headers informativos
  res.set('X-RateLimit-Limit', maxRequests);
  res.set('X-RateLimit-Remaining', maxRequests - data.requests.length);
  
  next();
}
