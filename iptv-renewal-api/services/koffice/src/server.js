/* ========================================
   KOFFICE MICROSERVICE
   Porta: 4003
   
   Com Session Keeper:
   - Sessões mantidas em memória entre requests
   - Re-login automático quando expira
   - Cleanup periódico de sessões ociosas
   - GET /sessions para monitoramento
   ======================================== */

import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';
import keeper from './sessionKeeper.js';

const app = express();
const PORT = process.env.PORT || 4003;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

// ── Health Check ──
app.get('/health', (req, res) => {
  const status = keeper.getStatus();
  res.json({
    service: 'koffice',
    status: 'online',
    version: '1.1.0',
    port: PORT,
    features: {
      csrf_login: true,
      hcaptcha: true,
      multi_month: true,
      multi_client: true,
      session_keeper: true
    },
    sessions: {
      active: status.total,
      maxIdle: status.maxIdle,
      maxAge: status.maxAge
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── Status detalhado das sessões (admin) ──
app.get('/sessions', (req, res) => {
  res.json(keeper.getStatus());
});

// ── Forçar logout de todas as sessões ──
app.delete('/sessions', async (req, res) => {
  await keeper.destroyAll();
  res.json({ success: true, message: 'Todas as sessões destruídas' });
});

// ── Renovação ──
app.post('/api/renew', (req, res) => renewHandler(req, res, GATEWAY_URL));

// ── Graceful shutdown ──
process.on('SIGTERM', async () => {
  console.log('\n🟠 [KOFFICE] Recebido SIGTERM, encerrando sessões...');
  await keeper.destroyAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🟠 [KOFFICE] Recebido SIGINT, encerrando sessões...');
  await keeper.destroyAll();
  process.exit(0);
});

// ── Iniciar ──
app.listen(PORT, () => {
  console.log(`\n🟠 ========================================`);
  console.log(`   KOFFICE MICROSERVICE v1.1 (com Keeper)`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Session Keeper: ATIVO`);
  console.log(`========================================\n`);
});
