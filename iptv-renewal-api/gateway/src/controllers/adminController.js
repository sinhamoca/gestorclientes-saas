/* ========================================
   ADMIN CONTROLLER
   
   Endpoints exclusivos do administrador:
   - Listar todos os usuários
   - Ver detalhes de um usuário
   - Ativar/desativar usuários
   - Adicionar/remover créditos de qualquer usuário
   - Visão geral do sistema (receita, uso, etc)
   - Listar todas as API keys
   - Ver logs globais de renovação
   ======================================== */

import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import creditService from '../services/creditService.js';
import { generateApiKey } from '../utils/apiKeyGenerator.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

// ========================================
// DASHBOARD ADMIN - VISÃO GERAL
// GET /api/v1/admin/dashboard
// ========================================
export async function adminDashboard(req, res) {
  try {
    // Total de usuários
    const usersCount = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_admin = false) as clients
      FROM users
    `);
    
    // Receita total (créditos comprados)
    const revenue = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue
      FROM credit_transactions 
      WHERE type = 'purchase'
    `);
    
    // Receita do mês
    const monthRevenue = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as month_revenue
      FROM credit_transactions 
      WHERE type = 'purchase' 
        AND created_at >= DATE_TRUNC('month', NOW())
    `);
    
    // Uso total (créditos consumidos)
    const usage = await query(`
      SELECT 
        COALESCE(SUM(ABS(amount)), 0) as total_usage
      FROM credit_transactions 
      WHERE type = 'usage'
    `);
    
    // Renovações do mês
    const renewals = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as revenue_from_renewals
      FROM renewal_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);
    
    // Renovações por provedor (mês)
    const byProvider = await query(`
      SELECT 
        provider,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as revenue
      FROM renewal_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
      GROUP BY provider
      ORDER BY total DESC
    `);
    
    // Saldo total em aberto (créditos dos clientes)
    const totalBalance = await query(`
      SELECT COALESCE(SUM(balance), 0) as total_balance 
      FROM credit_balances
    `);
    
    // Top 5 clientes por uso no mês
    const topClients = await query(`
      SELECT 
        u.id, u.name, u.email,
        COUNT(rl.id) as total_renewals,
        COALESCE(SUM(rl.cost) FILTER (WHERE rl.status = 'success'), 0) as total_spent
      FROM users u
      LEFT JOIN renewal_logs rl ON u.id = rl.user_id 
        AND rl.created_at >= DATE_TRUNC('month', NOW())
      WHERE u.is_admin = false
      GROUP BY u.id, u.name, u.email
      ORDER BY total_renewals DESC
      LIMIT 5
    `);
    
    const users = usersCount.rows[0];
    const ren = renewals.rows[0];
    
    return successResponse(res, {
      users: {
        total: parseInt(users.total),
        active: parseInt(users.active),
        clients: parseInt(users.clients)
      },
      financials: {
        total_revenue: parseFloat(revenue.rows[0].total_revenue),
        month_revenue: parseFloat(monthRevenue.rows[0].month_revenue),
        total_usage: parseFloat(usage.rows[0].total_usage),
        total_client_balance: parseFloat(totalBalance.rows[0].total_balance)
      },
      month_renewals: {
        total: parseInt(ren.total),
        success: parseInt(ren.success),
        failed: parseInt(ren.failed),
        revenue: parseFloat(ren.revenue_from_renewals)
      },
      by_provider: byProvider.rows.map(r => ({
        provider: r.provider,
        total: parseInt(r.total),
        success: parseInt(r.success),
        revenue: parseFloat(r.revenue)
      })),
      top_clients: topClients.rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        renewals: parseInt(r.total_renewals),
        spent: parseFloat(r.total_spent)
      }))
    });
    
  } catch (error) {
    console.error('❌ Erro no dashboard admin:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// LISTAR TODOS OS USUÁRIOS
// GET /api/v1/admin/users
// ========================================
export async function listUsers(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    
    let whereClause = 'WHERE u.is_admin = false';
    const params = [];
    let paramCount = 0;
    
    if (search) {
      paramCount++;
      whereClause += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    params.push(limit, offset);
    
    const result = await query(`
      SELECT 
        u.id, u.name, u.email, u.is_active, u.created_at,
        COALESCE(cb.balance, 0) as balance,
        (SELECT COUNT(*) FROM api_keys ak WHERE ak.user_id = u.id AND ak.is_active = true) as active_keys,
        (SELECT COUNT(*) FROM renewal_logs rl WHERE rl.user_id = u.id) as total_renewals,
        (SELECT COUNT(*) FROM renewal_logs rl WHERE rl.user_id = u.id AND rl.created_at >= DATE_TRUNC('month', NOW())) as month_renewals,
        (SELECT COALESCE(SUM(rl.cost), 0) FROM renewal_logs rl WHERE rl.user_id = u.id AND rl.status = 'success') as total_spent
      FROM users u
      LEFT JOIN credit_balances cb ON u.id = cb.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);
    
    const countResult = await query(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      params.slice(0, paramCount)
    );
    
    return successResponse(res, {
      users: result.rows.map(u => ({
        ...u,
        balance: parseFloat(u.balance),
        total_spent: parseFloat(u.total_spent),
        active_keys: parseInt(u.active_keys),
        total_renewals: parseInt(u.total_renewals),
        month_renewals: parseInt(u.month_renewals)
      })),
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// DETALHES DE UM USUÁRIO
// GET /api/v1/admin/users/:id
// ========================================
export async function getUserDetails(req, res) {
  try {
    const userId = parseInt(req.params.id);
    
    // Info básica
    const user = await query(`
      SELECT u.id, u.name, u.email, u.is_active, u.created_at,
             COALESCE(cb.balance, 0) as balance
      FROM users u
      LEFT JOIN credit_balances cb ON u.id = cb.user_id
      WHERE u.id = $1
    `, [userId]);
    
    if (user.rows.length === 0) {
      return errorResponse(res, 'Usuário não encontrado', 404);
    }
    
    // API Keys
    const keys = await query(`
      SELECT id, key_prefix, key_encrypted, name, is_active, rate_limit, last_used_at, created_at
      FROM api_keys WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    // Últimas renovações
    const renewals = await query(`
      SELECT id, provider, status, telas, cost, response_time_ms, error_message, created_at
      FROM renewal_logs WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [userId]);
    
    // Últimas transações
    const transactions = await query(`
      SELECT id, type, amount, balance_after, description, created_at
      FROM credit_transactions WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [userId]);
    
    // Estatísticas
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_spent
      FROM renewal_logs WHERE user_id = $1
    `, [userId]);
    
    const u = user.rows[0];
    const s = stats.rows[0];
    
    return successResponse(res, {
      user: { ...u, balance: parseFloat(u.balance) },
      api_keys: keys.rows,
      recent_renewals: renewals.rows,
      recent_transactions: transactions.rows,
      stats: {
        total_renewals: parseInt(s.total),
        successful: parseInt(s.success),
        failed: parseInt(s.failed),
        total_spent: parseFloat(s.total_spent)
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar detalhes:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// ATIVAR / DESATIVAR USUÁRIO
// PUT /api/v1/admin/users/:id/toggle
// ========================================
export async function toggleUser(req, res) {
  try {
    const userId = parseInt(req.params.id);
    
    const result = await query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 AND is_admin = false RETURNING id, name, is_active',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Usuário não encontrado ou é admin', 404);
    }
    
    const user = result.rows[0];
    
    return successResponse(res, {
      message: `Usuário ${user.is_active ? 'ativado' : 'desativado'}`,
      user
    });
    
  } catch (error) {
    console.error('❌ Erro ao toggle usuário:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// ADICIONAR CRÉDITOS A UM USUÁRIO
// POST /api/v1/admin/users/:id/credits
// ========================================
export async function adminAddCredits(req, res) {
  try {
    const userId = parseInt(req.params.id);
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return errorResponse(res, 'Valor deve ser maior que zero');
    }
    
    // Verificar se usuário existe
    const user = await query('SELECT id, name FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return errorResponse(res, 'Usuário não encontrado', 404);
    }
    
    const result = await creditService.addCredits(
      userId,
      amount,
      description || `Admin: adição de R$ ${amount.toFixed(2)}`,
      `admin_${Date.now()}`
    );
    
    return successResponse(res, {
      message: `R$ ${amount.toFixed(2)} adicionados para ${user.rows[0].name}`,
      balance: result.balance
    });
    
  } catch (error) {
    console.error('❌ Erro ao adicionar créditos:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// LOGS GLOBAIS DE RENOVAÇÃO
// GET /api/v1/admin/renewals
// ========================================
export async function adminRenewalLogs(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const provider = req.query.provider;
    const status = req.query.status;
    const userId = req.query.user_id;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (provider) { paramCount++; whereClause += ` AND rl.provider = $${paramCount}`; params.push(provider); }
    if (status) { paramCount++; whereClause += ` AND rl.status = $${paramCount}`; params.push(status); }
    if (userId) { paramCount++; whereClause += ` AND rl.user_id = $${paramCount}`; params.push(parseInt(userId)); }
    
    params.push(limit, offset);
    
    const result = await query(`
      SELECT 
        rl.id, rl.provider, rl.status, rl.telas, rl.cost, 
        rl.billing_mode, rl.response_time_ms, rl.error_message, rl.created_at,
        u.name as user_name, u.email as user_email
      FROM renewal_logs rl
      JOIN users u ON rl.user_id = u.id
      ${whereClause}
      ORDER BY rl.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);
    
    const countResult = await query(
      `SELECT COUNT(*) as total FROM renewal_logs rl ${whereClause}`,
      params.slice(0, paramCount)
    );
    
    return successResponse(res, {
      renewals: result.rows.map(r => ({ ...r, cost: parseFloat(r.cost) })),
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar renovações:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// CRIAR NOVO USUÁRIO
// POST /api/v1/admin/users
// ========================================
export async function createUser(req, res) {
  try {
    const { name, email, password, initial_credits } = req.body;
    
    // Validações
    if (!name || !email || !password) {
      return errorResponse(res, 'Nome, email e senha são obrigatórios');
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
    
    // Criar saldo inicial
    const credits = parseFloat(initial_credits) || 0;
    await query(
      'INSERT INTO credit_balances (user_id, balance) VALUES ($1, $2)',
      [user.id, credits]
    );
    
    // Registrar transação se tiver créditos iniciais
    if (credits > 0) {
      await query(
        `INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, reference_id)
         VALUES ($1, 'purchase', $2, $2, $3, $4)`,
        [user.id, credits, `Admin: créditos iniciais R$ ${credits.toFixed(2)}`, `admin_initial_${Date.now()}`]
      );
    }
    
    // Gerar primeira API Key
    const { key, keyHash, keyPrefix } = generateApiKey();
    
    await query(
      'INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4)',
      [user.id, keyHash, keyPrefix, 'default']
    );
    
    return successResponse(res, {
      message: 'Usuário criado com sucesso!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: credits
      },
      api_key: {
        key,
        prefix: keyPrefix
      }
    }, 201);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
