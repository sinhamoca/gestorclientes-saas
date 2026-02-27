/* ========================================
   SERVICES CONTROLLER
   
   Gerencia monitoramento dos microserviços:
   - Health check individual e global
   - Listar sessões ativas (keeper)
   - Destruir sessão específica ou todas
   
   O gateway faz proxy para os microserviços.
   ======================================== */

import axios from 'axios';
import { successResponse, errorResponse } from '../utils/helpers.js';

// Mapa de URLs (mesmo do providerRouter)
const PROVIDER_URLS = {
  sigma:       process.env.SIGMA_SERVICE_URL       || 'http://localhost:4001',
  cloudnation: process.env.CLOUDNATION_SERVICE_URL || 'http://localhost:4002',
  koffice:     process.env.KOFFICE_SERVICE_URL     || 'http://localhost:4003',
  uniplay:     process.env.UNIPLAY_SERVICE_URL     || 'http://localhost:4004',
  club:        process.env.CLUB_SERVICE_URL        || 'http://localhost:4005',
  painelfoda:  process.env.PAINELFODA_SERVICE_URL  || 'http://localhost:4006',
  rush:        process.env.RUSH_SERVICE_URL        || 'http://localhost:4007'
};

// ========================================
// HEALTH CHECK DE TODOS OS SERVIÇOS
// GET /api/v1/admin/services
// ========================================
export async function getAllServices(req, res) {
  try {
    const results = {};
    
    const checks = Object.entries(PROVIDER_URLS).map(async ([provider, baseUrl]) => {
      try {
        const start = Date.now();
        const response = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
        const responseTime = Date.now() - start;
        
        results[provider] = {
          status: 'online',
          responseTime,
          url: baseUrl,
          ...response.data
        };
      } catch (error) {
        results[provider] = {
          status: 'offline',
          url: baseUrl,
          error: error.code || error.message
        };
      }
    });
    
    await Promise.all(checks);
    
    const online = Object.values(results).filter(r => r.status === 'online').length;
    const total = Object.keys(results).length;
    
    return successResponse(res, {
      summary: { total, online, offline: total - online },
      services: results
    });
  } catch (error) {
    console.error('❌ Erro ao verificar serviços:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// SESSÕES DE UM SERVIÇO ESPECÍFICO
// GET /api/v1/admin/services/:provider/sessions
// ========================================
export async function getServiceSessions(req, res) {
  try {
    const { provider } = req.params;
    const baseUrl = PROVIDER_URLS[provider];
    
    if (!baseUrl) {
      return errorResponse(res, `Provedor "${provider}" não encontrado`, 404);
    }
    
    try {
      const response = await axios.get(`${baseUrl}/sessions`, { timeout: 5000 });
      
      return successResponse(res, {
        provider,
        ...response.data
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return successResponse(res, { provider, status: 'offline', total: 0, sessions: [] });
      }
      // Serviço não suporta /sessions
      if (error.response?.status === 404) {
        return successResponse(res, { provider, status: 'no_keeper', total: 0, sessions: [], message: 'Serviço não possui session keeper' });
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Erro ao buscar sessões:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// SESSÕES DE TODOS OS SERVIÇOS
// GET /api/v1/admin/services/sessions
// ========================================
export async function getAllSessions(req, res) {
  try {
    const results = {};
    
    const checks = Object.entries(PROVIDER_URLS).map(async ([provider, baseUrl]) => {
      try {
        const response = await axios.get(`${baseUrl}/sessions`, { timeout: 5000 });
        results[provider] = {
          status: 'online',
          ...response.data
        };
      } catch (error) {
        if (error.response?.status === 404) {
          results[provider] = { status: 'no_keeper', total: 0, sessions: [] };
        } else {
          results[provider] = { status: 'offline', total: 0, sessions: [] };
        }
      }
    });
    
    await Promise.all(checks);
    
    const totalSessions = Object.values(results).reduce((sum, r) => sum + (r.total || 0), 0);
    
    return successResponse(res, {
      totalSessions,
      providers: results
    });
  } catch (error) {
    console.error('❌ Erro ao buscar todas as sessões:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// DESTRUIR TODAS AS SESSÕES DE UM SERVIÇO
// DELETE /api/v1/admin/services/:provider/sessions
// ========================================
export async function destroyServiceSessions(req, res) {
  try {
    const { provider } = req.params;
    const baseUrl = PROVIDER_URLS[provider];
    
    if (!baseUrl) {
      return errorResponse(res, `Provedor "${provider}" não encontrado`, 404);
    }
    
    try {
      const response = await axios.delete(`${baseUrl}/sessions`, { timeout: 10000 });
      
      return successResponse(res, {
        provider,
        message: `Todas as sessões de ${provider} destruídas`,
        ...response.data
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return errorResponse(res, `Serviço ${provider} está offline`, 503);
      }
      if (error.response?.status === 404) {
        return errorResponse(res, `Serviço ${provider} não possui session keeper`, 404);
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Erro ao destruir sessões:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// DESTRUIR SESSÕES DE TODOS OS SERVIÇOS
// DELETE /api/v1/admin/services/sessions
// ========================================
export async function destroyAllSessions(req, res) {
  try {
    const results = {};
    
    const destroys = Object.entries(PROVIDER_URLS).map(async ([provider, baseUrl]) => {
      try {
        await axios.delete(`${baseUrl}/sessions`, { timeout: 10000 });
        results[provider] = { success: true };
      } catch (error) {
        results[provider] = { success: false, error: error.code || error.message };
      }
    });
    
    await Promise.all(destroys);
    
    const succeeded = Object.values(results).filter(r => r.success).length;
    
    return successResponse(res, {
      message: `Sessões destruídas em ${succeeded}/${Object.keys(results).length} serviços`,
      results
    });
  } catch (error) {
    console.error('❌ Erro ao destruir todas as sessões:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
