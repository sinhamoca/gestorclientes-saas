import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';
import tracker from './bandwidthTracker.js';

const app = express();
const PORT = process.env.PORT || 4004;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const bw = tracker.getAllStats();
  res.json({
    service: 'uniplay',
    status: 'online',
    version: '1.1.0',
    port: PORT,
    features: {
      fixed_domain: true,
      socks5_proxy: true,
      jwt_auth: true,
      name_search: true,
      p2p_iptv_auto: true,
      suffix_multi_screen: true,
      session_keeper: false,
      bandwidth_tracking: true
    },
    bandwidth: {
      total_kb: bw.global_total_kb,
      total_requests: bw.global_requests,
      tracked_users: bw.total_users
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Stats de bandwidth - compatível com /sessions dos outros microserviços
app.get('/sessions', (req, res) => {
  const bw = tracker.getAllStats();
  res.json({
    total: bw.total_users,
    maxIdle: 'N/A',
    maxAge: 'N/A',
    bandwidth: {
      global_sent_kb: bw.global_sent_kb,
      global_received_kb: bw.global_received_kb,
      global_total_kb: bw.global_total_kb,
      global_requests: bw.global_requests
    },
    sessions: bw.users.map(u => ({
      key: `gesapioffice:${u.username}`,
      domain: 'https://gesapioffice.com',
      username: u.username,
      loggedIn: false,
      bandwidth: {
        sent_kb: u.sent_kb,
        received_kb: u.received_kb,
        total_kb: u.total_kb,
        total_requests: u.total_requests,
        avg_per_request_kb: u.avg_per_request_kb
      },
      lastActivity: u.last_activity,
      sessionMinutes: u.duration_minutes
    }))
  });
});

// Stats detalhado de um usuário específico
app.get('/bandwidth/:username', (req, res) => {
  const stats = tracker.getUserStats(req.params.username);
  if (!stats) return res.status(404).json({ error: 'Usuário não encontrado' });
  const history = tracker.getUserHistory(req.params.username);
  res.json({ ...stats, history });
});

// Limpar stats
app.delete('/sessions', (req, res) => {
  tracker.clearAll();
  res.json({ success: true, message: 'Stats de bandwidth limpos' });
});

app.post('/api/renew', (req, res) => renewHandler(req, res, GATEWAY_URL));

app.listen(PORT, () => {
  console.log(`\n🟣 ========================================`);
  console.log(`   UNIPLAY MICROSERVICE v1.1 (stateless)`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Domínio fixo: gesapioffice.com`);
  console.log(`   Proxy: SOCKS5 obrigatório`);
  console.log(`   Bandwidth tracking: ATIVO`);
  console.log(`========================================\n`);
});
