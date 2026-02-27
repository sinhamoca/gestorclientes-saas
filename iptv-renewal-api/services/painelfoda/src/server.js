import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';
import keeper from './sessionKeeper.js';

const app = express();
const PORT = process.env.PORT || 4007;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const status = keeper.getStatus();
  res.json({
    service: 'painelfoda',
    status: 'online',
    version: '1.0.0',
    port: PORT,
    features: {
      configurable_domain: true,
      csrf_login: true,
      cookie_auth: true,
      name_search: true,
      package_id_required: true,
      multi_month_loop: true,
      multi_client: true,
      session_keeper: true,
      client_cache: true
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

app.get('/sessions', (req, res) => res.json(keeper.getStatus()));

app.delete('/sessions', async (req, res) => {
  await keeper.destroyAll();
  res.json({ success: true, message: 'Todas as sessões destruídas' });
});

app.post('/api/renew', (req, res) => renewHandler(req, res));

process.on('SIGTERM', async () => { await keeper.destroyAll(); process.exit(0); });
process.on('SIGINT', async () => { await keeper.destroyAll(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`\n🔥 ========================================`);
  console.log(`   PAINELFODA MICROSERVICE v1.0 + KEEPER`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Domínio: Configurável`);
  console.log(`   Sem captcha | Sem proxy`);
  console.log(`   Session Keeper: ATIVO (+ cache clientes)`);
  console.log(`========================================\n`);
});
