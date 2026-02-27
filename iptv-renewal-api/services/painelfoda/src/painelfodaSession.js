/* ========================================
   PAINELFODA SESSION
   
   Domínio: Configurável
   Login: GET /login → CSRF → POST /login (cookies)
   Auth: Cookies de sessão
   member_id: Extraído do HTML /lines/manage
   Clientes: GET /api/lines?member_id=X (paginado)
   Busca: Por reseller_notes ou username
   Renovação: POST /api/lines/{id}/renew { package_id, remaining_months, max_connections }
   Sem captcha, sem proxy
   ======================================== */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from './utils.js';

export class PainelFodaSession {
  constructor({ domain, username, password }) {
    this.baseURL = this.normalizeDomain(domain);
    this.username = username;
    this.password = password;
    this.cookies = {};
    this.memberId = null;
    this.clients = [];
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      maxRedirects: 5
    });
  }

  normalizeDomain(domain) {
    let d = domain.trim();
    if (!d.startsWith('http://') && !d.startsWith('https://')) d = 'https://' + d;
    return d.replace(/\/$/, '');
  }

  extractCookies(response) {
    const sc = response.headers['set-cookie'];
    if (!sc) return;
    sc.forEach(cookie => {
      const eqIndex = cookie.indexOf('=');
      const scIndex = cookie.indexOf(';');
      if (eqIndex > 0) {
        const name = cookie.substring(0, eqIndex).trim();
        const value = cookie.substring(eqIndex + 1, scIndex > 0 ? scIndex : undefined).trim();
        if (value !== 'deleted') this.cookies[name] = value;
      }
    });
  }

  getCookieString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  extractStatus(statusHtml) {
    if (!statusHtml) return 'Desconhecido';
    return statusHtml.replace(/<[^>]*>/g, '').trim();
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ========================================
  // LOGIN
  // ========================================
  
  async login() {
    log(`Login (${this.username}) em ${this.baseURL}`);
    
    // 1. GET /login → CSRF token
    const loginPage = await this.client.get('/login', {
      headers: { 'Cookie': this.getCookieString() }
    });
    this.extractCookies(loginPage);
    
    const $ = cheerio.load(loginPage.data);
    const csrfToken = $('input[name="csrf"]').val() ||
                      $('input[name="_csrf"]').val() ||
                      $('input[name="csrf_token"]').val() ||
                      $('meta[name="csrf-token"]').attr('content');
    
    if (!csrfToken) throw new Error('CSRF Token não encontrado na página de login');
    log('CSRF obtido');
    
    // 2. POST /login
    const loginData = new URLSearchParams({
      csrf: csrfToken,
      username: this.username,
      password: this.password
    });
    
    const response = await this.client.post('/login', loginData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.getCookieString(),
        'Referer': `${this.baseURL}/login`,
        'Origin': this.baseURL
      }
    });
    
    this.extractCookies(response);
    
    const respText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (response.status === 200 && respText.includes('login') && respText.includes('password') && !respText.includes('dashboard')) {
      throw new Error('Credenciais inválidas');
    }
    
    log('Login OK!', 'OK');
    return true;
  }

  // ========================================
  // MEMBER ID
  // ========================================
  
  async getMemberId() {
    log('Capturando member_id...');
    
    const response = await this.client.get('/lines/manage', {
      headers: { 'Cookie': this.getCookieString(), 'Referer': this.baseURL }
    });
    this.extractCookies(response);
    
    const $ = cheerio.load(response.data);
    
    // Tentar selected primeiro
    const selected = $('select[name="member_id"] option[selected], select#member_id option[selected]');
    if (selected.length > 0) {
      const val = selected.attr('value');
      if (val) { this.memberId = val; log(`member_id: ${val}`, 'OK'); return val; }
    }
    
    // Fallback: primeiro option com valor
    let found = null;
    $('select[name="member_id"] option, select#member_id option').each((_, el) => {
      const v = $(el).attr('value');
      if (v && v !== '' && !found) found = v;
    });
    
    if (found) { this.memberId = found; log(`member_id (fallback): ${found}`, 'OK'); return found; }
    throw new Error('member_id não encontrado');
  }

  // ========================================
  // LISTAR CLIENTES (paginado)
  // ========================================
  
  async listClients(memberId) {
    log(`Listando clientes (member_id: ${memberId})...`);
    
    const firstPage = await this.client.get('/api/lines', {
      params: { username: '', status: '', others: 'clients', member_id: memberId, app_id: '', reseller_notes: '' },
      headers: { 'Cookie': this.getCookieString(), 'Referer': `${this.baseURL}/lines/manage`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    
    if (!firstPage.data) throw new Error('Nenhum dado retornado');
    
    const totalPages = firstPage.data.pages || 1;
    const totalClients = firstPage.data.count || 0;
    log(`${totalClients} clientes em ${totalPages} páginas`);
    
    let allClients = [];
    if (firstPage.data.results) allClients = allClients.concat(firstPage.data.results);
    
    for (let page = 2; page <= totalPages; page++) {
      log(`Página ${page}/${totalPages}...`);
      const resp = await this.client.get(`/api/lines/${page}`, {
        params: { username: '', status: '', others: 'clients', member_id: memberId, app_id: '', reseller_notes: '' },
        headers: { 'Cookie': this.getCookieString(), 'Referer': `${this.baseURL}/lines/manage`, 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (resp.data?.results) allClients = allClients.concat(resp.data.results);
      if (page < totalPages) await this.sleep(1000);
    }
    
    this.clients = allClients.map(c => ({
      id: c.id,
      username: c.username,
      status: this.extractStatus(c.status),
      exp_date: c.exp_date,
      max_connections: c.max_connections,
      reseller_notes: c.reseller_notes || '',
      trial: c.trial
    }));
    
    log(`${this.clients.length} clientes carregados`, 'OK');
    return this.clients;
  }

  // ========================================
  // BUSCAR CLIENTE POR NOME
  // ========================================
  
  findClientByName(clientName) {
    const search = clientName.trim().toLowerCase();
    
    // Buscar por reseller_notes (nome do cliente)
    let found = this.clients.find(c => (c.reseller_notes || '').toLowerCase().trim() === search);
    if (found) {
      log(`Encontrado por reseller_notes: ID ${found.id}`, 'OK');
      return found;
    }
    
    // Fallback: por username
    found = this.clients.find(c => (c.username || '').toLowerCase().trim() === search);
    if (found) {
      log(`Encontrado por username: ID ${found.id}`, 'OK');
      return found;
    }
    
    return null;
  }

  // ========================================
  // RENOVAR CLIENTE
  // ========================================
  
  async renewClient(clientId, packageId, connections = 1) {
    log(`Renovando: ID ${clientId} | pkg ${packageId} | ${connections} conn`);
    
    const payload = new URLSearchParams({
      package_id: packageId.toString(),
      remaining_months: '0',
      original_max_connections: connections.toString(),
      max_connections: connections.toString()
    });
    
    const response = await this.client.post(`/api/lines/${clientId}/renew`, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': this.getCookieString(),
        'Referer': `${this.baseURL}/lines/manage`,
        'Origin': this.baseURL,
        'X-Requested-With': 'XMLHttpRequest'
      },
      validateStatus: () => true
    });
    
    if (response.data?.message) {
      const msg = response.data.message.replace(/<[^>]*>/g, '').trim();
      
      if (msg.toLowerCase().includes('sucesso') || msg.toLowerCase().includes('success')) {
        log('Renovado!', 'OK');
        return { success: true, message: msg, client_id: clientId, package_id: packageId };
      }
      
      throw new Error(msg);
    }
    
    throw new Error('Resposta inesperada do servidor');
  }

  logout() {
    this.cookies = {};
    this.memberId = null;
    this.clients = [];
    log('Sessão encerrada');
  }
}
