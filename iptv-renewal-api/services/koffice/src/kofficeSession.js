/* ========================================
   KOFFICE SESSION
   
   Gerencia uma sessão completa com um painel Koffice:
   - Login com CSRF Token
   - Resolução de hCaptcha via Anti-Captcha
   - Gerenciamento de cookies
   - Renovação de clientes
   
   Baseado no koffice-renewal.js e KofficeSession.js
   do iptv-managerv26, adaptado para microserviço.
   ======================================== */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from './utils.js';

export class KofficeSession {
  constructor({ domain, username, password, anticaptchaKey }) {
    this.domain = domain.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.anticaptchaKey = anticaptchaKey;
    this.cookies = {};
    this.loggedIn = false;
    
    // Metadados do keeper
    this.loginTime = null;
    this.lastActivity = null;
    this.loginCount = 0;
    this.renewCount = 0;
    
    // Cliente HTTP
    this.client = axios.create({
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });
  }

  // ========================================
  // INFO (para logs/debug do keeper)
  // ========================================
  
  getInfo() {
    const now = Date.now();
    return {
      domain: this.domain,
      username: this.username,
      loggedIn: this.loggedIn,
      loginCount: this.loginCount,
      renewCount: this.renewCount,
      cookiesCount: Object.keys(this.cookies).length,
      loginTime: this.loginTime,
      lastActivity: this.lastActivity,
      idleMinutes: this.lastActivity ? Math.floor((now - this.lastActivity) / 60000) : null,
      sessionMinutes: this.loginTime ? Math.floor((now - this.loginTime) / 60000) : null
    };
  }

  // ========================================
  // COOKIES
  // ========================================
  
