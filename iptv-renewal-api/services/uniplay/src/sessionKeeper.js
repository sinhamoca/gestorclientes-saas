/* ========================================
   UNIPLAY SESSION KEEPER
   
   Uniplay usa domínio fixo, então a chave é só "username".
   Tokens expiram relativamente rápido, keeper = 30min idle / 2h max.
   ======================================== */

import { UniplaySession } from './uniplaySession.js';
import { log } from './utils.js';

const MAX_IDLE = parseInt(process.env.SESSION_MAX_IDLE_MINUTES || '30') * 60 * 1000;
const MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '120') * 60 * 1000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '5') * 60 * 1000;

class SessionKeeper {
  constructor() {
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    log(`Session Keeper iniciado (idle: ${MAX_IDLE / 60000}min, maxAge: ${MAX_AGE / 60000}min)`);
  }

  // Chave: só username (domínio é fixo)
  getKey(username) {
    return `gesapioffice:${username}`;
  }

  async getSession({ username, password, proxyConfig }) {
    const key = this.getKey(username);
    const existing = this.sessions.get(key);
    
    if (existing) {
      const now = Date.now();
      const idle = now - (existing.lastActivity || 0);
      const age = now - (existing.loginTime || 0);
      
      if (age > MAX_AGE) {
        log(`Sessão ${key} expirou por idade. Descartando.`, 'WARN');
        await this.destroySession(key);
      } else if (idle > MAX_IDLE) {
        log(`Sessão ${key} ociosa. Descartando.`, 'WARN');
        await this.destroySession(key);
      } else {
        log(`Sessão ${key} encontrada. Verificando...`);
        try {
          await existing.ensureLoggedIn();
          return existing;
        } catch (error) {
          log(`Sessão ${key} inválida: ${error.message}. Recriando.`, 'WARN');
          await this.destroySession(key);
        }
      }
    }
    
    log(`Criando nova sessão: ${key}`);
    const session = new UniplaySession({ username, password, proxyConfig });
    await session.login();
    this.sessions.set(key, session);
    log(`Sessão ${key} criada. Total: ${this.sessions.size}`, 'OK');
    return session;
  }

  async destroySession(key) {
    const session = this.sessions.get(key);
    if (session) {
      await session.logout();
      this.sessions.delete(key);
      log(`Sessão ${key} destruída. Total: ${this.sessions.size}`);
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
      sessions.push({ key, ...session.getInfo() });
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
