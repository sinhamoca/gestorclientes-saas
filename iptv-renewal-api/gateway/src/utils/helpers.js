/* ========================================
   HELPERS - IPTV RENEWAL API
   Funções utilitárias diversas
   ======================================== */

// ========================================
// RESPOSTA PADRONIZADA DE SUCESSO
// ========================================
export function successResponse(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...data
  });
}

// ========================================
// RESPOSTA PADRONIZADA DE ERRO
// ========================================
export function errorResponse(res, message, statusCode = 400, details = null) {
  const response = {
    success: false,
    error: message
  };
  
  if (details) {
    response.details = details;
  }
  
  return res.status(statusCode).json(response);
}

// ========================================
// VALIDAR EMAIL
// ========================================
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ========================================
// LISTA DE PROVEDORES VÁLIDOS
// ========================================
export const VALID_PROVIDERS = [
  'sigma',
  'cloudnation',
  'koffice',
  'uniplay',
  'club',
  'painelfoda',
  'rush'
];

// ========================================
// VALIDAR PROVEDOR
// ========================================
export function isValidProvider(provider) {
  return VALID_PROVIDERS.includes(provider?.toLowerCase());
}

// ========================================
// TIMESTAMP FORMATADO (BR)
// ========================================
export function timestampBR() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// ========================================
// LOG COM TIMESTAMP
// ========================================
export function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const symbols = {
    INFO: 'ℹ️ ',
    SUCCESS: '✅',
    ERROR: '❌',
    WARN: '⚠️ ',
    DEBUG: '🔍'
  };
  console.log(`[${timestamp}] ${symbols[type] || ''} [GATEWAY] ${message}`);
}
