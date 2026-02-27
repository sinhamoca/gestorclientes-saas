/* ========================================
   IPTV RENEWAL API - GATEWAY
   
   Servidor principal que gerencia:
   - Autenticação (JWT + API Keys)
   - Sistema de créditos pré-pago
   - Rate limiting por API Key
   - Roteamento para microserviços
   - Logs de renovação
   
   Cada provedor IPTV roda como microserviço
   independente em seu próprio container.
   
   Autor: Isaac
   ======================================== */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initDatabase } from './config/database.js';

// Rotas
import authRoutes from './routes/auth.js';
import renewalRoutes from './routes/renewal.js';
import creditsRoutes from './routes/credits.js';
import usageRoutes from './routes/usage.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import sigmaRoutes from './routes/sigma.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ========================================
// MIDDLEWARES GLOBAIS
// ========================================
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Log de requisições (simples)
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const isRenewal = req.path.includes('/renew');
    
    // Log apenas renovações e erros
    if (isRenewal || res.statusCode >= 400) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    }
  });
  
  next();
});

// ========================================
// ROTAS
// ========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'IPTV Renewal API Gateway',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Autenticação & API Keys
app.use('/api/v1/auth', authRoutes);

// Renovação (API Key)
app.use('/api/v1', renewalRoutes);

// Créditos (JWT)
app.use('/api/v1/credits', creditsRoutes);

// Uso & Provedores
app.use('/api/v1/usage', usageRoutes);

// Admin (requer JWT + is_admin)
app.use('/api/v1/admin', adminRoutes);

// Configurações (admin + interno para microserviços)
app.use('/api/v1/settings', settingsRoutes);

// Sigma (listar pacotes, etc)
app.use('/api/v1/sigma', sigmaRoutes);

// ========================================
// DOCUMENTAÇÃO RÁPIDA
// ========================================
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'IPTV Renewal API',
    version: '1.0.0',
    description: 'API para renovação automática de clientes em painéis IPTV',
    endpoints: {
      auth: {
        'POST /api/v1/auth/login': 'Login (retorna JWT)',
        'GET  /api/v1/auth/profile': 'Perfil + stats (JWT)',
        'GET  /api/v1/auth/api-keys': 'Listar API Keys (JWT)',
        'POST /api/v1/auth/api-keys': 'Criar API Key (JWT)',
        'DEL  /api/v1/auth/api-keys/:id': 'Revogar API Key (JWT)'
      },
      renewal: {
        'POST /api/v1/renew': 'Renovar cliente (API Key)'
      },
      credits: {
        'GET  /api/v1/credits/balance': 'Saldo (JWT)',
        'POST /api/v1/credits/add': 'Adicionar créditos (JWT)',
        'GET  /api/v1/credits/transactions': 'Histórico (JWT)'
      },
      usage: {
        'GET /api/v1/usage/summary': 'Resumo do mês (JWT)',
        'GET /api/v1/usage/history': 'Histórico renovações (JWT)',
        'GET /api/v1/usage/providers/pricing': 'Preços (público)',
        'GET /api/v1/usage/providers/status': 'Status serviços (público)'
      },
      admin: {
        'GET  /api/v1/admin/dashboard': 'Visão geral do sistema (Admin)',
        'GET  /api/v1/admin/users': 'Listar usuários (Admin)',
        'POST /api/v1/admin/users': 'Criar novo usuário (Admin)',
        'GET  /api/v1/admin/users/:id': 'Detalhes do usuário (Admin)',
        'PUT  /api/v1/admin/users/:id/toggle': 'Ativar/desativar usuário (Admin)',
        'POST /api/v1/admin/users/:id/credits': 'Adicionar créditos (Admin)',
        'GET  /api/v1/admin/renewals': 'Logs globais renovação (Admin)'
      },
      settings: {
        'GET  /api/v1/settings': 'Listar configurações (Admin)',
        'PUT  /api/v1/settings': 'Atualizar configuração (Admin)',
        'PUT  /api/v1/settings/bulk': 'Atualizar múltiplas (Admin)',
        'POST /api/v1/settings/test-proxy': 'Testar proxy (Admin)',
        'POST /api/v1/settings/test-captcha': 'Testar chave captcha (Admin)',
        'GET  /api/v1/settings/internal/:cat': 'Config por categoria (Microserviços)'
      },
      sigma: {
        'POST /api/v1/sigma/packages': 'Listar pacotes de um domínio Sigma (API Key, sem créditos)'
      }
    },
    example_renewal: {
      method: 'POST',
      url: '/api/v1/renew',
      headers: { 'X-API-Key': 'irapi_live_xxxxxxxx...' },
      body: {
        provider: 'sigma',
        credentials: { username: 'reseller_user', password: 'reseller_pass' },
        client_id: '12345',
        client_name: 'João Silva',
        telas: 1,
        months: 1,
        sigma_domain: 'https://painel.exemplo.com'
      }
    }
  });
});

// ========================================
// 404
// ========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
    path: req.path
  });
});

// ========================================
// ERROR HANDLER GLOBAL
// ========================================
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor'
  });
});

// ========================================
// INICIAR SERVIDOR
// ========================================
(async () => {
  try {
    // Inicializar banco
    await initDatabase();
    
    // Subir servidor
    app.listen(PORT, () => {
      console.log('');
      console.log('═'.repeat(55));
      console.log('  🚀 IPTV RENEWAL API - GATEWAY');
      console.log('═'.repeat(55));
      console.log(`  🌐 URL:    http://localhost:${PORT}`);
      console.log(`  📋 Docs:   http://localhost:${PORT}/api/v1`);
      console.log(`  💚 Health: http://localhost:${PORT}/health`);
      console.log(`  🔧 Env:    ${process.env.NODE_ENV || 'development'}`);
      console.log('═'.repeat(55));
      console.log('');
    });
  } catch (error) {
    console.error('💥 Falha ao iniciar servidor:', error);
    process.exit(1);
  }
})();

export default app;
