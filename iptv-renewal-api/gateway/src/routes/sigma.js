/* ========================================
   SIGMA ROUTES
   Rotas específicas do Sigma (sem cobrança de créditos)
   Aceita JWT (dashboard) ou API Key (curl/gestor externo)
   ======================================== */

import { Router } from 'express';
import axios from 'axios';
import { authenticateApiKey, authenticateJWT } from '../middleware/auth.js';
import { errorResponse, log } from '../utils/helpers.js';

const router = Router();

const SIGMA_SERVICE_URL = process.env.SIGMA_SERVICE_URL || 'http://localhost:4001';

// Middleware que aceita JWT OU API Key
async function authenticateAny(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const authHeader = req.headers.authorization;
  
  if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  } else {
    return errorResponse(res, 'Autenticação necessária. Use JWT (Bearer) ou API Key (X-API-Key).', 401);
  }
}

// POST /api/v1/sigma/packages
// Listar pacotes disponíveis em um domínio Sigma
// Aceita JWT ou API Key, NÃO cobra créditos
router.post('/packages',
  authenticateAny,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { credentials, sigma_domain } = req.body;
      
      if (!credentials?.username || !credentials?.password) {
        return res.status(400).json({ success: false, error: 'Credenciais obrigatórias: { username, password }' });
      }
      
      if (!sigma_domain) {
        return res.status(400).json({ success: false, error: 'sigma_domain é obrigatório' });
      }
      
      log(`Listando pacotes Sigma: ${sigma_domain} | User: ${req.apiUser?.name || req.user?.name || 'dashboard'}`);
      
      // Proxy para microserviço Sigma
      const response = await axios.post(`${SIGMA_SERVICE_URL}/api/list-packages`, {
        credentials,
        sigma_domain
      }, {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Request': 'true'
        }
      });
      
      res.json(response.data);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({ success: false, error: 'Serviço Sigma offline', response_time_ms: responseTime });
      }
      
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      
      res.status(500).json({ success: false, error: error.message, response_time_ms: responseTime });
    }
  }
);

export default router;
