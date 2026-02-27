/* ========================================
   BANDWIDTH TRACKER - UNIPLAY
   
   Rastreia consumo de KB por usuário/processo.
   Intercepta requests e responses do axios.
   Mantém estatísticas em memória.
   ======================================== */

import { log } from './utils.js';

class BandwidthTracker {
  constructor() {
    // Map<username, { totalSent, totalReceived, requests, history[] }>
    this.stats = new Map();
  }

  // Registrar bytes enviados/recebidos
  track(username, { sent = 0, received = 0, method = '', path = '' }) {
    if (!this.stats.has(username)) {
      this.stats.set(username, {
        totalSent: 0,
        totalReceived: 0,
        totalRequests: 0,
        startedAt: Date.now(),
        lastActivity: Date.now(),
        history: []
      });
    }

    const entry = this.stats.get(username);
    entry.totalSent += sent;
    entry.totalReceived += received;
    entry.totalRequests++;
    entry.lastActivity = Date.now();

    // Guardar últimos 50 requests
    if (entry.history.length >= 50) entry.history.shift();
    entry.history.push({
      time: new Date().toISOString(),
      method,
      path,
      sent,
      received
    });
  }

  // Calcular tamanho de um request/response
  static calcBytes(data) {
    if (!data) return 0;
    if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
    if (Buffer.isBuffer(data)) return data.length;
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 0;
    }
  }

  // Stats de um usuário
  getUserStats(username) {
    const entry = this.stats.get(username);
    if (!entry) return null;

    const total = entry.totalSent + entry.totalReceived;
    return {
      username,
      sent_kb: +(entry.totalSent / 1024).toFixed(2),
      received_kb: +(entry.totalReceived / 1024).toFixed(2),
      total_kb: +(total / 1024).toFixed(2),
      total_requests: entry.totalRequests,
      avg_per_request_kb: entry.totalRequests > 0 ? +((total / entry.totalRequests) / 1024).toFixed(2) : 0,
      started_at: new Date(entry.startedAt).toISOString(),
      last_activity: new Date(entry.lastActivity).toISOString(),
      duration_minutes: Math.floor((Date.now() - entry.startedAt) / 60000)
    };
  }

  // Stats de todos
  getAllStats() {
    const users = [];
    let globalSent = 0;
    let globalReceived = 0;
    let globalRequests = 0;

    for (const [username] of this.stats.entries()) {
      const s = this.getUserStats(username);
      users.push(s);
      globalSent += this.stats.get(username).totalSent;
      globalReceived += this.stats.get(username).totalReceived;
      globalRequests += this.stats.get(username).totalRequests;
    }

    return {
      total_users: users.length,
      global_sent_kb: +(globalSent / 1024).toFixed(2),
      global_received_kb: +(globalReceived / 1024).toFixed(2),
      global_total_kb: +((globalSent + globalReceived) / 1024).toFixed(2),
      global_requests: globalRequests,
      users
    };
  }

  // Histórico de um usuário
  getUserHistory(username) {
    const entry = this.stats.get(username);
    if (!entry) return [];
    return entry.history.map(h => ({
      ...h,
      sent_kb: +(h.sent / 1024).toFixed(2),
      received_kb: +(h.received / 1024).toFixed(2)
    }));
  }

  // Limpar stats de um usuário
  clear(username) {
    this.stats.delete(username);
  }

  // Limpar tudo
  clearAll() {
    this.stats.clear();
  }

  // Instalar interceptors no axios client
  installInterceptors(axiosClient, username) {
    // Interceptor de REQUEST → contar bytes enviados
    axiosClient.interceptors.request.use((config) => {
      const sent = BandwidthTracker.calcBytes(config.data);
      // Estimar headers (~500 bytes típico)
      const headerSize = BandwidthTracker.calcBytes(config.headers) + 200;
      config._bwSent = sent + headerSize;
      config._bwMethod = config.method?.toUpperCase() || '?';
      config._bwPath = (config.url || '').replace(config.baseURL || '', '');
      return config;
    });

    // Interceptor de RESPONSE → contar bytes recebidos
    axiosClient.interceptors.response.use(
      (response) => {
        const received = BandwidthTracker.calcBytes(response.data);
        const headerSize = BandwidthTracker.calcBytes(response.headers) + 200;
        
        this.track(username, {
          sent: response.config._bwSent || 0,
          received: received + headerSize,
          method: response.config._bwMethod || '?',
          path: response.config._bwPath || '?'
        });
        
        return response;
      },
      (error) => {
        // Contar mesmo em erro
        const received = BandwidthTracker.calcBytes(error.response?.data);
        this.track(username, {
          sent: error.config?._bwSent || 0,
          received: received || 0,
          method: error.config?._bwMethod || '?',
          path: error.config?._bwPath || '?'
        });
        
        return Promise.reject(error);
      }
    );
  }
}

const tracker = new BandwidthTracker();
export default tracker;
