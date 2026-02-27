import express from 'express';
import cors from 'cors';
import { renewHandler } from './renew.js';
import keeper from './sessionKeeper.js';

const app = express();
const PORT = process.env.PORT || 4001;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const status = keeper.getStatus();
  res.json({
    service: 'sigma',
    status: 'online',
    version: '1.0.0',
    port: PORT,
    features: {
      cloudflare_worker: true,
      jwt_auth: true,
      username_search: true,
      name_search: true,
      client_cache: true,
      suffix_multi_screen: true,
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

// ========================================
// LISTAR PACOTES SIGMA
// POST /api/list-packages
// Body: { credentials: { username, password }, sigma_domain }
// ========================================
app.post('/api/list-packages', async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (req.headers['x-gateway-request'] !== 'true') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao gateway' });
    }
    
    const { credentials, sigma_domain } = req.body;
    
    if (!credentials?.username || !credentials?.password) {
      return res.status(400).json({ success: false, error: 'Credenciais obrigatórias: { username, password }' });
    }
    
    if (!sigma_domain) {
      return res.status(400).json({ success: false, error: 'sigma_domain é obrigatório' });
    }
    
    console.log(`📦 [SIGMA] Listando pacotes de ${sigma_domain}`);
    
    // Buscar Worker config do gateway (igual ao renew.js)
    const { fetchWorkerConfig } = await import('./settings.js');
    const workerConfig = await fetchWorkerConfig(GATEWAY_URL);
    
    if (!workerConfig.workerUrl || !workerConfig.workerSecret) {
      return res.status(500).json({
        success: false,
        error: 'Cloudflare Worker não configurado. Configure no admin em Configurações > Cloudflare Workers.'
      });
    }
    
    // Criar sessão e fazer login
    const { SigmaSession } = await import('./sigmaSession.js');
    
    let domain = sigma_domain.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
    
    const session = new SigmaSession({
      domain,
      username: credentials.username,
      password: credentials.password,
      workerUrl: workerConfig.workerUrl,
      workerSecret: workerConfig.workerSecret
    });
    
    await session.login();
    
    // Buscar servidores (contêm os pacotes)
    const serversResponse = await session.request('GET', '/api/servers', null, {
      'Accept': 'application/json'
    });
    
    let servers = [];
    if (serversResponse && Array.isArray(serversResponse)) {
      servers = serversResponse;
    } else if (serversResponse?.data && Array.isArray(serversResponse.data)) {
      servers = serversResponse.data;
    }
    
    // Extrair pacotes de todos os servidores
    const allPackages = [];
    
    for (const server of servers) {
      const packages = server.packages || [];
      
      for (const pkg of packages) {
        allPackages.push({
          id: pkg.id,
          name: pkg.name,
          server_id: server.id,
          server_name: server.name,
          status: pkg.status || 'UNKNOWN',
          price: pkg.plan_price || 0,
          credits: pkg.credits || 0,
          duration: pkg.duration || 1,
          duration_type: pkg.duration_in || 'MONTHS',
          connections: pkg.connections || 1,
          is_trial: pkg.is_trial || 'NO',
          is_mag: pkg.is_mag || 'NO',
          is_restreamer: pkg.is_restreamer || 'NO'
        });
      }
    }
    
    // Logout
    await session.logout();
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [SIGMA] ${allPackages.length} pacotes em ${servers.length} servidores (${responseTime}ms)`);
    
    res.json({
      success: true,
      domain: sigma_domain,
      servers_count: servers.length,
      packages_count: allPackages.length,
      packages: allPackages,
      response_time_ms: responseTime
    });
    
  } catch (error) {
    console.error('❌ [SIGMA] Erro ao listar pacotes:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      response_time_ms: Date.now() - startTime
    });
  }
});

process.on('SIGTERM', async () => { await keeper.destroyAll(); process.exit(0); });
process.on('SIGINT', async () => { await keeper.destroyAll(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`\n🔵 ========================================`);
  console.log(`   SIGMA MICROSERVICE v1.0 (com Keeper)`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Session Keeper: ATIVO`);
  console.log(`========================================\n`);
});
