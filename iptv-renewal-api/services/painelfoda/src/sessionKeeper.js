import { PainelFodaSession } from './painelfodaSession.js';
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

  // Chave única: domínio + username (múltiplos painéis possíveis)
  getKey(domain, username) {
    const d = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `painelfoda:${d}:${username}`;
  }

  async getSession({ domain, username, password }) {
    const key = this.getKey(domain, username);
    const existing = this.sessions.get(key);
    
    if (existing) {
      const now = Date.now();
      const idle = now - (existing._keeperLastActivity || 0);
      const age = now - (existing._keeperLoginTime || 0);
      
      if (age > MAX_AGE) {
        log(`Sessão ${key} expirou por idade (${Math.floor(age / 60000)}min). Descartando.`, 'WARN');
        await this.destroySession(key);
      } else if (idle > MAX_IDLE) {
        log(`Sessão ${key} ociosa (${Math.floor(idle / 60000)}min). Descartando.`, 'WARN');
        await this.destroySession(key);
      } else {
        // Verificar se cookies ainda válidos (GET rápido no /lines/manage)
        try {
          const response = await existing.client.get('/lines/manage', {
            headers: { 'Cookie': existing.getCookieString() },
            maxRedirects: 0,
            validateStatus: s => s >= 200 && s < 400,
            timeout: 10000
          });
          
          existing.extractCookies(response);
          
          // Se redireciona para login → expirada
          if (response.status === 302) {
            const loc = response.headers.location || '';
            if (loc.includes('login')) {
              log(`Sessão ${key} expirada (redirect login). Recriando.`, 'WARN');
              await this.destroySession(key);
              // Fall through para criar nova
            } else {
              existing._keeperLastActivity = now;
              log(`Sessão ${key} reutilizada (${Math.floor(age / 60000)}min, ${existing.clients.length} clientes em cache)`, 'OK');
              return existing;
            }
          } else {
            existing._keeperLastActivity = now;
            log(`Sessão ${key} reutilizada (${Math.floor(age / 60000)}min, ${existing.clients.length} clientes em cache)`, 'OK');
            return existing;
          }
        } catch (error) {
          log(`Sessão ${key} check falhou: ${error.message}. Recriando.`, 'WARN');
          await this.destroySession(key);
        }
      }
    }
    
    // Criar nova sessão completa: login + member_id + listagem
    log(`Criando nova sessão: ${key} (login + member_id + clientes)`);
    const session = new PainelFodaSession({ domain, username, password });
    
    await session.login();
    const memberId = await session.getMemberId();
    await session.listClients(memberId);
    
    session._keeperLoginTime = Date.now();
    session._keeperLastActivity = Date.now();
    session._keeperLoginCount = (existing?._keeperLoginCount || 0) + 1;
    session._keeperRenewCount = existing?._keeperRenewCount || 0;
    
    this.sessions.set(key, session);
    log(`Sessão ${key} criada (${session.clients.length} clientes). Total: ${this.sessions.size}`, 'OK');
    return session;
  }

  // Refresh da lista de clientes (útil se cliente foi adicionado recentemente)
  async refreshClients(key) {
    const session = this.sessions.get(key);
    if (!session || !session.memberId) return;
    
    log(`Atualizando lista de clientes para ${key}...`);
    await session.listClients(session.memberId);
    session._keeperLastActivity = Date.now();
    log(`Lista atualizada: ${session.clients.length} clientes`, 'OK');
  }

  async destroySession(key) {
    const session = this.sessions.get(key);
    if (session) {
      session.logout();
      this.sessions.delete(key);
    }
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, session] of this.sessions.entries()) {
      const idle = now - (session._keeperLastActivity || 0);
      const age = now - (session._keeperLoginTime || 0);
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
        domain: session.baseURL,
        username: session.username,
        loggedIn: Object.keys(session.cookies).length > 0,
        memberId: session.memberId,
        clientsCached: session.clients.length,
        loginCount: session._keeperLoginCount || 1,
        renewCount: session._keeperRenewCount || 0,
        sessionMinutes: session._keeperLoginTime ? Math.floor((now - session._keeperLoginTime) / 60000) : null,
        idleMinutes: session._keeperLastActivity ? Math.floor((now - session._keeperLastActivity) / 60000) : null
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
