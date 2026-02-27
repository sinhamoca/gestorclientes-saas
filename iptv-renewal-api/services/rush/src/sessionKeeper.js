import { RushSession } from './rushSession.js';
import { log } from './utils.js';

const MAX_IDLE = parseInt(process.env.SESSION_MAX_IDLE_MINUTES || '60') * 60 * 1000;
const MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '720') * 60 * 1000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '5') * 60 * 1000;

class SessionKeeper {
  constructor() {
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    log(`Session Keeper iniciado (idle: ${MAX_IDLE / 60000}min, maxAge: ${MAX_AGE / 60000}min)`);
  }

  getKey(username) {
    return `rush:${username}`;
  }

  async getSession({ username, password }) {
    const key = this.getKey(username);
    const existing = this.sessions.get(key);
    
    if (existing) {
      const now = Date.now();
      const idle = now - (existing._lastActivity || 0);
      const age = now - (existing._loginTime || 0);
      
      if (age > MAX_AGE) {
        log(`Sessão ${key} expirou por idade (${Math.floor(age / 60000)}min). Descartando.`, 'WARN');
        this.sessions.delete(key);
      } else if (idle > MAX_IDLE) {
        log(`Sessão ${key} ociosa (${Math.floor(idle / 60000)}min). Descartando.`, 'WARN');
        this.sessions.delete(key);
      } else {
        // Testar se token ainda funciona com uma lista rápida
        try {
          await existing.listIPTV();
          existing._lastActivity = now;
          log(`Sessão ${key} reutilizada (${Math.floor(age / 60000)}min)`, 'OK');
          return existing;
        } catch (error) {
          log(`Sessão ${key} inválida: ${error.message}. Recriando.`, 'WARN');
          this.sessions.delete(key);
        }
      }
    }
    
    // Criar nova
    log(`Criando nova sessão: ${key}`);
    const session = new RushSession({ username, password });
    await session.login();
    session._loginTime = Date.now();
    session._lastActivity = Date.now();
    session._loginCount = (existing?._loginCount || 0) + 1;
    session._renewCount = existing?._renewCount || 0;
    this.sessions.set(key, session);
    log(`Sessão ${key} criada. Total: ${this.sessions.size}`, 'OK');
    return session;
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, session] of this.sessions.entries()) {
      const idle = now - (session._lastActivity || 0);
      const age = now - (session._loginTime || 0);
      if (idle > MAX_IDLE || age > MAX_AGE) {
        session.logout();
        this.sessions.delete(key);
        removed++;
      }
    }
    if (removed > 0) log(`Cleanup: ${removed} removida(s). Ativas: ${this.sessions.size}`);
  }

  getStatus() {
    const now = Date.now();
    const sessions = [];
    for (const [key, session] of this.sessions.entries()) {
      sessions.push({
        key,
        username: session.username,
        loggedIn: !!session.token,
        loginCount: session._loginCount || 1,
        renewCount: session._renewCount || 0,
        sessionMinutes: session._loginTime ? Math.floor((now - session._loginTime) / 60000) : null,
        idleMinutes: session._lastActivity ? Math.floor((now - session._lastActivity) / 60000) : null
      });
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
    for (const [, session] of this.sessions.entries()) session.logout();
    this.sessions.clear();
    clearInterval(this.cleanupTimer);
  }
}

const keeper = new SessionKeeper();
export default keeper;
