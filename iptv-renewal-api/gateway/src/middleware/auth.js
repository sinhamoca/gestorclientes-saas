/* ========================================
   AUTH MIDDLEWARE
   
   Dois modos de autenticação:
   1. JWT Token → Para dashboard (login do dono do gestor)
   2. API Key → Para chamadas de renovação (gestor externo)
   ======================================== */

import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { hashApiKey } from '../utils/apiKeyGenerator.js';
import { errorResponse } from '../utils/helpers.js';

// ========================================
// AUTH VIA JWT (Dashboard)
// ========================================
export function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Token de autenticação não fornecido', 401);
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expirado', 401);
    }
    return errorResponse(res, 'Token inválido', 401);
  }
}

// ========================================
// AUTH VIA API KEY (Renovações)
// ========================================
export async function authenticateApiKey(req, res, next) {
  // API Key pode vir no header ou query param
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return errorResponse(res, 'API Key não fornecida. Use o header X-API-Key.', 401);
  }
  
  // Validar formato
  if (!apiKey.startsWith('irapi_live_')) {
    return errorResponse(res, 'Formato de API Key inválido', 401);
  }
  
  try {
    // Hash da key para buscar no banco
    const keyHash = hashApiKey(apiKey);
    
    const result = await query(`
      SELECT 
        ak.id AS api_key_id,
        ak.user_id,
        ak.name AS key_name,
        ak.rate_limit,
        ak.is_active AS key_active,
        u.name AS user_name,
        u.email,
        u.is_active AS user_active,
        cb.balance
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      LEFT JOIN credit_balances cb ON u.id = cb.user_id
      WHERE ak.key_hash = $1
    `, [keyHash]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'API Key inválida', 401);
    }
    
    const keyData = result.rows[0];
    
    // Verificar se key está ativa
    if (!keyData.key_active) {
      return errorResponse(res, 'API Key desativada', 403);
    }
    
    // Verificar se usuário está ativo
    if (!keyData.user_active) {
      return errorResponse(res, 'Conta desativada', 403);
    }
    
    // Atualizar last_used_at (async, sem bloquear)
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyData.api_key_id])
      .catch(() => {});
    
    // Injetar dados no request
    req.apiUser = {
      id: keyData.user_id,
      name: keyData.user_name,
      email: keyData.email,
      apiKeyId: keyData.api_key_id,
      keyName: keyData.key_name,
      rateLimit: keyData.rate_limit,
      balance: parseFloat(keyData.balance) || 0
    };
    
    next();
  } catch (error) {
    console.error('❌ Erro na autenticação API Key:', error);
    return errorResponse(res, 'Erro interno na autenticação', 500);
  }
}
