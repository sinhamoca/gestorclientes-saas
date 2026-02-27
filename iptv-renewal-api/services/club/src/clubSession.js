/* ========================================
   CLUB SESSION (dashboard.bz / pdcapi.io)
   
   Login: POST https://pdcapi.io/login (form + hCaptcha)
   Auth: JWT via x-access-token header
   Renovação: POST https://pdcapi.io/listas/{id}/renovar { tempo: N }
   Captcha: hCaptcha via Anti-Captcha (~20-30s)
   Multi-mês: Parâmetro 'tempo' direto (sem loop)
   Stateless: login → renova → descarta
   ======================================== */

import axios from 'axios';
import { log } from './utils.js';

const HCAPTCHA_SITEKEY = '8cf2ef3e-6e60-456a-86ca-6f2c855c3a06';
const TARGET_URL = 'https://dashboard.bz/login.php';
const LOGIN_API = 'https://pdcapi.io/login';
const RENEW_API = 'https://pdcapi.io/listas';

export class ClubSession {
  constructor({ username, password, antiCaptchaKey }) {
    this.username = username;
    this.password = password;
    this.antiCaptchaKey = antiCaptchaKey;
    this.token = null;
    this.loggedIn = false;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ========================================
  // RESOLVER hCAPTCHA VIA ANTI-CAPTCHA
  // ========================================
  
  async solveHCaptcha() {
    if (!this.antiCaptchaKey) throw new Error('Anti-Captcha API Key não configurada');
    
    log('Resolvendo hCaptcha via Anti-Captcha...');
    
    const createResponse = await axios.post('https://api.anti-captcha.com/createTask', {
      clientKey: this.antiCaptchaKey,
      task: {
        type: 'HCaptchaTaskProxyless',
        websiteURL: TARGET_URL,
        websiteKey: HCAPTCHA_SITEKEY
      }
    });
    
    if (createResponse.data.errorId !== 0) {
      throw new Error(`Anti-Captcha: ${createResponse.data.errorDescription}`);
    }
    
    const taskId = createResponse.data.taskId;
    log(`Anti-Captcha task: ${taskId}`);
    
    for (let i = 0; i < 30; i++) {
      await this.sleep(5000);
      
      const result = await axios.post('https://api.anti-captcha.com/getTaskResult', {
        clientKey: this.antiCaptchaKey,
        taskId
      });
      
      if (result.data.status === 'ready') {
        log(`hCaptcha resolvido em ${(i + 1) * 5}s!`, 'OK');
        return result.data.solution.gRecaptchaResponse;
      }
      
      if (result.data.errorId !== 0) {
        throw new Error(`Anti-Captcha: ${result.data.errorDescription}`);
      }
    }
    
    throw new Error('Timeout hCaptcha (150s)');
  }

  // ========================================
  // LOGIN
  // ========================================
  
  async login() {
    log(`Login (${this.username})`);
    
    const hcaptchaToken = await this.solveHCaptcha();
    
    const formData = new URLSearchParams();
    formData.append('username', this.username);
    formData.append('password', this.password);
    formData.append('g-recaptcha-response', hcaptchaToken);
    formData.append('h-captcha-response', hcaptchaToken);
    
    const response = await axios.post(LOGIN_API, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://dashboard.bz',
        'Referer': TARGET_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
    });
    
    if (response.data?.result && response.data?.token) {
      this.token = response.data.token;
      this.loggedIn = true;
      log('Login OK!', 'OK');
      return true;
    }
    
    throw new Error(response.data?.msg || 'Login falhou - sem token');
  }

  // ========================================
  // RENOVAR CLIENTE
  // ========================================
  
  async renewClient(clientId, months) {
    if (!this.token) throw new Error('Não está logado');
    
    log(`Renovando: ${clientId} | ${months} mês(es)`);
    
    const formData = new URLSearchParams();
    formData.append('tempo', months);
    
    const response = await axios.post(`${RENEW_API}/${clientId}/renovar`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-access-token': this.token,
        'Origin': 'https://dashboard.bz',
        'Referer': 'https://dashboard.bz/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
      },
      validateStatus: () => true
    });
    
    const data = response.data;
    
    if (data?.result) {
      const comprovante = (data.msg || '').replace(/<[^>]*>/g, '');
      return {
        success: true,
        client_id: clientId,
        username: data.username,
        months_renewed: data.tempo,
        new_expiry_timestamp: data.novo_time,
        new_expiry: data.novo_time ? new Date(data.novo_time * 1000).toLocaleString('pt-BR') : null,
        receipt: comprovante
      };
    }
    
    throw new Error(data?.msg || `Renovação falhou (HTTP ${response.status})`);
  }

  // ========================================
  // LOGOUT
  // ========================================
  
  logout() {
    this.token = null;
    this.loggedIn = false;
    log('Sessão encerrada');
  }
}
