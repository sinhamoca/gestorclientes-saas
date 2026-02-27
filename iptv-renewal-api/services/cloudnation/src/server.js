import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';
import keeper from './sessionKeeper.js';

const app = express();
const PORT = process.env.PORT || 4002;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const status = keeper.getStatus();
  res.json({
    service: 'cloudnation',
    status: 'online',
    version: '1.0.0',
    port: PORT,
    features: {
      fixed_domain: true,
      turnstile_captcha: true,
      csrf_login: true,
      cookie_auth: true,
      name_search: true,
      client_cache: true,
      suffix_multi_screen: true,
      multi_month_loop: true,
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

app.get('/sessions', (req, res) => res.json(keeper.getStatus()));

app.delete('/sessions', async (req, res) => {
  await keeper.destroyAll();
  res.json({ success: true, message: 'Todas as sessões destruídas' });
});

app.post('/api/renew', (req, res) => renewHandler(req, res, GATEWAY_URL));

process.on('SIGTERM', async () => { await keeper.destroyAll(); process.exit(0); });
process.on('SIGINT', async () => { await keeper.destroyAll(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`\n🟢 ========================================`);
  console.log(`   CLOUDNATION/LIVE21 MICROSERVICE v1.0`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Domínio fixo: painel.cloudnation.top`);
  console.log(`   Captcha: Cloudflare Turnstile (2Captcha)`);
  console.log(`   Session Keeper: ATIVO`);
  console.log(`========================================\n`);
});
