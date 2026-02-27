/* ========================================
   AUTH CONTROLLER
   
   Gerencia:
   - Registro de novos clientes (donos de gestor)
   - Login com JWT
   - CRUD de API Keys
   ======================================== */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { generateApiKey } from '../utils/apiKeyGenerator.js';
import { successResponse, errorResponse, isValidEmail } from '../utils/helpers.js';

// ========================================
// REGISTRAR NOVO USUÁRIO
// ========================================
export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    
    // Validações
    if (!name || !email || !password) {
      return errorResponse(res, 'Nome, email e senha são obrigatórios');
    }
    
    if (!isValidEmail(email)) {
      return errorResponse(res, 'Email inválido');
    }
    
    if (password.length < 6) {
      return errorResponse(res, 'Senha deve ter no mínimo 6 caracteres');
    }
    
    // Verificar se email já existe
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return errorResponse(res, 'Email já cadastrado', 409);
    }
    
    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Criar usuário
    const userResult = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, passwordHash]
    );
    
    const user = userResult.rows[0];
    
    // Criar saldo inicial (0 créditos)
    await query(
      'INSERT INTO credit_balances (user_id, balance) VALUES ($1, 0)',
      [user.id]
    );
    
    // Gerar primeira API Key automaticamente
    const { key, keyHash, keyPrefix } = generateApiKey();
    
    await query(
      'INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4)',
      [user.id, keyHash, keyPrefix, 'default']
    );
    
    // Gerar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return successResponse(res, {
      message: 'Conta criada com sucesso!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token,
      api_key: {
        key, // ⚠️ Mostrada APENAS neste momento!
        prefix: keyPrefix,
        warning: 'Guarde esta chave! Ela não será exibida novamente.'
      }
    }, 201);
    
  } catch (error) {
    console.error('❌ Erro no registro:', error);
    return errorResponse(res, 'Erro interno ao criar conta', 500);
  }
}

// ========================================
// LOGIN
// ========================================
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return errorResponse(res, 'Email e senha são obrigatórios');
    }
    
    // Buscar usuário
    const result = await query(
      'SELECT id, name, email, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Email ou senha incorretos', 401);
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      return errorResponse(res, 'Conta desativada', 403);
    }
    
    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return errorResponse(res, 'Email ou senha incorretos', 401);
    }
    
    // Gerar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return successResponse(res, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no login:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// LISTAR API KEYS DO USUÁRIO
// ========================================
export async function listApiKeys(req, res) {
  try {
    const result = await query(`
      SELECT id, key_prefix, key_encrypted, name, is_active, rate_limit, last_used_at, created_at
      FROM api_keys 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    // Descriptografar keys para exibição
    const { decryptApiKey } = await import('../utils/apiKeyGenerator.js');
    
    const apiKeys = result.rows.map(row => ({
      id: row.id,
      key_prefix: row.key_prefix,
      full_key: row.key_encrypted ? decryptApiKey(row.key_encrypted) : null,
      name: row.name,
      is_active: row.is_active,
      rate_limit: row.rate_limit,
      last_used_at: row.last_used_at,
      created_at: row.created_at
    }));
    
    return successResponse(res, { api_keys: apiKeys });
  } catch (error) {
    console.error('❌ Erro ao listar API keys:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// CRIAR NOVA API KEY
// ========================================
export async function createApiKey(req, res) {
  try {
    const { name } = req.body;
    
    const { key, keyHash, keyPrefix, keyEncrypted } = generateApiKey();
    
    await query(
      'INSERT INTO api_keys (user_id, key_hash, key_prefix, key_encrypted, name) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, keyHash, keyPrefix, keyEncrypted, name || 'unnamed']
    );
    
    return successResponse(res, {
      api_key: {
        key,
        prefix: keyPrefix,
        name: name || 'unnamed'
      }
    }, 201);
    
  } catch (error) {
    console.error('❌ Erro ao criar API key:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// REVOGAR API KEY
// ========================================
export async function revokeApiKey(req, res) {
  try {
    const { id } = req.params;
    
    const result = await query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id, key_prefix',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'API Key não encontrada', 404);
    }
    
    return successResponse(res, {
      message: 'API Key revogada com sucesso',
      revoked: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao revogar API key:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// PERFIL DO USUÁRIO
// ========================================
export async function getProfile(req, res) {
  try {
    const result = await query(`
      SELECT u.id, u.name, u.email, u.created_at, cb.balance
      FROM users u
      LEFT JOIN credit_balances cb ON u.id = cb.user_id
      WHERE u.id = $1
    `, [req.user.id]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Usuário não encontrado', 404);
    }
    
    const user = result.rows[0];
    
    // Estatísticas rápidas
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total_renewals,
        COUNT(*) FILTER (WHERE status = 'success') as successful,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_spent
      FROM renewal_logs
      WHERE user_id = $1
    `, [req.user.id]);
    
    return successResponse(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: parseFloat(user.balance) || 0,
        created_at: user.created_at
      },
      stats: {
        total_renewals: parseInt(statsResult.rows[0].total_renewals),
        successful: parseInt(statsResult.rows[0].successful),
        failed: parseInt(statsResult.rows[0].failed),
        total_spent: parseFloat(statsResult.rows[0].total_spent)
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar perfil:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
