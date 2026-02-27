/* ========================================
   RUSH SESSION (paineloffice.click)
   
   API fixa: https://api-new.paineloffice.click
   Login: POST /auth/login → JWT token
   Auth: Query params (username, password, token)
   Busca: Por nome no campo notes/nota
   Tipo: IPTV ou P2P (busca e renova separado)
   Renovação: PUT /{tipo}/extend/{id} { month, amount:25, screen? }
   Multi-mês: Direto (param month)
   Sem captcha, sem proxy
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

const BASE_API = 'https://api-new.paineloffice.click';

export class RushSession {
  constructor({ username, password }) {
    this.username = username;
    this.password = password;
    this.token = null;
    
    this.client = axios.create({
      baseURL: BASE_API,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  authParams() {
    return `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&token=${encodeURIComponent(this.token)}`;
  }

  // ========================================
  // LOGIN
  // ========================================
  
  async login() {
    log(`Login (${this.username})`);
    
    const response = await this.client.post('/auth/login', {
      username: this.username,
      password: this.password
    });
    
    const token = response.data?.token || response.data?.access_token;
    if (!token) throw new Error('Token não retornado pelo servidor');
    
    this.token = token;
    log('Login OK!', 'OK');
    return true;
  }

  // ========================================
  // LISTAR CLIENTES
  // ========================================
  
  async listIPTV() {
    const url = `/iptv/list?limit=1000&page=1&orderBy=exp_date&order=ASC&${this.authParams()}`;
    const response = await this.client.get(url);
    const items = response.data?.items || [];
    return items.map(c => ({
      id: c.id,
      username: c.username,
      notes: (c.notes || '').trim(),
      screens: c.screens || 1,
      system: 'IPTV'
    }));
  }

  async listP2P() {
    const url = `/p2p/list?limit=1000&page=1&isTrial=0&orderBy=endTime&order=ASC&${this.authParams()}`;
    const response = await this.client.get(url);
    const items = response.data?.items || [];
    return items.map(c => ({
      id: c.new_id || c.id,
      username: c.name || c.username,
      notes: (c.nota || c.notes || '').trim(),
      screens: null,
      system: 'P2P'
    }));
  }

  // ========================================
  // BUSCAR CLIENTE POR NOME
  // ========================================
  
  async findClientByName(clientName, rushType = 'IPTV') {
    const searchName = clientName.trim().toLowerCase();
    
    // Buscar no tipo especificado primeiro
    const primaryList = rushType === 'P2P' ? await this.listP2P() : await this.listIPTV();
    
    const found = primaryList.find(c => c.notes.toLowerCase() === searchName);
    if (found) {
      log(`Encontrado em ${found.system}: ID ${found.id} | "${found.notes}"`, 'OK');
      return found;
    }
    
    // Fallback: tentar no outro tipo
    const fallbackList = rushType === 'P2P' ? await this.listIPTV() : await this.listP2P();
    const foundFallback = fallbackList.find(c => c.notes.toLowerCase() === searchName);
    
    if (foundFallback) {
      log(`Encontrado em ${foundFallback.system} (fallback): ID ${foundFallback.id}`, 'OK');
      return foundFallback;
    }
    
    return null;
  }

  // ========================================
  // RENOVAR CLIENTE
  // ========================================
  
  async renewClient(clientId, months, planType, screens = 1) {
    log(`Renovando: ID ${clientId} | ${planType} | ${months}m | ${screens} tela(s)`);
    
    const endpoint = planType.toUpperCase() === 'P2P'
      ? `/p2p/extend/${clientId}?${this.authParams()}`
      : `/iptv/extend/${clientId}?${this.authParams()}`;
    
    const payload = { month: months, amount: 25 };
    if (planType.toUpperCase() !== 'P2P') payload.screen = screens;
    
    const response = await this.client.put(endpoint, payload);
    
    if (response.data?.success || response.data?.id) {
      const result = response.data?.result || response.data;
      let newExpiry = '';
      
      if (planType.toUpperCase() === 'P2P' && result.endTime) {
        newExpiry = new Date(result.endTime).toLocaleString('pt-BR');
      } else if (result.exp_date) {
        newExpiry = new Date(result.exp_date * 1000).toLocaleString('pt-BR');
      }
      
      log(`Renovado! Expira: ${newExpiry}`, 'OK');
      return { success: true, client_id: clientId, new_expiry: newExpiry, raw: response.data };
    }
    
    throw new Error(response.data?.message || 'Renovação falhou');
  }

  logout() { this.token = null; }
}
