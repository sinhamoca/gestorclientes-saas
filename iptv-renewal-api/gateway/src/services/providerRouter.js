/* ========================================
   PROVIDER ROUTER SERVICE
   
   Roteia requisições de renovação para o
   microserviço correto baseado no provedor.
   
   Cada provedor roda em um container separado
   com sua própria porta e health check.
   ======================================== */

import axios from 'axios';
import { log } from '../utils/helpers.js';

// ========================================
// MAPA DE URLs DOS MICROSERVIÇOS
// ========================================
const PROVIDER_URLS = {
  sigma:        process.env.SIGMA_SERVICE_URL        || 'http://localhost:4001',
  cloudnation:  process.env.CLOUDNATION_SERVICE_URL  || 'http://localhost:4002',
  koffice:      process.env.KOFFICE_SERVICE_URL      || 'http://localhost:4003',
  uniplay:      process.env.UNIPLAY_SERVICE_URL      || 'http://localhost:4004',
  club:         process.env.CLUB_SERVICE_URL          || 'http://localhost:4005',
  rush:         process.env.RUSH_SERVICE_URL          || 'http://localhost:4006',
  painelfoda:   process.env.PAINELFODA_SERVICE_URL    || 'http://localhost:4007'
};

// Cache de status dos serviços
const serviceStatus = new Map();

// ========================================
// ENVIAR RENOVAÇÃO PARA MICROSERVIÇO
// ========================================
export async function routeRenewal(provider, payload) {
  const baseUrl = PROVIDER_URLS[provider];
  
  if (!baseUrl) {
    throw new Error(`Provedor "${provider}" não tem URL configurada`);
  }
  
  const url = `${baseUrl}/api/renew`;
  const startTime = Date.now();
  
  log(`Roteando para ${provider}: ${url}`, 'INFO');
  
  try {
    const response = await axios.post(url, payload, {
      timeout: 120000, // 2 minutos (captcha pode demorar)
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Request': 'true'
      }
    });
    
    const responseTime = Date.now() - startTime;
    
    // Atualizar status do serviço
    serviceStatus.set(provider, {
      status: 'online',
      lastResponse: responseTime,
      lastCheck: Date.now()
    });
    
    return {
      success: response.data.success,
      data: response.data,
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Atualizar status do serviço
    serviceStatus.set(provider, {
      status: 'error',
      lastError: error.message,
      lastCheck: Date.now()
    });
    
    // Erro de conexão (serviço offline)
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      throw new Error(`Serviço ${provider} está offline`);
    }
    
    // Erro de timeout
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Serviço ${provider} não respondeu a tempo (timeout ${responseTime}ms)`);
    }
    
    // Erro retornado pelo microserviço
    if (error.response) {
      return {
        success: false,
        data: error.response.data,
        responseTime,
        statusCode: error.response.status
      };
    }
    
    throw error;
  }
}

// ========================================
// HEALTH CHECK DE TODOS OS SERVIÇOS
// ========================================
export async function checkAllServices() {
  const results = {};
  
  for (const [provider, baseUrl] of Object.entries(PROVIDER_URLS)) {
    try {
      const start = Date.now();
      const response = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
      const responseTime = Date.now() - start;
      
      results[provider] = {
        status: 'online',
        responseTime,
        details: response.data
      };
      
      serviceStatus.set(provider, {
        status: 'online',
        lastResponse: responseTime,
        lastCheck: Date.now()
      });
    } catch (error) {
      results[provider] = {
        status: 'offline',
        error: error.code || error.message
      };
      
      serviceStatus.set(provider, {
        status: 'offline',
        lastError: error.message,
        lastCheck: Date.now()
      });
    }
  }
  
  return results;
}

// ========================================
// STATUS DE UM SERVIÇO ESPECÍFICO
// ========================================
export function getServiceStatus(provider) {
  return serviceStatus.get(provider) || { status: 'unknown' };
}

// ========================================
// STATUS GERAL
// ========================================
export function getAllServiceStatus() {
  const status = {};
  for (const provider of Object.keys(PROVIDER_URLS)) {
    status[provider] = serviceStatus.get(provider) || { status: 'unknown' };
  }
  return status;
}