  saveCookies(response) {
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) return;
    
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const cookie of cookies) {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (match) {
        this.cookies[match[1].trim()] = match[2].trim();
      }
    }
  }
  
  getCookieString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  // ========================================
  // 1. OBTER CSRF TOKEN + DETECTAR HCAPTCHA
  // ========================================
  
  async getCsrfToken() {
    log('Acessando página de login...');
    
    const response = await this.client.get(`${this.domain}/login/`);
    this.saveCookies(response);
    
    if (response.status !== 200) {
      throw new Error(`Falha ao acessar página de login: Status ${response.status}`);
    }
    
    const $ = cheerio.load(response.data);
    
    // Extrair CSRF token
    const csrfToken = $('input[name="csrf_token"]').val();
    if (!csrfToken) {
      throw new Error('CSRF Token não encontrado na página de login');
    }
    
    // Detectar hCaptcha
    const hcaptchaSiteKey = $('.h-captcha').attr('data-sitekey') 
      || $('[data-sitekey]').attr('data-sitekey');
    
    log(`CSRF obtido. hCaptcha: ${hcaptchaSiteKey ? 'SIM' : 'NÃO'}`);
    
    return { csrfToken, hasHCaptcha: !!hcaptchaSiteKey, hcaptchaSiteKey };
  }

  // ========================================
  // 2. RESOLVER HCAPTCHA VIA ANTI-CAPTCHA
  // ========================================
  
  async solveHCaptcha(siteKey) {
    if (!this.anticaptchaKey) {
      throw new Error('Anti-Captcha API Key não configurada. Configure no painel admin em Configurações > Captcha.');
    }
    
    log('Resolvendo hCaptcha via Anti-Captcha...');
    
    // Criar tarefa
    const createTask = await axios.post('https://api.anti-captcha.com/createTask', {
      clientKey: this.anticaptchaKey,
      task: {
        type: 'HCaptchaTaskProxyless',
        websiteURL: `${this.domain}/login/`,
        websiteKey: siteKey
      }
    }, { timeout: 30000 });
    
    if (createTask.data.errorId !== 0) {
      throw new Error(`Anti-Captcha erro ao criar tarefa: ${createTask.data.errorDescription}`);
    }
    
    const taskId = createTask.data.taskId;
    log(`Anti-Captcha task criada: ${taskId}`);
    
    // Aguardar resolução (máximo 3 minutos, polling a cada 3s)
    const maxAttempts = 60;
    
    for (let i = 0; i < maxAttempts; i++) {
      await this.delay(3);
      
      const result = await axios.post('https://api.anti-captcha.com/getTaskResult', {
        clientKey: this.anticaptchaKey,
        taskId
      }, { timeout: 15000 });
      
      if (result.data.status === 'ready') {
        const elapsed = (i + 1) * 3;
        log(`hCaptcha resolvido em ${elapsed}s!`, 'OK');
        return result.data.solution.gRecaptchaResponse;
      }
      
      if (result.data.errorId !== 0) {
        throw new Error(`Anti-Captcha erro: ${result.data.errorDescription}`);
      }
      
      // Log a cada 30s
      if ((i + 1) % 10 === 0) {
        log(`Aguardando captcha... ${(i + 1) * 3}s`);
      }
    }
    
    throw new Error('Timeout ao resolver hCaptcha (3 minutos)');
  }

  // ========================================
  // 3. LOGIN COMPLETO
  // ========================================
  
  async login() {
    log(`Login em ${this.domain} (${this.username})`);
    
    // 1. Obter CSRF + detectar captcha
    const { csrfToken, hasHCaptcha, hcaptchaSiteKey } = await this.getCsrfToken();
    
    // 2. Resolver captcha se necessário
    let captchaToken = null;
    if (hasHCaptcha) {
      captchaToken = await this.solveHCaptcha(hcaptchaSiteKey);
    }
    
    // 3. Montar payload de login
    const payload = new URLSearchParams({
      try_login: '1',
      csrf_token: csrfToken,
      username: this.username,
      password: this.password
    });
    
    if (captchaToken) {
      payload.append('g-recaptcha-response', captchaToken);
      payload.append('h-captcha-response', captchaToken);
    }
    
    // 4. Enviar login
    log('Enviando credenciais...');
    
    const loginResponse = await this.client.post(`${this.domain}/login/`, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.getCookieString(),
        'Referer': `${this.domain}/login/`,
        'Origin': this.domain
      },
      maxRedirects: 0
    });
    
    this.saveCookies(loginResponse);
    
    // 5. Seguir redirects manualmente (capturando cookies em cada hop)
    let currentResponse = loginResponse;
    let redirectCount = 0;
    
    while ((currentResponse.status === 302 || currentResponse.status === 301) && redirectCount < 5) {
      const location = currentResponse.headers.location;
      
      // Se redirecionou de volta para /login → credenciais inválidas
      if (!location || location.includes('/login')) {
        throw new Error('Login falhou - credenciais inválidas ou captcha incorreto');
      }
      
      redirectCount++;
      const fullUrl = location.startsWith('http') ? location : `${this.domain}${location}`;
      
      log(`Redirect ${redirectCount}: ${fullUrl}`);
      
      currentResponse = await this.client.get(fullUrl, {
        headers: { 'Cookie': this.getCookieString() },
        maxRedirects: 0
      });
      
      this.saveCookies(currentResponse);
    }
    
    // 6. Validar se está logado
    const html = typeof currentResponse.data === 'string' ? currentResponse.data : '';
    
    // Indicadores NEGATIVOS (ainda na página de login)
    const hasLoginForm = html.includes('csrf_token') || html.includes('try_login') || html.includes('h-captcha');
    
    // Indicadores POSITIVOS (logou com sucesso)
    const hasLoggedInSign = html.includes('logout') || html.includes('sair') || html.includes('dashboard') || html.includes('/clients');
    
    if (hasLoggedInSign && !hasLoginForm) {
      this.loggedIn = true;
      this.loginTime = Date.now();
      this.lastActivity = Date.now();
      this.loginCount++;
      log(`Login OK! ${Object.keys(this.cookies).length} cookies (login #${this.loginCount})`, 'OK');
      return true;
    }
    
    if (hasLoginForm) {
      throw new Error('Login falhou - credenciais inválidas (página de login retornada)');
    }
    
    // Status 200 sem indicadores claros - verificar fazendo request de teste
    try {
      const testResponse = await this.client.get(`${this.domain}/clients/`, {
        headers: { 'Cookie': this.getCookieString() },
        maxRedirects: 0
      });
      this.saveCookies(testResponse);
      
      const testHtml = typeof testResponse.data === 'string' ? testResponse.data : '';
      
      // Se redirecionou para login ou retornou página de login
      if (testResponse.status === 302 || testHtml.includes('csrf_token') || testHtml.includes('try_login')) {
        throw new Error('Login falhou - sem acesso ao painel');
      }
      
      this.loggedIn = true;
      this.loginTime = Date.now();
      this.lastActivity = Date.now();
      this.loginCount++;
      log(`Login OK (verificado via /clients)! ${Object.keys(this.cookies).length} cookies (login #${this.loginCount})`, 'OK');
      return true;
    } catch (testError) {
      if (testError.message.includes('Login falhou')) throw testError;
      throw new Error('Login falhou - não foi possível validar sessão');
    }
  }

  // ========================================
  // 4. VERIFICAR SESSÃO ATIVA
  // ========================================
  
  async checkSession() {
    if (!this.loggedIn || Object.keys(this.cookies).length === 0) {
      return false;
    }
    
    try {
      const response = await this.client.get(`${this.domain}/clients/`, {
        headers: { 'Cookie': this.getCookieString() },
        maxRedirects: 0,
        timeout: 10000
      });
      
      this.saveCookies(response);
      
      // Se redirecionou para login → sessão expirou
      if (response.status === 302 || response.status === 301) {
        const location = response.headers.location || '';
        if (location.includes('login')) {
          log('checkSession: sessão expirou (redirect para login)', 'WARN');
          this.loggedIn = false;
          return false;
        }
      }
      
      // Se retornou HTML com form de login → expirou
      const html = typeof response.data === 'string' ? response.data : '';
      if (html.includes('csrf_token') || html.includes('try_login')) {
        log('checkSession: sessão expirou (página de login retornada)', 'WARN');
        this.loggedIn = false;
        return false;
      }
      
      this.lastActivity = Date.now();
      return true;
      
    } catch (error) {
      log(`checkSession: erro - ${error.message}`, 'WARN');
      return false;
    }
  }

  // ========================================
  // 5. GARANTIR SESSÃO ATIVA (re-loga se expirou)
  // ========================================
  
  async ensureLoggedIn() {
    if (!this.loggedIn || Object.keys(this.cookies).length === 0) {
      log('Sessão não iniciada, fazendo login...');
      await this.login();
      return;
    }
    
    const isActive = await this.checkSession();
    
    if (!isActive) {
      log('Sessão expirou, re-logando...');
      this.cookies = {};
      this.loggedIn = false;
      await this.login();
    } else {
      const info = this.getInfo();
      log(`Sessão reutilizada (${info.sessionMinutes}min ativa, ${info.renewCount} renovações)`, 'OK');
    }
  }

  // ========================================
  // 6. RENOVAR CLIENTE
  // ========================================
  
  async renewClient(clientId, months, _retried = false) {
    if (!this.loggedIn) {
      throw new Error('Não está logado. Execute login() primeiro.');
    }
    
    // URL de renovação do Koffice
    // Koffice aceita months direto — 1 request = N meses
    const apiUrl = `${this.domain}/clients/api/?renew_client_plus&client_id=${clientId}&months=${months}`;
    
    log(`POST ${apiUrl}`);
    
    const response = await this.client.post(apiUrl, '', {
      headers: {
        'Cookie': this.getCookieString(),
        'Referer': `${this.domain}/clients/`,
        'Origin': this.domain,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    
    this.saveCookies(response);
    
    // Verificar se sessão expirou durante a operação → re-logar e tentar 1x
    if (typeof response.data === 'string' && response.data.includes('login')) {
      if (_retried) {
        throw new Error('Sessão expirou durante a renovação (já tentou re-logar)');
      }
      log('Sessão expirou durante renovação, re-logando...', 'WARN');
      this.loggedIn = false;
      this.cookies = {};
      await this.login();
      return this.renewClient(clientId, months, true);
    }
    
    // Atualizar metadados
    this.lastActivity = Date.now();
    this.renewCount++;
    
    // Analisar resposta
    if (response.status === 200) {
      const data = response.data;
      
      // Resposta JSON
      if (data && typeof data === 'object') {
        if (data.result === 'success') {
          return {
            client_id: clientId,
            months,
            result: 'success',
            raw: data
          };
        } else if (data.result === 'failed') {
          throw new Error(`Painel retornou result: failed`);
        } else {
          // Qualquer outro JSON sem "result: failed" assumir sucesso
          // (alguns painéis retornam formato diferente)
          return {
            client_id: clientId,
            months,
            result: 'success',
            raw: data
          };
        }
      }
      
      // Resposta String
      if (typeof data === 'string') {
        const lower = data.toLowerCase();
        if (lower.includes('success') || lower === 'ok' || lower.includes('"result":"success"')) {
          return {
            client_id: clientId,
            months,
            result: 'success',
            raw: data
          };
        } else if (lower.includes('failed') || lower.includes('error') || lower.includes('fail')) {
          throw new Error(`Painel retornou: ${data.substring(0, 200)}`);
        }
        // Resposta não reconhecida mas status 200 - assumir sucesso
        return {
          client_id: clientId,
          months,
          result: 'success',
          raw: data
        };
      }
      
      // Resposta vazia
      return {
        client_id: clientId,
        months,
        result: 'success',
        raw: null,
        note: 'Resposta vazia mas status 200'
      };
    }
    
    throw new Error(`Erro HTTP ${response.status} ao renovar cliente`);
  }

  // ========================================
  // 7. LOGOUT
  // ========================================
  
  async logout() {
    if (!this.loggedIn) return;
    
    try {
      await this.client.get(`${this.domain}/logout/`, {
        headers: { 'Cookie': this.getCookieString() }
      });
      this.loggedIn = false;
      this.cookies = {};
      log('Logout realizado');
    } catch (e) {
      // Ignorar
    }
  }

  // ========================================
  // UTILS
  // ========================================
  
  delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}
