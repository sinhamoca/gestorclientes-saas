/* ========================================
   CLOUDNATION SESSION (Live21)
   
   Domínio fixo: https://painel.cloudnation.top
   Auth: Cookies + CSRF token (do cookie) + _Token[fields/unlocked]
   Captcha: Cloudflare Turnstile via 2Captcha (~30s)
   Login: POST / (não /login!) com device_id
   Renovação: POST /users/renova-users-selecionados { ids[]=userId }
   Multi-mês: loop N vezes (1 renew = 1 mês)
   ======================================== */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from './utils.js';

const BASE_URL = 'https://painel.cloudnation.top';
const TURNSTILE_SITEKEY = '0x4AAAAAABzciTXYJNKPGEVl';

export class CloudNationSession {
  constructor({ username, password, apiKey2captcha }) {
    this.username = username;
    this.password = password;
    this.apiKey2captcha = apiKey2captcha;
    this.cookies = {};
    this.csrfToken = null;
    this.deviceId = null;
    this.loggedIn = false;
    
    // Metadados keeper
    this.loginTime = null;
    this.lastActivity = null;
    this.loginCount = 0;
    this.renewCount = 0;
    
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Sec-Ch-Ua': '"Chromium";v="121", "Not A(Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      }
    });
  }

  // ========================================
  // HELPERS
  // ========================================
  
  getInfo() {
    const now = Date.now();
    return {
      domain: BASE_URL,
      username: this.username,
      loggedIn: this.loggedIn,
      loginCount: this.loginCount,
      renewCount: this.renewCount,
      cookiesCount: Object.keys(this.cookies).length,
      loginTime: this.loginTime,
      lastActivity: this.lastActivity,
      idleMinutes: this.lastActivity ? Math.floor((now - this.lastActivity) / 60000) : null,
      sessionMinutes: this.loginTime ? Math.floor((now - this.loginTime) / 60000) : null,
      clientsCached: this._cachedClients?.length || 0
    };
  }

  getCookieString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  extractCookies(response) {
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) return;
    setCookie.forEach(cookie => {
      const [nameValue] = cookie.split(';');
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex > 0) {
        const name = nameValue.substring(0, eqIndex).trim();
        const value = nameValue.substring(eqIndex + 1).trim();
        if (value !== 'deleted') this.cookies[name] = value;
      }
    });
  }

  generateDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  extractTokensFromHtml(html) {
    let tokenFields = '';
    let tokenUnlocked = '';
    
    // _Token[fields]
    let match = html.match(/name=["']_Token\[fields\]["'][^>]*value=["']([^"']+)["']/i);
    if (!match) match = html.match(/value=["']([^"']+)["'][^>]*name=["']_Token\[fields\]["']/i);
    if (!match) match = html.match(/_Token\[fields\][^>]+value=["']([^"']+)["']/i);
    
    if (match) {
      tokenFields = match[1];
    } else {
      tokenFields = '3a8b9680acaf2e40786fd57433e6b74eaf1cf182:';
      log('_Token[fields] não encontrado, usando padrão', 'WARN');
    }
    
    // _Token[unlocked]
    match = html.match(/name=["']_Token\[unlocked\]["'][^>]*value=["']([^"']*)["']/i);
    if (!match) match = html.match(/_Token\[unlocked\][^>]+value=["']([^"']*)["']/i);
    
    if (match) {
      tokenUnlocked = match[1];
    } else {
      tokenUnlocked = 'cf-turnstile-response|g-recaptcha-response';
      log('_Token[unlocked] não encontrado, usando padrão', 'WARN');
    }
    
    // Processar
    if (tokenFields.includes('%')) tokenFields = decodeURIComponent(tokenFields);
    if (!tokenFields.endsWith(':')) tokenFields += ':';
    if (tokenUnlocked.includes('%')) tokenUnlocked = decodeURIComponent(tokenUnlocked);
    
    return { tokenFields, tokenUnlocked };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ========================================
  // RESOLVER TURNSTILE VIA 2CAPTCHA
  // ========================================
  
  async solveTurnstile() {
    if (!this.apiKey2captcha) throw new Error('2Captcha API Key não configurada');
    
    log('Resolvendo Turnstile via 2Captcha...');
    
    const submitResponse = await axios.get('https://2captcha.com/in.php', {
      params: {
        key: this.apiKey2captcha,
        method: 'turnstile',
        sitekey: TURNSTILE_SITEKEY,
        pageurl: BASE_URL + '/',
        json: 1
      }
    });
    
    if (submitResponse.data.status !== 1) {
      throw new Error(`2Captcha erro: ${submitResponse.data.request}`);
    }
    
    const captchaId = submitResponse.data.request;
    log(`2Captcha task: ${captchaId}`);
    
    for (let i = 0; i < 40; i++) {
      await this.sleep(3000);
      
      const result = await axios.get('https://2captcha.com/res.php', {
        params: { key: this.apiKey2captcha, action: 'get', id: captchaId, json: 1 }
      });
      
      if (result.data.status === 1) {
        log(`Turnstile resolvido em ${(i + 1) * 3}s!`, 'OK');
        return result.data.request;
      }
      
      if (result.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${result.data.request}`);
      }
    }
    
    throw new Error('Timeout 2Captcha (2 minutos)');
  }

  // ========================================
  // LOGIN COMPLETO
  // ========================================
  
  async login() {
    log(`Login (${this.username})`);
    const startTime = Date.now();
    
    // 1. Gerar device_id
    this.deviceId = this.generateDeviceId();
    
    // 2. GET / → cookies + CSRF + tokens HTML
    log('Obtendo página inicial...');
    const initialResponse = await this.client.get('/', {
      headers: {
        'Cookie': `device_id=${this.deviceId}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1'
      },
      maxRedirects: 5
    });
    
    this.cookies = { device_id: this.deviceId };
    this.extractCookies(initialResponse);
    
    this.csrfToken = this.cookies.csrfToken;
    if (!this.csrfToken) throw new Error('CSRF Token não encontrado nos cookies');
    
    log(`CSRF OK | Cookies: ${Object.keys(this.cookies).join(', ')}`);
    
    const { tokenFields, tokenUnlocked } = this.extractTokensFromHtml(initialResponse.data || '');
    
    // 3. Salvar device
    log('Salvando device...');
    try {
      await this.client.post('/login-sessions/save-devices',
        JSON.stringify({
          browser: 'Chrome', version: '121.0.0.0',
          platform: 'Windows', isMobile: false,
          fingerprint: this.deviceId
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': this.getCookieString(),
            'X-Csrf-Token': this.csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
          }
        }
      );
    } catch (e) {
      log('Device save falhou (não crítico)', 'WARN');
    }
    
    // 4. Resolver Turnstile
    const turnstileToken = await this.solveTurnstile();
    
    // 5. POST / com credenciais
    log('Enviando credenciais...');
    
    const postBodyParts = [
      `_method=POST`,
      `_csrfToken=${encodeURIComponent(this.csrfToken)}`,
      `username=${encodeURIComponent(this.username)}`,
      `password=${encodeURIComponent(this.password)}`,
      `cf-turnstile-response=${encodeURIComponent(turnstileToken)}`
    ];
    if (tokenFields) postBodyParts.push(`_Token%5Bfields%5D=${encodeURIComponent(tokenFields)}`);
    if (tokenUnlocked) postBodyParts.push(`_Token%5Bunlocked%5D=${encodeURIComponent(tokenUnlocked)}`);
    
    const loginResponse = await this.client.post('/', postBodyParts.join('&'), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.getCookieString(),
        'Origin': BASE_URL,
        'Referer': BASE_URL + '/',
        'Upgrade-Insecure-Requests': '1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400
    });
    
    this.extractCookies(loginResponse);
    
    // 6. Verificar acesso ao painel
    log('Verificando login...');
    const testResponse = await this.client.get('/gerenciador/home', {
      headers: { 'Cookie': this.getCookieString() },
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400
    });
    
    this.extractCookies(testResponse);
    
    if (testResponse.status === 302) {
      const loc = testResponse.headers.location || '';
      if (loc === '/' || loc.includes('login')) throw new Error('Login falhou - redirecionado para login');
    }
    
    if (testResponse.status === 200 && typeof testResponse.data === 'string') {
      if (testResponse.data.includes('Acessar o Painel')) throw new Error('Login falhou - ainda na página de login');
    }
    
    this.loggedIn = true;
    this.loginTime = Date.now();
    this.lastActivity = Date.now();
    this.loginCount++;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Login OK em ${elapsed}s! (login #${this.loginCount})`, 'OK');
    return true;
  }

  // ========================================
  // VERIFICAR SESSÃO
  // ========================================
  
  async checkSession() {
    if (!this.loggedIn) return false;
    
    try {
      const response = await this.client.get('/gerenciador/home', {
        headers: { 'Cookie': this.getCookieString() },
        maxRedirects: 0,
        validateStatus: s => s >= 200 && s < 400,
        timeout: 10000
      });
      
      this.extractCookies(response);
      
      if (response.status === 302) {
        const loc = response.headers.location || '';
        if (loc === '/' || loc.includes('login')) {
          log('checkSession: sessão expirada (redirect)', 'WARN');
          this.loggedIn = false;
          return false;
        }
      }
      
      if (response.status === 200 && typeof response.data === 'string') {
        if (response.data.includes('Acessar o Painel')) {
          log('checkSession: sessão expirada (login page)', 'WARN');
          this.loggedIn = false;
          return false;
        }
      }
      
      this.lastActivity = Date.now();
      return true;
      
    } catch (error) {
      log(`checkSession: erro - ${error.message}`, 'WARN');
      return true; // Assumir válido em erro de rede
    }
  }

  // ========================================
  // GARANTIR SESSÃO ATIVA
  // ========================================
  
  async ensureLoggedIn() {
    if (!this.loggedIn) {
      log('Sessão não iniciada, fazendo login...');
      await this.login();
      return;
    }
    const isActive = await this.checkSession();
    if (!isActive) {
      log('Sessão expirada, re-logando...');
      this.loggedIn = false;
      await this.login();
    } else {
      const info = this.getInfo();
      log(`Sessão reutilizada (${info.sessionMinutes}min, ${info.renewCount} renovações)`, 'OK');
    }
  }

  // ========================================
  // RENOVAR USUÁRIO (1 renovação = 1 mês)
  // ========================================
  
  async renewUser(userId, _retried = false) {
    if (!this.loggedIn) throw new Error('Não está logado');
    
    log(`Renovando userId: ${userId}`);
    
    // Atualizar CSRF do cookie (pode mudar entre requests)
    if (this.cookies.csrfToken) this.csrfToken = this.cookies.csrfToken;
    
    const payload = `ids%5B%5D=${userId}`;
    
    let response;
    try {
      response = await this.client.post('/users/renova-users-selecionados', payload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': this.getCookieString(),
          'X-Requested-With': 'XMLHttpRequest',
          'X-Csrf-Token': this.csrfToken,
          'Accept': '*/*',
          'Origin': BASE_URL,
          'Referer': BASE_URL + '/gerenciador/usuario-iptv'
        },
        timeout: 30000,
        validateStatus: () => true
      });
    } catch (error) {
      if (!_retried) {
        log('Erro de conexão na renovação, re-logando...', 'WARN');
        this.loggedIn = false;
        await this.login();
        return this.renewUser(userId, true);
      }
      throw error;
    }
    
    this.extractCookies(response);
    this.lastActivity = Date.now();
    this.renewCount++;
    
    const data = response.data;
    
    // Sessão expirou?
    if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('Acessar o Painel') || data.includes('name="username"'))) {
      if (!_retried) {
        log('Sessão expirada durante renovação, re-logando...', 'WARN');
        this.loggedIn = false;
        await this.login();
        return this.renewUser(userId, true);
      }
      throw new Error('Sessão expirada - re-login também falhou');
    }
    
    // Sucesso: {"success":"Usuários Renovados com sucesso!"}
    if (typeof data === 'object' && data.success) {
      return { success: true, message: data.success, userId };
    }
    
    // Status 200 sem erro = provável sucesso
    if (response.status === 200 && !data?.error) {
      return { success: true, message: 'OK (status 200)', userId, raw: data };
    }
    
    throw new Error(`Renovação falhou: ${JSON.stringify(data).substring(0, 300)}`);
  }

  // ========================================
  // LISTAR TODOS OS CLIENTES (scraping paginado)
  // ========================================
  
  async listAllClients() {
    if (!this.loggedIn) throw new Error('Não está logado');
    
    log('Carregando lista completa de clientes...');
    
    const allClients = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const response = await this.client.get(`/gerenciador/usuario-iptv?page=${page}`, {
          headers: {
            'Cookie': this.getCookieString(),
            'Accept': 'text/html'
          },
          validateStatus: s => s >= 200 && s <= 500,
          timeout: 30000
        });
        
        if (response.status === 404) {
          hasMore = false;
          break;
        }
        
        // Sessão expirou?
        if (response.status === 302 || 
            (typeof response.data === 'string' && response.data.includes('Acessar o Painel'))) {
          throw new Error('Sessão expirada durante listagem');
        }
        
        this.extractCookies(response);
        
        if (response.status === 200 && typeof response.data === 'string') {
          const clients = this._extractClientsFromHtml(response.data);
          
          if (clients.length > 0) {
            allClients.push(...clients);
            log(`  Página ${page}: ${clients.length} clientes`);
            page++;
            await this.sleep(500);
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
        
      } catch (error) {
        if (error.message.includes('Sessão expirada')) throw error;
        log(`  Erro na página ${page}: ${error.message}`, 'WARN');
        hasMore = false;
      }
    }
    
    this._cachedClients = allClients;
    this.lastActivity = Date.now();
    log(`${allClients.length} clientes carregados e cacheados`, 'OK');
    return allClients;
  }

  _extractClientsFromHtml(html) {
    const $ = cheerio.load(html);
    const clients = [];
    
    $('tr').each((i, tr) => {
      const $tr = $(tr);
      const $checkbox = $tr.find('input[type="checkbox"][value]');
      if ($checkbox.length === 0) return;
      
      const id = $checkbox.attr('value');
      if (!id) return;
      
      const cells = $tr.find('td');
      if (cells.length < 4) return;
      
      const nome = $(cells[1]).text().trim();
      if (!nome) return;
      
      // Extrair datas (dd/mm/yy ou dd/mm/yyyy)
      let dataCriacao = '';
      let dataVencimento = '';
      
      cells.each((idx, cell) => {
        const texto = $(cell).text().trim();
        if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(texto)) {
          if (!dataCriacao) dataCriacao = texto;
          else if (!dataVencimento) dataVencimento = texto;
        }
      });
      
      clients.push({ id, nome, dataCriacao, dataVencimento });
    });
    
    return clients;
  }

  // ========================================
  // BUSCAR CLIENTE POR NOME
  // ========================================
  
  findClientByName(clientName) {
    if (!this._cachedClients || this._cachedClients.length === 0) return null;
    
    const search = clientName.trim().toLowerCase();
    
    const found = this._cachedClients.find(c => c.nome.toLowerCase() === search);
    if (found) {
      log(`Encontrado: "${found.nome}" → ID ${found.id}`, 'OK');
      return found;
    }
    
    return null;
  }

  // ========================================
  // LOGOUT
  // ========================================
  
  async logout() {
    this.cookies = {};
    this.csrfToken = null;
    this.loggedIn = false;
    log('Sessão encerrada');
  }
}
