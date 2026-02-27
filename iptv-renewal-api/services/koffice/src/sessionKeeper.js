/* ========================================
   KOFFICE SESSION KEEPER
   
   Mantém sessões ativas em memória:
   - Chave: "domain:username"
   - Reutiliza sessão se ainda válida
   - Re-loga automaticamente se expirou
   - Cleanup automático de sessões ociosas
   
   Benefícios:
   - Sem captcha repetido (resolve 1x, usa N vezes)
   - Login instantâneo (cookies já em memória)
   - ~1s por renovação vs ~25s com captcha novo
   
   Configuração:
   - SESSION_MAX_IDLE_MINUTES: tempo ocioso antes de descartar (padrão 30)
   - SESSION_MAX_AGE_MINUTES: tempo máximo antes de forçar re-login (padrão 120)
   - CLEANUP_INTERVAL_MINUTES: intervalo de limpeza (padrão 5)
   ======================================== */

import { KofficeSession } from './kofficeSession.js';
import { log } from './utils.js';

// Configurações
const MAX_IDLE = parseInt(process.env.SESSION_MAX_IDLE_MINUTES || '30') * 60 * 1000;
const MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '120') * 60 * 1000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '5') * 60 * 1000;

class SessionKeeper {
  constructor() {
    this.sessions = new Map();
    
    // Cleanup periódico
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    
    log(`Session Keeper iniciado (idle: ${MAX_IDLE / 60000}min, maxAge: ${MAX_AGE / 60000}min)`);
  }

  // ========================================
  // CHAVE DA SESSÃO
  // ========================================
  
  getKey(domain, username) {
    return `${domain.replace(/^https?:\/\//, '')}:${username}`;
  }

  // ========================================
  // OBTER OU CRIAR SESSÃO
  // ========================================
  
  async getSession({ domain, username, password, anticaptchaKey }) {
    const key = this.getKey(domain, username);
    
    // Verificar se já existe sessão ativa
    const existing = this.sessions.get(key);
    
    if (existing) {
      const now = Date.now();
      const idle = now - (existing.lastActivity || 0);
      const age = now - (existing.loginTime || 0);
      
      // Verificar se excedeu tempo máximo de vida
      if (age > MAX_AGE) {
        log(`Sessão ${key} expirou por idade (${Math.floor(age / 60000)}min). Descartando.`, 'WARN');
        await this.destroySession(key);
      }
      // Verificar se ficou ociosa demais
      else if (idle > MAX_IDLE) {
        log(`Sessão ${key} ociosa por ${Math.floor(idle / 60000)}min. Descartando.`, 'WARN');
        await this.destroySession(key);
      }
      // Sessão parece válida - verificar de verdade
      else {
        log(`Sessão ${key} encontrada em cache. Verificando...`);
        
        // Atualizar anticaptchaKey (pode ter mudado no admin)
        existing.anticaptchaKey = anticaptchaKey;
        
        try {
          await existing.ensureLoggedIn();
          return existing;
        } catch (error) {
          log(`Sessão ${key} inválida: ${error.message}. Recriando.`, 'WARN');
          await this.destroySession(key);
        }
      }
    }
    
    // Criar nova sessão
    log(`Criando nova sessão: ${key}`);
    
    const session = new KofficeSession({ domain, username, password, anticaptchaKey });
    await session.login();
    
    this.sessions.set(key, session);
    
    log(`Sessão ${key} criada e armazenada. Total ativas: ${this.sessions.size}`, 'OK');
    
    return session;
  }

  // ========================================
  // DESTRUIR SESSÃO
  // ========================================
  
  async destroySession(key) {
    const session = this.sessions.get(key);
    if (!session) return;
    
    try {
      await session.logout();
    } catch (e) {
      // Ignorar erro de logout
    }
    
    this.sessions.delete(key);
    log(`Sessão ${key} destruída. Total ativas: ${this.sessions.size}`);
  }

  // ========================================
  // CLEANUP AUTOMÁTICO
  // ========================================
  
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, session] of this.sessions.entries()) {
      const idle = now - (session.lastActivity || 0);
      const age = now - (session.loginTime || 0);
      
      if (idle > MAX_IDLE || age > MAX_AGE) {
        // Logout assíncrono sem await (best-effort)
        session.logout().catch(() => {});
        this.sessions.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      log(`Cleanup: ${removed} sessão(ões) removida(s). Ativas: ${this.sessions.size}`);
    }
  }

  // ========================================
  // STATUS (para health check)
  // ========================================
  
  getStatus() {
    const sessions = [];
    
    for (const [key, session] of this.sessions.entries()) {
      sessions.push({
        key,
        ...session.getInfo()
      });
    }
    
    return {
      total: this.sessions.size,
      maxIdle: `${MAX_IDLE / 60000}min`,
      maxAge: `${MAX_AGE / 60000}min`,
      sessions
    };
  }

  // ========================================
  // FORÇAR LOGOUT DE TODAS
  // ========================================
  
  async destroyAll() {
    log(`Destruindo todas as ${this.sessions.size} sessões...`);
    
    const promises = [];
    for (const [key] of this.sessions.entries()) {
      promises.push(this.destroySession(key));
    }
    
    await Promise.allSettled(promises);
    clearInterval(this.cleanupTimer);
  }
}

// Singleton - uma instância por microserviço
const keeper = new SessionKeeper();

export default keeper;
