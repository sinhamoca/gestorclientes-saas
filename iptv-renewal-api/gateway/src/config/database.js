/* ========================================
   DATABASE CONFIG - IPTV RENEWAL API
   PostgreSQL com pool de conexões
   
   Tabelas:
   - users: Donos de gestores (clientes da API)
   - api_keys: Chaves de autenticação
   - credit_balances: Saldo de créditos
   - credit_transactions: Histórico de compras/gastos
   - renewal_logs: Log de cada renovação
   - provider_pricing: Preços por provedor
   ======================================== */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'iptv_renewal_api',
  user: process.env.POSTGRES_USER || 'iptv_api',
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Setar timezone em cada nova conexão
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

// ========================================
// QUERY HELPER
// ========================================
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`⚠️  Query lenta (${duration}ms):`, text.substring(0, 100));
  }
  
  return result;
}

// ========================================
// INICIALIZAR BANCO
// ========================================
export async function initDatabase() {
  console.log('🗄️  Inicializando banco de dados...\n');

  // ── TABELA: users ──
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      is_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ users');

  // ── TABELA: api_keys ──
  await query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key_hash VARCHAR(255) UNIQUE NOT NULL,
      key_prefix VARCHAR(12) NOT NULL,
      key_encrypted TEXT,
      name VARCHAR(100) DEFAULT 'default',
      is_active BOOLEAN DEFAULT true,
      rate_limit INTEGER DEFAULT 60,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Migração: adicionar coluna key_encrypted se não existir
  await query(`
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_encrypted TEXT
  `).catch(() => {});
  
  console.log('  ✅ api_keys');

  // ── TABELA: credit_balances ──
  await query(`
    CREATE TABLE IF NOT EXISTS credit_balances (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance DECIMAL(10,2) DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ credit_balances');

  // ── TABELA: credit_transactions ──
  await query(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'bonus')),
      amount DECIMAL(10,2) NOT NULL,
      balance_after DECIMAL(10,2) NOT NULL,
      description TEXT,
      reference_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ credit_transactions');

  // ── TABELA: renewal_logs ──
  await query(`
    CREATE TABLE IF NOT EXISTS renewal_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      api_key_id INTEGER REFERENCES api_keys(id),
      provider VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
      telas INTEGER DEFAULT 1,
      cost DECIMAL(10,4) DEFAULT 0,
      billing_mode VARCHAR(20) DEFAULT 'per_operation',
      request_ip VARCHAR(45),
      response_time_ms INTEGER,
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ renewal_logs');

  // ── TABELA: provider_pricing ──
  await query(`
    CREATE TABLE IF NOT EXISTS provider_pricing (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      cost_per_operation DECIMAL(10,4) DEFAULT 0,
      cost_per_tela DECIMAL(10,4) DEFAULT 0,
      billing_mode VARCHAR(20) NOT NULL CHECK (billing_mode IN ('per_operation', 'per_tela')),
      has_keeper BOOLEAN DEFAULT false,
      keeper_ttl_hours INTEGER DEFAULT 24,
      requires_proxy BOOLEAN DEFAULT false,
      requires_captcha VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      description TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ provider_pricing');

  // ── ÍNDICES ──
  await query(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_renewal_logs_user ON renewal_logs(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_renewal_logs_provider ON renewal_logs(provider, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC)`);
  console.log('  ✅ índices');

  // ── TABELA: system_settings ──
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      category VARCHAR(50) DEFAULT 'general',
      is_secret BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✅ system_settings');

  // ── SEED: Preços dos provedores ──
  await seedProviderPricing();

  // ── SEED: Settings padrão ──
  await seedSettings();

  // ── MIGRAÇÃO: Adicionar is_admin se não existir ──
  await query(`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `);

  // ── SEED: Admin padrão (se não existir) ──
  await seedAdminUser();

  console.log('\n✅ Banco inicializado com sucesso!\n');
}

// ========================================
// SEED: PREÇOS DOS PROVEDORES
// ========================================
async function seedProviderPricing() {
  const providers = [
    {
      provider: 'sigma',
      display_name: 'Sigma',
      cost_per_operation: 0.10,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: false,
      requires_proxy: false,
      requires_captcha: null,
      description: 'API via Cloudflare Worker. Sem captcha, sem proxy. Custo operacional zero.'
    },
    {
      provider: 'cloudnation',
      display_name: 'CloudNation (Live21)',
      cost_per_operation: 0.15,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: true,
      keeper_ttl_hours: 24,
      requires_proxy: false,
      requires_captcha: 'turnstile',
      description: 'Keeper 24h. Captcha Turnstile apenas no login. Multi-tela sem custo adicional.'
    },
    {
      provider: 'koffice',
      display_name: 'Koffice',
      cost_per_operation: 0.15,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: true,
      keeper_ttl_hours: 24,
      requires_proxy: false,
      requires_captcha: 'hcaptcha',
      description: 'Keeper 24h. hCaptcha apenas no login. Renova N meses em 1 request.'
    },
    {
      provider: 'club',
      display_name: 'Club',
      cost_per_operation: 0.25,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: false,
      requires_proxy: false,
      requires_captcha: 'hcaptcha',
      description: 'Sem keeper (sessão única). hCaptcha a cada login. Multi-tela sem custo adicional.'
    },
    {
      provider: 'uniplay',
      display_name: 'Uniplay',
      cost_per_operation: 0,
      cost_per_tela: 0.20,
      billing_mode: 'per_tela',
      has_keeper: false,
      requires_proxy: true,
      requires_captcha: null,
      description: 'Proxy residencial obrigatório. Cobra por tela (cada tela = 1 request via proxy).'
    },
    {
      provider: 'painelfoda',
      display_name: 'PainelFoda',
      cost_per_operation: 0.10,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: true,
      keeper_ttl_hours: 24,
      requires_proxy: false,
      requires_captcha: null,
      description: 'Keeper 24h. Sem captcha, sem proxy. Login via CSRF simples.'
    },
    {
      provider: 'rush',
      display_name: 'Rush',
      cost_per_operation: 0.10,
      cost_per_tela: 0,
      billing_mode: 'per_operation',
      has_keeper: true,
      keeper_ttl_hours: 24,
      requires_proxy: false,
      requires_captcha: null,
      description: 'Keeper 24h. API REST pura. Sem captcha, sem proxy. O mais leve.'
    }
  ];

  for (const p of providers) {
    await query(`
      INSERT INTO provider_pricing 
        (provider, display_name, cost_per_operation, cost_per_tela, billing_mode, 
         has_keeper, keeper_ttl_hours, requires_proxy, requires_captcha, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (provider) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        cost_per_operation = EXCLUDED.cost_per_operation,
        cost_per_tela = EXCLUDED.cost_per_tela,
        billing_mode = EXCLUDED.billing_mode,
        has_keeper = EXCLUDED.has_keeper,
        keeper_ttl_hours = EXCLUDED.keeper_ttl_hours,
        requires_proxy = EXCLUDED.requires_proxy,
        requires_captcha = EXCLUDED.requires_captcha,
        description = EXCLUDED.description,
        updated_at = NOW()
    `, [
      p.provider, p.display_name, p.cost_per_operation, p.cost_per_tela,
      p.billing_mode, p.has_keeper, p.keeper_ttl_hours || 24,
      p.requires_proxy, p.requires_captcha, p.description
    ]);
  }
  console.log('  ✅ provider_pricing (seed)');
}

// ========================================
// SEED: SETTINGS PADRÃO
// ========================================
async function seedSettings() {
  const settings = [
    // Captcha
    { key: 'captcha_2captcha_key', value: '', description: 'API Key do 2Captcha (usado para Turnstile - CloudNation/Live21)', category: 'captcha', is_secret: true },
    { key: 'captcha_anticaptcha_key', value: '', description: 'API Key do Anti-Captcha (usado para hCaptcha - Koffice, Club)', category: 'captcha', is_secret: true },
    
    // Proxy
    { key: 'proxy_host', value: '', description: 'Host do proxy residencial (ex: br.proxy.com)', category: 'proxy', is_secret: false },
    { key: 'proxy_port', value: '', description: 'Porta do proxy', category: 'proxy', is_secret: false },
    { key: 'proxy_username', value: '', description: 'Usuário do proxy', category: 'proxy', is_secret: false },
    { key: 'proxy_password', value: '', description: 'Senha do proxy', category: 'proxy', is_secret: true },
    { key: 'proxy_protocol', value: 'socks5', description: 'Protocolo do proxy (http, https, socks5)', category: 'proxy', is_secret: false },
    
    // Cloudflare Workers
    { key: 'sigma_worker_url', value: '', description: 'URL do Cloudflare Worker para Sigma', category: 'workers', is_secret: false },
    { key: 'sigma_worker_secret', value: '', description: 'Secret key do Worker Sigma', category: 'workers', is_secret: true },
  ];

  for (const s of settings) {
    await query(`
      INSERT INTO system_settings (key, value, description, category, is_secret)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (key) DO NOTHING
    `, [s.key, s.value, s.description, s.category, s.is_secret]);
  }
  console.log('  ✅ system_settings (seed)');
}

// ========================================
// SEED: ADMIN PADRÃO
// ========================================
async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@iptvapi.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
  
  const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await query(
      'INSERT INTO users (name, email, password_hash, is_admin) VALUES ($1, $2, $3, true)',
      ['Administrador', adminEmail, hash]
    );
    console.log(`  ✅ admin seed (${adminEmail})`);
  } else {
    // Garantir que é admin
    await query('UPDATE users SET is_admin = true WHERE email = $1', [adminEmail]);
    console.log('  ✅ admin (existente)');
  }
}

// ========================================
// EXPORTS
// ========================================
export default pool;
export { pool };
