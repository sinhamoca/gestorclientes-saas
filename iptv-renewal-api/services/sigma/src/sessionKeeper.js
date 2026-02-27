/* ========================================
   SIGMA SESSION KEEPER (+ cache de clientes)
   
   Tokens Sigma duram ~24h, keeper muito eficiente.
   Agora também cacheia lista completa de clientes
   para permitir busca por nome (campo note).
   ======================================== */

import { SigmaSession } from './sigmaSession.js';
import { log } from './utils.js';

const MAX_IDLE = parseInt(process.env.SESSION_MAX_IDLE_MINUTES || '60') * 60 * 1000;
const MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '720') * 60 * 1000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '10') * 60 * 1000;

class SessionKeeper {
  constructor() {
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    log(`Session Keeper iniciado (idle: ${MAX_IDLE / 60000}min, maxAge: ${MAX_AGE / 60000}min)`);
  }

  getKey(domain, username) {
    return `${domain.replace(/^https?:\/\//, '')}:${username}`;
  }

  async getSession({ domain, username, password, workerUrl, workerSecret, loadClients = false }) {
    const key = this.getKey(domain, username);
    const existing = this.sessions.get(key);
    
    if (existing) {
      const now = Date.now();
      const idle = now - (existing.lastActivity || 0);
      const age = now - (existing.loginTime || 0);
      
      if (age > MAX_AGE) {
        log(`Sessão ${key} expirou por idade (${Math.floor(age / 60000)}min). Descartando.`, 'WARN');
        await this.destroySession(key);
      } else if (idle > MAX_IDLE) {
        log(`Sessão ${key} ociosa por ${Math.floor(idle / 60000)}min. Descartando.`, 'WARN');
        await this.destroySession(key);
      } else {
        log(`Sessão ${key} encontrada em cache. Verificando...`);
        existing.workerUrl = workerUrl;
        existing.workerSecret = workerSecret;
        
        try {
          await existing.ensureLoggedIn();
          
          // Se precisa de clientes e não tem cache, carregar
          if (loadClients && (!existing._cachedCustomers || existing._cachedCustomers.length === 0)) {
            await existing.listAllCustomers();
          }
          
          return existing;
        } catch (error) {
          log(`Sessão ${key} inválida: ${error.message}. Recriando.`, 'WARN');
          await this.destroySession(key);
        }
      }
    }
    
    log(`Criando nova sessão: ${key}`);
    const session = new SigmaSession({ domain, username, password, workerUrl, workerSecret });
    await session.login();
    
    // Carregar clientes se solicitado
    if (loadClients) {
      await session.listAllCustomers();
    }
    
    this.sessions.set(key, session);
    const clientInfo = session._cachedCustomers ? ` | ${session._cachedCustomers.length} clientes cacheados` : '';
    log(`Sessão ${key} criada${clientInfo}. Total ativas: ${this.sessions.size}`, 'OK');
    return session;
  }

  // Refresh da lista de clientes (quando busca por nome falha)
  async refreshCustomers(key) {
    const session = this.sessions.get(key);
    if (!session) return;
    log(`Atualizando cache de clientes para ${key}...`);
    await session.listAllCustomers();
    session.lastActivity = Date.now();
    log(`Cache atualizado: ${session._cachedCustomers?.length || 0} clientes`, 'OK');
  }

  async destroySession(key) {
    const session = this.sessions.get(key);
    if (session) {
      await session.logout();
      this.sessions.delete(key);
      log(`Sessão ${key} destruída. Total ativas: ${this.sessions.size}`);
    }
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, session] of this.sessions.entries()) {
      const idle = now - (session.lastActivity || 0);
      const age = now - (session.loginTime || 0);
      if (idle > MAX_IDLE || age > MAX_AGE) {
        session.logout().catch(() => {});
        this.sessions.delete(key);
        removed++;
      }
    }
    if (removed > 0) log(`Cleanup: ${removed} sessão(ões) removida(s). Ativas: ${this.sessions.size}`);
  }

  getStatus() {
    const sessions = [];
    for (const [key, session] of this.sessions.entries()) {
      const info = session.getInfo();
      info.clientsCached = session._cachedCustomers?.length || 0;
      sessions.push({ key, ...info });
    }
    return {
      total: this.sessions.size,
      maxIdle: `${MAX_IDLE / 60000}min`,
      maxAge: `${MAX_AGE / 60000}min`,
      sessions
    };
  }

  async destroyAll() {
    log(`Destruindo todas as ${this.sessions.size} sessões...`);
    const promises = [];
    for (const [key] of this.sessions.entries()) promises.push(this.destroySession(key));
    await Promise.allSettled(promises);
    clearInterval(this.cleanupTimer);
  }
}

const keeper = new SessionKeeper();
export default keeper;
