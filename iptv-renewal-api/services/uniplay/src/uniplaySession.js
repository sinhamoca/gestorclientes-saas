/* ========================================
   UNIPLAY SESSION
   
   Gerencia sessão com Uniplay (GesAPIOffice):
   - Domínio fixo: https://gesapioffice.com
   - Login via API JSON → JWT token + crypt_pass
   - Proxy SOCKS5 obrigatório (IP brasileiro)
   - Busca cliente por NOME (campo nota) em P2P e IPTV
   - Renovação via PUT com créditos (1 crédito = 1 mês)
   
   Diferenças dos outros:
   - Domínio FIXO (não configurável)
   - Proxy SOCKS5 (não Worker)
   - Busca por NOME (não por ID/username)
   - PUT para renovar (não POST)
   - crypt_pass obrigatório na renovação
   - Sucesso = resposta é data DD/MM/YYYY
   ======================================== */

import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { log } from './utils.js';
import tracker from './bandwidthTracker.js';

const BASE_URL = 'https://gesapioffice.com';

export class UniplaySession {
  constructor({ username, password, proxyConfig }) {
    this.username = username;
    this.password = password;
    this.token = null;
    this.cryptPass = null;
    this.userId = null;
    this.loggedIn = false;
    
    // Metadados do keeper
    this.loginTime = null;
    this.lastActivity = null;
    this.loginCount = 0;
    this.renewCount = 0;
    
    // Montar proxy agent
    this.proxyAgent = null;
    if (proxyConfig?.host && proxyConfig?.port) {
      let proxyUser = proxyConfig.username || '';
      let proxyPass = proxyConfig.password || '';
      
      // ProxyEmpire: adicionar country-br e session ID se não estiver no username
      // Formato esperado: r_XXXXX-country-br-sid-SESSIONID
      if (proxyUser && !proxyUser.includes('-country-')) {
        const sessionId = Math.random().toString(36).substring(2, 10);
        proxyUser = `${proxyUser}-country-br-sid-${sessionId}`;
      }
      
      const proxyUrl = proxyUser
        ? `socks5://${proxyUser}:${proxyPass}@${proxyConfig.host}:${proxyConfig.port}`
        : `socks5://${proxyConfig.host}:${proxyConfig.port}`;
      this.proxyAgent = new SocksProxyAgent(proxyUrl);
      log(`Proxy configurado: ${proxyConfig.host}:${proxyConfig.port} (${proxyUser.substring(0, 30)}...)`);
    }
    
    // Cliente HTTP
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://gestordefender.com',
        'Referer': 'https://gestordefender.com/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
        'Sec-CH-UA': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'Sec-CH-UA-Mobile': '?1',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      ...(this.proxyAgent && {
        httpAgent: this.proxyAgent,
        httpsAgent: this.proxyAgent
      })
    });
    
    // Instalar tracking de bandwidth
    tracker.installInterceptors(this.client, this.username);
  }

  // ========================================
  // INFO (para keeper)
  // ========================================
  
  getInfo() {
    const now = Date.now();
    return {
      domain: BASE_URL,
      username: this.username,
      loggedIn: this.loggedIn,
      loginCount: this.loginCount,
      renewCount: this.renewCount,
      hasToken: !!this.token,
      hasCryptPass: !!this.cryptPass,
      loginTime: this.loginTime,
      lastActivity: this.lastActivity,
      idleMinutes: this.lastActivity ? Math.floor((now - this.lastActivity) / 60000) : null,
      sessionMinutes: this.loginTime ? Math.floor((now - this.loginTime) / 60000) : null
    };
  }

  // ========================================
  // 1. LOGIN (JWT + crypt_pass)
  // ========================================
  
  async login() {
    log(`Login (${this.username})${this.proxyAgent ? ' via proxy' : ''}`);
    
    const response = await this.client.post('/api/login', {
      username: this.username,
      password: this.password,
      code: ""
    }, { validateStatus: () => true });
    
    const data = response.data;
    
    if (response.status >= 400) {
      throw new Error(`Login falhou - HTTP ${response.status}: ${JSON.stringify(data).substring(0, 200)}`);
    }
    
    if (!data?.access_token) {
      throw new Error(`Login falhou - sem access_token: ${JSON.stringify(data).substring(0, 200)}`);
    }
    
    this.token = data.access_token;
    this.cryptPass = data.crypt_pass;
    this.userId = data.id;
    this.loggedIn = true;
    this.loginTime = Date.now();
    this.lastActivity = Date.now();
    this.loginCount++;
    
    // Atualizar header Authorization no cliente
    this.client.defaults.headers['Authorization'] = `Bearer ${this.token}`;
    
    log(`Login OK! User: ${data.username} | ID: ${data.id} (login #${this.loginCount})`, 'OK');
    return true;
  }

  // ========================================
  // 2. VERIFICAR SESSÃO
  // ========================================
  
  async checkSession() {
    if (!this.loggedIn || !this.token) return false;
    
    try {
      // Tentar buscar P2P (endpoint leve)
      const response = await this.client.get('/api/users-p2p', { timeout: 10000 });
      
      if (Array.isArray(response.data)) {
        this.lastActivity = Date.now();
        return true;
      }
      
      // Resposta inesperada → token expirado
      log('checkSession: resposta inesperada', 'WARN');
      this.loggedIn = false;
      return false;
      
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        log('checkSession: token expirado', 'WARN');
        this.loggedIn = false;
        this.token = null;
        return false;
      }
      // Erro de rede → assumir válido
      log(`checkSession: erro de rede - ${error.message}`, 'WARN');
      return true;
    }
  }

  // ========================================
  // 3. GARANTIR SESSÃO ATIVA
  // ========================================
  
  async ensureLoggedIn() {
    if (!this.loggedIn || !this.token) {
      log('Sessão não iniciada, fazendo login...');
      await this.login();
      return;
    }
    
    const isActive = await this.checkSession();
    if (!isActive) {
      log('Token expirado, re-logando...');
      this.token = null;
      this.loggedIn = false;
      await this.login();
    } else {
      const info = this.getInfo();
      log(`Sessão reutilizada (${info.sessionMinutes}min ativa, ${info.renewCount} renovações)`, 'OK');
    }
  }

  // ========================================
  // 4. LIMPAR NOME DO CLIENTE
  // ========================================
  
  cleanClientName(nota) {
    if (!nota) return '';
    let cleaned = nota.replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
    cleaned = cleaned.replace(/Usuário migrado externamente\.\s*Obs:\s*/gi, '');
    cleaned = cleaned.replace(/Obs:\s*/gi, '');
    cleaned = cleaned.trim().replace(/\s+/g, ' ');
    return cleaned;
  }

  // ========================================
  // 5. BUSCAR CLIENTE POR NOME (P2P + IPTV)
  // ========================================
  
  async findClientByName(searchName) {
    const normalized = searchName.trim().toLowerCase();
    log(`Buscando cliente: "${searchName}"`);
    
    // ── P2P primeiro ──
    log('Buscando em P2P...');
    try {
      const p2pResponse = await this.client.get('/api/users-p2p');
      const p2pClients = Array.isArray(p2pResponse.data) ? p2pResponse.data : [];
      log(`P2P: ${p2pClients.length} clientes`);
      
      for (const client of p2pClients) {
        const name = this.cleanClientName(client.nota || client.name || '');
        if (name.toLowerCase() === normalized) {
          log(`Encontrado em P2P: ID ${client.id} - "${name}"`, 'OK');
          return {
            id: client.id,
            name,
            username: client.username || '',
            serviceType: 'p2p'
          };
        }
      }
    } catch (e) {
      log(`Erro P2P: ${e.message}`, 'WARN');
    }
    
    // ── IPTV se não encontrou ──
    log('Não encontrado em P2P, buscando em IPTV...');
    try {
      const iptvUrl = this.cryptPass
        ? `/api/users-iptv?reg_password=${encodeURIComponent(this.cryptPass)}`
        : '/api/users-iptv';
      const iptvResponse = await this.client.get(iptvUrl);
      const iptvClients = Array.isArray(iptvResponse.data) ? iptvResponse.data : [];
      log(`IPTV: ${iptvClients.length} clientes`);
      
      for (const client of iptvClients) {
        const name = this.cleanClientName(client.nota || client.name || '');
        if (name.toLowerCase() === normalized) {
          log(`Encontrado em IPTV: ID ${client.id} - "${name}"`, 'OK');
          return {
            id: client.id,
            name,
            username: client.username || '',
            serviceType: 'iptv'
          };
        }
      }
    } catch (e) {
      log(`Erro IPTV: ${e.message}`, 'WARN');
    }
    
    throw new Error(`Cliente "${searchName}" não encontrado em P2P nem IPTV`);
  }

  // ========================================
  // 6. RENOVAR CLIENTE
  // ========================================
  
  async renewClient(clientId, serviceType, credits, _retried = false) {
    if (!this.loggedIn) throw new Error('Não está logado');
    if (!this.cryptPass) throw new Error('crypt_pass não disponível');
    
    const endpoint = serviceType.toLowerCase() === 'iptv' ? 'users-iptv' : 'users-p2p';
    
    log(`Renovando: ${endpoint}/${clientId} | ${credits} crédito(s)`);
    
    const renewalData = {
      action: 1,
      credits: parseInt(credits),
      reg_password: this.cryptPass
    };
    
    let response;
    try {
      response = await this.client.put(`/api/${endpoint}/${clientId}`, renewalData);
    } catch (error) {
      const status = error.response?.status;
      if ((status === 401 || status === 403) && !_retried) {
        log('Token expirou durante renovação, re-logando...', 'WARN');
        this.loggedIn = false;
        this.token = null;
        await this.login();
        return this.renewClient(clientId, serviceType, credits, true);
      }
      throw new Error(`Erro HTTP ${status || 'desconhecido'}: ${error.message}`);
    }
    
    this.lastActivity = Date.now();
    this.renewCount++;
    
    const data = response.data;
    
    // Sucesso: resposta é uma data DD/MM/YYYY
    if (typeof data === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(data.trim())) {
      return {
        success: true,
        client_id: clientId,
        service_type: serviceType,
        credits,
        new_expiry: data.trim()
      };
    }
    
    // Sucesso: resposta JSON com indicadores
    if (data && typeof data === 'object') {
      if (data.success === true || data.status === 'success') {
        return {
          success: true,
          client_id: clientId,
          service_type: serviceType,
          credits,
          raw: data
        };
      }
    }
    
    // Resposta vazia com status 200 → provável sucesso
    if (response.status === 200 && (!data || (typeof data === 'string' && data.trim().length > 0))) {
      return {
        success: true,
        client_id: clientId,
        service_type: serviceType,
        credits,
        raw: data,
        note: 'Status 200 - assumido sucesso'
      };
    }
    
    throw new Error(`Renovação falhou: ${JSON.stringify(data).substring(0, 300)}`);
  }

  // ========================================
  // 7. LOGOUT
  // ========================================
  
  async logout() {
    this.token = null;
    this.cryptPass = null;
    this.loggedIn = false;
    delete this.client.defaults.headers['Authorization'];
    log('Sessão encerrada');
  }
}
