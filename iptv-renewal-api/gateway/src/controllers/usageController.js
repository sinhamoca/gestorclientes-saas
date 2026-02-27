/* ========================================
   USAGE CONTROLLER
   
   Estatísticas de uso da API:
   - Resumo geral
   - Uso por provedor
   - Histórico de renovações
   - Preços atuais
   ======================================== */

import { query } from '../config/database.js';
import { checkAllServices, getAllServiceStatus } from '../services/providerRouter.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

// ========================================
// RESUMO DE USO
// GET /api/v1/usage/summary
// ========================================
export async function getUsageSummary(req, res) {
  try {
    const userId = req.user?.id || req.apiUser?.id;
    
    // Uso do mês atual
    const monthlyResult = await query(`
      SELECT 
        provider,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_cost,
        COALESCE(SUM(telas) FILTER (WHERE status = 'success'), 0) as total_telas
      FROM renewal_logs
      WHERE user_id = $1 
        AND created_at >= DATE_TRUNC('month', NOW())
      GROUP BY provider
      ORDER BY total DESC
    `, [userId]);
    
    // Totais gerais do mês
    const totalsResult = await query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'success') as total_success,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_cost,
        COALESCE(AVG(response_time_ms), 0) as avg_response_time
      FROM renewal_logs
      WHERE user_id = $1 
        AND created_at >= DATE_TRUNC('month', NOW())
    `, [userId]);
    
    const totals = totalsResult.rows[0];
    
    return successResponse(res, {
      period: 'current_month',
      totals: {
        requests: parseInt(totals.total_requests),
        success: parseInt(totals.total_success),
        failed: parseInt(totals.total_failed),
        success_rate: totals.total_requests > 0 
          ? ((totals.total_success / totals.total_requests) * 100).toFixed(1) + '%'
          : '0%',
        total_cost: parseFloat(totals.total_cost),
        avg_response_time_ms: Math.round(parseFloat(totals.avg_response_time))
      },
      by_provider: monthlyResult.rows.map(row => ({
        provider: row.provider,
        total: parseInt(row.total),
        success: parseInt(row.success),
        failed: parseInt(row.failed),
        cost: parseFloat(row.total_cost),
        telas: parseInt(row.total_telas)
      }))
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar resumo:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// HISTÓRICO DE RENOVAÇÕES
// GET /api/v1/usage/history
// ========================================
export async function getRenewalHistory(req, res) {
  try {
    const userId = req.user?.id || req.apiUser?.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const provider = req.query.provider;
    const status = req.query.status;
    
    let whereClause = 'WHERE user_id = $1';
    const params = [userId];
    let paramCount = 1;
    
    if (provider) {
      paramCount++;
      whereClause += ` AND provider = $${paramCount}`;
      params.push(provider.toLowerCase());
    }
    
    if (status) {
      paramCount++;
      whereClause += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    // Stats para os filtros atuais
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_cost,
        COALESCE(SUM(telas) FILTER (WHERE status = 'success'), 0) as total_telas,
        COALESCE(AVG(response_time_ms) FILTER (WHERE status = 'success'), 0) as avg_response_time
      FROM renewal_logs
      ${whereClause}
    `, params.slice(0, paramCount));
    
    // Stats do mês atual (para os filtros atuais)
    const monthStatsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_cost,
        COALESCE(SUM(telas) FILTER (WHERE status = 'success'), 0) as total_telas
      FROM renewal_logs
      ${whereClause}
        AND created_at >= DATE_TRUNC('month', NOW())
    `, params.slice(0, paramCount));
    
    // Renovações paginadas com metadata
    params.push(limit, offset);
    
    // Stats por user_email (top usuários)
    const emailStatsResult = await query(`
      SELECT 
        metadata->>'user_email' as user_email,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COALESCE(SUM(cost) FILTER (WHERE status = 'success'), 0) as total_cost
      FROM renewal_logs
      ${whereClause}
        AND metadata->>'user_email' IS NOT NULL
        AND metadata->>'user_email' != ''
      GROUP BY metadata->>'user_email'
      ORDER BY success DESC, total DESC
      LIMIT 20
    `, params.slice(0, paramCount));
    
    const result = await query(`
      SELECT id, provider, status, telas, cost, billing_mode, 
             response_time_ms, error_message, metadata, created_at
      FROM renewal_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);
    
    const stats = statsResult.rows[0];
    const monthStats = monthStatsResult.rows[0];
    
    return successResponse(res, {
      renewals: result.rows.map(r => ({
        ...r,
        user_email: r.metadata?.user_email || null
      })),
      total: parseInt(stats.total),
      stats: {
        all_time: {
          total: parseInt(stats.total),
          success: parseInt(stats.success),
          failed: parseInt(stats.failed),
          success_rate: stats.total > 0 
            ? ((stats.success / stats.total) * 100).toFixed(1) + '%'
            : '0%',
          total_cost: parseFloat(stats.total_cost),
          total_telas: parseInt(stats.total_telas),
          avg_response_time_ms: Math.round(parseFloat(stats.avg_response_time))
        },
        this_month: {
          total: parseInt(monthStats.total),
          success: parseInt(monthStats.success),
          total_cost: parseFloat(monthStats.total_cost),
          total_telas: parseInt(monthStats.total_telas)
        },
        by_user: emailStatsResult.rows.map(r => ({
          email: r.user_email,
          total: parseInt(r.total),
          success: parseInt(r.success),
          failed: parseInt(r.failed),
          cost: parseFloat(r.total_cost)
        }))
      },
      limit,
      offset
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar histórico:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// PREÇOS ATUAIS DOS PROVEDORES
// GET /api/v1/providers/pricing
// ========================================
export async function getProviderPricing(req, res) {
  try {
    const result = await query(`
      SELECT provider, display_name, cost_per_operation, cost_per_tela,
             billing_mode, has_keeper, requires_proxy, requires_captcha,
             is_active, description
      FROM provider_pricing
      ORDER BY provider
    `);
    
    return successResponse(res, {
      providers: result.rows,
      currency: 'BRL',
      note: 'Cobrança apenas por renovações com sucesso. Falhas são reembolsadas automaticamente.'
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar preços:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// STATUS DOS SERVIÇOS
// GET /api/v1/providers/status
// ========================================
export async function getProvidersStatus(req, res) {
  try {
    const services = await checkAllServices();
    
    return successResponse(res, {
      services,
      checked_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
