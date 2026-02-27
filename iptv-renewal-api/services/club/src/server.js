import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';

const app = express();
const PORT = process.env.PORT || 4005;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'club',
    status: 'online',
    version: '1.0.0',
    port: PORT,
    features: {
      external_api: true,
      hcaptcha: true,
      jwt_auth: true,
      multi_month_direct: true,
      multi_client: true,
      session_keeper: false
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/renew', (req, res) => renewHandler(req, res, GATEWAY_URL));

app.listen(PORT, () => {
  console.log(`\n🔴 ========================================`);
  console.log(`   CLUB MICROSERVICE v1.0 (stateless)`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   API: pdcapi.io`);
  console.log(`   Captcha: hCaptcha (Anti-Captcha)`);
  console.log(`========================================\n`);
});
