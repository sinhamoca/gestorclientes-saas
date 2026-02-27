/* ========================================
   API KEY GENERATOR
   Gera chaves seguras no formato:
   irapi_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   
   Prefixo visível para identificação rápida
   Hash armazenado para autenticação
   Key criptografada (AES) armazenada para consulta futura
   ======================================== */

import crypto from 'crypto';

// Chave AES derivada do JWT_SECRET (ou env) - 32 bytes
const ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(process.env.JWT_SECRET || 'default-secret-key-change-me')
  .digest();

// ========================================
// GERAR API KEY
// ========================================
export function generateApiKey() {
  // Gerar 32 bytes aleatórios = 64 chars hex
  const randomBytes = crypto.randomBytes(32).toString('hex');
  
  // Prefixo para identificação (irapi = iptv renewal api)
  const prefix = 'irapi_live';
  const key = `${prefix}_${randomBytes}`;
  
  // Hash para autenticação rápida
  const keyHash = hashApiKey(key);
  
  // Prefixo visível (primeiros 12 chars) para o usuário identificar
  const keyPrefix = key.substring(0, 12);
  
  // Key criptografada para armazenar e poder mostrar depois
  const keyEncrypted = encryptApiKey(key);
  
  return {
    key,            // Mostrado ao usuário
    keyHash,        // Para autenticação (SHA-256)
    keyPrefix,      // Para identificação visual
    keyEncrypted    // Para armazenar no banco e recuperar depois
  };
}

// ========================================
// HASH DE API KEY (SHA-256) - para autenticação
// ========================================
export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ========================================
// CRIPTOGRAFIA AES-256-GCM - para armazenar/recuperar
// ========================================
export function encryptApiKey(plainText) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedText) {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

// ========================================
// GERAR ID ÚNICO PARA SESSÃO
// ========================================
export function generateSessionId(provider, username) {
  return crypto
    .createHash('sha256')
    .update(`${provider}:${username}`)
    .digest('hex')
    .substring(0, 32);
}
