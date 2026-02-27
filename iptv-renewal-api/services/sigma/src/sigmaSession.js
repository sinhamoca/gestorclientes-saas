/* ========================================
   SIGMA SESSION
   
   Gerencia sessão com painel Sigma via Cloudflare Worker:
   - Login via API JSON → retorna JWT token
   - Todas as requests passam pelo Worker (bypass Cloudflare)
   - Busca cliente por username → obtém ID interno
   - Renova via POST /api/customers/{id}/renew
   
   Diferenças do Koffice:
   - Auth: JWT Bearer token (não cookies)
   - Bypass: Cloudflare Worker (não acesso direto)
   - Sem captcha (Worker resolve proteção Cloudflare)
   - Package ID já contém a duração (1 renew = N meses)
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

export class SigmaSession {
  constructor({ domain, username, password, workerUrl, workerSecret }) {
    this.domain = domain.replace(/\/$/, '').trim();
    this.username = username;
    this.password = password;
    this.workerUrl = (workerUrl || '').trim();
    this.workerSecret = (workerSecret || '').trim();
    this.authToken = null;
    this.loggedIn = false;
    
    // Metadados do keeper
    this.loginTime = null;
    this.lastActivity = null;
    this.loginCount = 0;
    this.renewCount = 0;
    
    // Headers padrão para simular browser
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
    
    // Cliente HTTP para comunicação com Worker
    this.client = axios.create({
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ========================================
  // INFO (para keeper)
  // ========================================
  
  getInfo() {
    const now = Date.now();
    return {
      domain: this.domain,
      username: this.username,
      loggedIn: this.loggedIn,
      loginCount: this.loginCount,
      renewCount: this.renewCount,
      hasToken: !!this.authToken,
      loginTime: this.loginTime,
      lastActivity: this.lastActivity,
      idleMinutes: this.lastActivity ? Math.floor((now - this.lastActivity) / 60000) : null,
      sessionMinutes: this.loginTime ? Math.floor((now - this.loginTime) / 60000) : null
    };
  }

  // ========================================
  // 1. REQUEST VIA CLOUDFLARE WORKER
  // ========================================
  
  async request(method, path, data = null, customHeaders = {}) {
    const url = `${this.domain}${path}`;
    
    // Montar headers
    const headers = {
      ...this.defaultHeaders,
      ...customHeaders,
      'Origin': this.domain,
      'Referer': `${this.domain}/`
    };
    
    // Adicionar token JWT se existir
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    // Payload para o Worker
    const workerPayload = { method, url, headers };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      workerPayload.body = data;
    }
    
    try {
      const response = await this.client.post(`${this.workerUrl.trim()}/proxy`, workerPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Secret': (this.workerSecret || '').trim()
        }
      });
      
      const result = response.data;
      
      if (!result.success && result.status >= 400) {
        throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.data)}`);
      }
      
      return result.data;
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Worker error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  // ========================================
  // 2. LOGIN (JWT)
  // ========================================
  
  async login() {
    log(`Login em ${this.domain} (${this.username})`);
    
    // Inicializar sessão (acessar página inicial)
    try {
      await this.request('GET', '/', null, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
    } catch (e) {
      // Não falhar, alguns painéis não precisam
    }
    
    await this.delay(1);
    
    // Payload de login Sigma
    const loginData = {
      captcha: "not-a-robot",
      captchaChecked: true,
      username: this.username,
      password: this.password,
      twofactor_code: "",
      twofactor_recovery_code: "",
      twofactor_trusted_device_id: ""
    };
    
    const response = await this.request('POST', '/api/auth/login', loginData, {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
    });
    
    // Extrair token
    const token = response?.token || response?.data?.token;
    
    if (!token) {
      throw new Error(`Login falhou - sem token na resposta: ${JSON.stringify(response).substring(0, 200)}`);
    }
    
    this.authToken = token;
    this.loggedIn = true;
    this.loginTime = Date.now();
    this.lastActivity = Date.now();
    this.loginCount++;
    
    log(`Login OK! Token: ${token.substring(0, 20)}... (login #${this.loginCount})`, 'OK');
    return true;
  }

  // ========================================
  // 3. VERIFICAR SESSÃO (token ainda válido?)
  // ========================================
  
  async checkSession() {
    if (!this.loggedIn || !this.authToken) return false;
    
    try {
      // Tentar acessar endpoint autenticado
      const response = await this.request('GET', '/api/customers?page=1&perPage=1', null, {
        'Accept': 'application/json'
      });
      
      // Se retornou dados, token ainda válido
      if (response && (Array.isArray(response) || Array.isArray(response?.data))) {
        this.lastActivity = Date.now();
        return true;
      }
      
      // Resposta inesperada
      log('checkSession: resposta inesperada, assumindo expirado', 'WARN');
      this.loggedIn = false;
      return false;
      
    } catch (error) {
      const msg = error.message || '';
      // 401/403 = token expirado
      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthenticated')) {
        log('checkSession: token expirado', 'WARN');
        this.loggedIn = false;
        this.authToken = null;
        return false;
      }
      // Outros erros (rede, worker) - não invalidar sessão
      log(`checkSession: erro de rede - ${error.message}`, 'WARN');
      return true; // Assumir válido, vai falhar na renovação se não for
    }
  }

  // ========================================
  // 4. GARANTIR SESSÃO ATIVA
  // ========================================
  
  async ensureLoggedIn() {
    if (!this.loggedIn || !this.authToken) {
      log('Sessão não iniciada, fazendo login...');
      await this.login();
      return;
    }
    
    const isActive = await this.checkSession();
    
    if (!isActive) {
      log('Token expirado, re-logando...');
      this.authToken = null;
      this.loggedIn = false;
      await this.login();
    } else {
      const info = this.getInfo();
      log(`Sessão reutilizada (${info.sessionMinutes}min ativa, ${info.renewCount} renovações)`, 'OK');
    }
  }

  // ========================================
  // 5. BUSCAR CLIENTE POR USERNAME (busca direta API)
  // ========================================
  
  async findCustomerByUsername(targetUsername) {
    log(`Buscando cliente por username: ${targetUsername}`);
    
    const searchParams = new URLSearchParams({
      page: '1',
      username: targetUsername,
      serverId: '',
      packageId: '',
      expiryFrom: '',
      expiryTo: '',
      status: '',
      isTrial: '',
      connections: '',
      perPage: '20'
    });
    
    const response = await this.request('GET', `/api/customers?${searchParams}`, null, {
      'Accept': 'application/json'
    });
    
    // Extrair lista
    let customers = [];
    if (Array.isArray(response)) customers = response;
    else if (response?.data && Array.isArray(response.data)) customers = response.data;
    
    // Buscar por username exato
    let customer = customers.find(c => c.username === targetUsername);
    
    // Fallback: note ou user_id
    if (!customer) customer = customers.find(c => c.note?.toLowerCase().includes(targetUsername.toLowerCase()));
    if (!customer) customer = customers.find(c => c.user_id === targetUsername);
    
    if (customer) {
      log(`Cliente encontrado: ${customer.username} (ID: ${customer.id})`);
      return customer;
    }
    
    throw new Error(`Cliente "${targetUsername}" não encontrado no painel Sigma`);
  }

  // ========================================
  // 5b. LISTAR TODOS OS CLIENTES (paginado, para cache)
  // ========================================
  
  async listAllCustomers(perPage = 100) {
    log('Carregando lista completa de clientes...');
    
    let allCustomers = [];
    let currentPage = 1;
    let hasMore = true;
    
    while (hasMore) {
      const searchParams = new URLSearchParams({
        page: currentPage.toString(),
        username: '',
        serverId: '',
        packageId: '',
        expiryFrom: '',
        expiryTo: '',
        status: '',
        isTrial: '',
        connections: '',
        perPage: perPage.toString()
      });
      
      const response = await this.request('GET', `/api/customers?${searchParams}`, null, {
        'Accept': 'application/json'
      });
      
      let customers = [];
      let totalPages = 0;
      
      if (response?.data && Array.isArray(response.data)) {
        customers = response.data;
        totalPages = response?.meta?.last_page || response?.pagination?.total_pages || 0;
      } else if (Array.isArray(response)) {
        customers = response;
      }
      
      if (customers.length === 0) {
        hasMore = false;
      } else {
        allCustomers = allCustomers.concat(customers.map(c => ({
          id: c.id,
          username: c.username,
          note: (c.note || c.name || '').trim(),
          status: c.status,
          expires_at: c.expires_at_tz || c.expires_at,
          connections: c.connections,
          package: c.package,
          server: c.server
        })));
        
        log(`  Página ${currentPage}: ${customers.length} clientes`);
        
        if (totalPages > 0 && currentPage >= totalPages) {
          hasMore = false;
        } else if (customers.length < perPage) {
          hasMore = false;
        } else {
          currentPage++;
          await this.delay(1);
        }
      }
    }
    
    this._cachedCustomers = allCustomers;
    log(`${allCustomers.length} clientes carregados e cacheados`, 'OK');
    return allCustomers;
  }

  // ========================================
  // 5c. BUSCAR CLIENTE POR NOME (campo note)
  // ========================================
  
  findCustomerByName(clientName) {
    if (!this._cachedCustomers || this._cachedCustomers.length === 0) {
      return null;
    }
    
    const search = clientName.trim().toLowerCase();
    
    // Match exato no campo note
    let found = this._cachedCustomers.find(c => c.note.toLowerCase() === search);
    if (found) {
      log(`Encontrado por note: "${found.note}" (ID: ${found.id}, user: ${found.username})`, 'OK');
      return found;
    }
    
    // Fallback: username
    found = this._cachedCustomers.find(c => (c.username || '').toLowerCase() === search);
    if (found) {
      log(`Encontrado por username: "${found.username}" (ID: ${found.id})`, 'OK');
      return found;
    }
    
    return null;
  }

  // ========================================
  // 6. RENOVAR CLIENTE
  // ========================================
  
  async renewClient(customerId, packageId, connections = 1, _retried = false) {
    if (!this.loggedIn) throw new Error('Não está logado');
    
    log(`Renovando: customer=${customerId}, package=${packageId}, conn=${connections}`);
    
    await this.delay(1);
    
    const payload = {
      package_id: packageId,
      connections: parseInt(connections)
    };
    
    let response;
    try {
      response = await this.request('POST', `/api/customers/${customerId}/renew`, payload, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty'
      });
    } catch (error) {
      const msg = error.message || '';
      // Token expirou durante renovação → re-logar e tentar 1x
      if ((msg.includes('401') || msg.includes('403')) && !_retried) {
        log('Token expirou durante renovação, re-logando...', 'WARN');
        this.loggedIn = false;
        this.authToken = null;
        await this.login();
        return this.renewClient(customerId, packageId, connections, true);
      }
      throw error;
    }
    
    this.lastActivity = Date.now();
    this.renewCount++;
    
    // Validar sucesso
    const hasSuccess = response?.message?.includes('sucesso');
    const hasExpiry = response?.expires_at || response?.data?.expires_at;
    const hasActive = response?.status === 'ACTIVE' || response?.data?.status === 'ACTIVE';
    const hasId = response?.id || response?.username;
    
    if (hasSuccess || hasExpiry || hasActive || hasId) {
      const customerData = response?.data || response;
      return {
        success: true,
        customer_id: customerId,
        package_id: packageId,
        connections,
        expires_at: customerData?.expires_at || null,
        status: customerData?.status || null,
        raw: customerData
      };
    }
    
    throw new Error(`Renovação falhou: ${JSON.stringify(response).substring(0, 300)}`);
  }

  // ========================================
  // 7. LOGOUT (opcional no Sigma - JWT stateless)
  // ========================================
  
  async logout() {
    this.authToken = null;
    this.loggedIn = false;
    log('Sessão encerrada (token descartado)');
  }

  // ========================================
  // UTILS
  // ========================================
  
  delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}
