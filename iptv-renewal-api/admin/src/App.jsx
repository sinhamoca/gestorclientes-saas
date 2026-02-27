import { useState, useEffect, useCallback } from "react";

const API = "/api/v1";

const api = {
  token: null,
  setToken(t) { this.token = t; localStorage.setItem("irapi_admin_token", t); },
  getToken() { return this.token || localStorage.getItem("irapi_admin_token"); },
  clearToken() { this.token = null; localStorage.removeItem("irapi_admin_token"); },
  
  async req(method, path, body = null) {
    const headers = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json();
    if (res.status === 401) { this.clearToken(); window.location.reload(); }
    return data;
  },

  login: (d) => api.req("POST", "/auth/login", d),
  profile: () => api.req("GET", "/auth/profile"),
  
  // Admin
  dashboard: () => api.req("GET", "/admin/dashboard"),
  users: (q = "") => api.req("GET", `/admin/users?limit=100${q}`),
  createUser: (d) => api.req("POST", "/admin/users", d),
  userDetails: (id) => api.req("GET", `/admin/users/${id}`),
  toggleUser: (id) => api.req("PUT", `/admin/users/${id}/toggle`),
  addCredits: (id, d) => api.req("POST", `/admin/users/${id}/credits`, d),
  renewals: (q = "") => api.req("GET", `/admin/renewals?limit=100${q}`),
  pricing: () => api.req("GET", "/usage/providers/pricing"),
  status: () => api.req("GET", "/usage/providers/status"),
  
  // Settings
  getSettings: () => api.req("GET", "/settings"),
  updateSetting: (d) => api.req("PUT", "/settings", d),
  updateSettingsBulk: (d) => api.req("PUT", "/settings/bulk", d),
  testProxy: () => api.req("POST", "/settings/test-proxy"),
  testCaptcha: (d) => api.req("POST", "/settings/test-captcha", d),
  
  // Services & Sessions
  services: () => api.req("GET", "/admin/services"),
  allSessions: () => api.req("GET", "/admin/services/sessions"),
  providerSessions: (p) => api.req("GET", `/admin/services/${p}/sessions`),
  destroyProviderSessions: (p) => api.req("DELETE", `/admin/services/${p}/sessions`),
  destroyAllSessions: () => api.req("DELETE", "/admin/services/sessions"),
};

// ── ICONS ──
const I = {
  Dashboard: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Logs: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Server: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>,
  Logout: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
  Search: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Eye: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  X: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>,
  Copy: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Settings: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
};

const providerColors = {
  sigma: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  cloudnation: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  koffice: { bg: "#fed7aa", text: "#9a3412", dot: "#f97316" },
  uniplay: { bg: "#bfdbfe", text: "#1e3a8a", dot: "#2563eb" },
  club: { bg: "#fce7f3", text: "#9d174d", dot: "#ec4899" },
  painelfoda: { bg: "#fecaca", text: "#991b1b", dot: "#ef4444" },
  rush: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
};

// ── TOAST ──
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const c = { success: "border-emerald-400 bg-emerald-950/80 text-emerald-200", error: "border-red-400 bg-red-950/80 text-red-200", info: "border-sky-400 bg-sky-950/80 text-sky-200" };
  return <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg border ${c[type]} backdrop-blur-sm shadow-2xl`} style={{ animation: "slideIn 0.3s ease" }}>{message}</div>;
}

// ── LOGIN ──
function LoginScreen({ onAuth }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await api.login(form);
    setLoading(false);
    if (res.success) {
      api.setToken(res.token);
      // Verificar se é admin tentando acessar dashboard admin
      const profile = await api.dashboard();
      if (profile.success) { onAuth(); }
      else { api.clearToken(); setError("Acesso restrito a administradores"); }
    } else {
      setError(res.error || "Erro desconhecido");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a0a 50%, #0a0a1a 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-900/30 border border-red-800/50 mb-6">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-red-300 text-xs font-medium tracking-wide uppercase">Admin Panel</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Painel Administrativo</h1>
        </div>
        <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-xl">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required
                className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm" placeholder="admin@iptvapi.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Senha</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required
                className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-all mt-2">
              {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── STAT CARD ──
function Stat({ label, value, sub, color = "red" }) {
  const m = { red: "from-red-500/10 to-red-500/5 border-red-500/20", emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20", sky: "from-sky-500/10 to-sky-500/5 border-sky-500/20", amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20" };
  return (
    <div className={`bg-gradient-to-br ${m[color]} border rounded-xl p-5`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── PAGE: DASHBOARD ──
function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(res => { if (res.success) setData(res); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;
  if (!data) return <div className="text-red-400">Erro ao carregar dados</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Clientes" value={data.users.clients} sub={`${data.users.active} ativos`} color="sky" />
        <Stat label="Receita Total" value={`R$ ${data.financials.total_revenue.toFixed(2)}`} sub={`Mês: R$ ${data.financials.month_revenue.toFixed(2)}`} color="emerald" />
        <Stat label="Renovações (mês)" value={data.month_renewals.total} sub={`${data.month_renewals.success} ok · ${data.month_renewals.failed} falhas`} color="amber" />
        <Stat label="Saldo clientes" value={`R$ ${data.financials.total_client_balance.toFixed(2)}`} sub="Total em créditos" color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por provedor */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800"><h3 className="text-sm font-semibold text-white">Uso por Provedor (mês)</h3></div>
          <div className="divide-y divide-gray-800/50">
            {data.by_provider.map(p => {
              const c = providerColors[p.provider] || providerColors.sigma;
              return (
                <div key={p.provider} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.dot }} />
                    <span className="text-sm text-white capitalize">{p.provider}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{p.total} req</span>
                    <span className="text-emerald-400">R$ {p.revenue.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
            {data.by_provider.length === 0 && <div className="px-5 py-6 text-center text-gray-500 text-sm">Nenhuma renovação este mês</div>}
          </div>
        </div>

        {/* Top clientes */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800"><h3 className="text-sm font-semibold text-white">Top Clientes (mês)</h3></div>
          <div className="divide-y divide-gray-800/50">
            {data.top_clients.map((c, i) => (
              <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm text-white">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm text-white">{c.renewals} renovações</span>
                  <p className="text-xs text-gray-500">R$ {c.spent.toFixed(2)}</p>
                </div>
              </div>
            ))}
            {data.top_clients.length === 0 && <div className="px-5 py-6 text-center text-gray-500 text-sm">Nenhum cliente ainda</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── USER DETAIL MODAL ──
function UserModal({ userId, onClose, toast }) {
  const [data, setData] = useState(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.userDetails(userId).then(res => { if (res.success) setData(res); setLoading(false); });
  }, [userId]);

  const handleAddCredits = async () => {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return;
    const res = await api.addCredits(userId, { amount, description: creditDesc || undefined });
    if (res.success) {
      toast(res.message, "success");
      setCreditAmount(""); setCreditDesc("");
      const updated = await api.userDetails(userId);
      if (updated.success) setData(updated);
    } else { toast(res.error, "error"); }
  };

  const handleToggle = async () => {
    const res = await api.toggleUser(userId);
    if (res.success) {
      toast(res.message, "success");
      const updated = await api.userDetails(userId);
      if (updated.success) setData(updated);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center">
      <div className="text-gray-400">Carregando...</div>
    </div>
  );

  if (!data) return null;

  const u = data.user;
  const s = data.stats;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900 z-10">
          <div>
            <h3 className="text-lg font-bold text-white">{u.name}</h3>
            <p className="text-sm text-gray-400">{u.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleToggle}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${u.is_active ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}`}>
              {u.is_active ? "Desativar" : "Ativar"}
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><I.X /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Saldo" value={`R$ ${u.balance.toFixed(2)}`} color="emerald" />
            <Stat label="Renovações" value={s.total_renewals} color="sky" />
            <Stat label="Sucesso" value={s.successful} color="emerald" />
            <Stat label="Gasto total" value={`R$ ${s.total_spent.toFixed(2)}`} color="amber" />
          </div>

          {/* Add credits */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Adicionar Créditos</h4>
            <div className="flex gap-3">
              <div className="flex-1 flex items-center bg-black/40 border border-gray-700 rounded-lg px-3">
                <span className="text-gray-500 text-sm mr-2">R$</span>
                <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} placeholder="50.00"
                  className="w-full py-2 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm" />
              </div>
              <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)} placeholder="Descrição (opcional)"
                className="flex-1 px-3 py-2 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none text-sm" />
              <button onClick={handleAddCredits} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 shrink-0">Adicionar</button>
            </div>
          </div>

          {/* API Keys */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">API Keys ({data.api_keys.length})</h4>
            <div className="bg-gray-800/30 border border-gray-800 rounded-xl divide-y divide-gray-800/50">
              {data.api_keys.map(k => (
                <div key={k.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <code className="text-xs text-gray-400 font-mono">{k.key_prefix}...</code>
                    <span className="text-xs text-gray-500">{k.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${k.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{k.is_active ? "ativa" : "revogada"}</span>
                </div>
              ))}
              {data.api_keys.length === 0 && <div className="px-4 py-4 text-center text-gray-500 text-xs">Nenhuma API Key</div>}
            </div>
          </div>

          {/* Recent renewals */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Últimas Renovações</h4>
            <div className="bg-gray-800/30 border border-gray-800 rounded-xl divide-y divide-gray-800/50 max-h-48 overflow-y-auto">
              {data.recent_renewals.map(r => {
                const c = providerColors[r.provider] || providerColors.sigma;
                return (
                  <div key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${r.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: c.bg, color: c.text }}>{r.provider}</span>
                      <span className="text-xs text-gray-400">{r.telas}t</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {r.cost > 0 && <span className="text-amber-400">R$ {parseFloat(r.cost).toFixed(2)}</span>}
                      <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                );
              })}
              {data.recent_renewals.length === 0 && <div className="px-4 py-4 text-center text-gray-500 text-xs">Nenhuma renovação</div>}
            </div>
          </div>

          {/* Recent transactions */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Últimas Transações</h4>
            <div className="bg-gray-800/30 border border-gray-800 rounded-xl divide-y divide-gray-800/50 max-h-48 overflow-y-auto">
              {data.recent_transactions.map(t => (
                <div key={t.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${t.type === 'purchase' ? 'text-emerald-400' : t.type === 'refund' ? 'text-sky-400' : 'text-amber-400'}`}>{t.type}</span>
                    <span className="text-xs text-gray-400">{t.description}</span>
                  </div>
                  <span className={`text-xs font-mono ${parseFloat(t.amount) >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {parseFloat(t.amount) >= 0 ? '+' : ''}{parseFloat(t.amount).toFixed(2)}
                  </span>
                </div>
              ))}
              {data.recent_transactions.length === 0 && <div className="px-4 py-4 text-center text-gray-500 text-xs">Nenhuma transação</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PAGE: USERS ──
function UsersPage({ toast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", initial_credits: "" });
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await api.users(q);
    if (res.success) setUsers(res.users);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    const payload = {
      name: createForm.name,
      email: createForm.email,
      password: createForm.password,
    };
    if (createForm.initial_credits) payload.initial_credits = parseFloat(createForm.initial_credits);
    
    const res = await api.createUser(payload);
    setCreating(false);
    
    if (res.success) {
      setCreatedUser(res);
      setCreateForm({ name: "", email: "", password: "", initial_credits: "" });
      load();
      toast("Usuário criado com sucesso!", "success");
    } else {
      toast(res.error, "error");
    }
  };

  const copyKey = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {selectedUser && <UserModal userId={selectedUser} onClose={() => { setSelectedUser(null); load(); }} toast={toast} />}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">Usuários</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-xl px-3 gap-2">
            <I.Search />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou email..."
              className="py-2.5 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm w-64" />
          </div>
          <button onClick={() => { setShowCreate(!showCreate); setCreatedUser(null); }}
            className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-all flex items-center gap-2">
            <I.Plus /> Novo Usuário
          </button>
        </div>
      </div>

      {/* API Key do usuário recém-criado */}
      {createdUser && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-emerald-400 text-sm font-semibold">Usuário "{createdUser.user.name}" criado!</p>
              <p className="text-gray-400 text-xs mt-1">Copie a API Key abaixo e envie para o cliente. Ela não será exibida novamente.</p>
            </div>
            <button onClick={() => setCreatedUser(null)} className="text-gray-500 hover:text-white"><I.X /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="bg-black/40 rounded-lg p-3">
              <span className="text-xs text-gray-500">Email</span>
              <p className="text-sm text-white mt-0.5">{createdUser.user.email}</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <span className="text-xs text-gray-500">Saldo inicial</span>
              <p className="text-sm text-emerald-400 mt-0.5">R$ {createdUser.user.balance.toFixed(2)}</p>
            </div>
          </div>
          <div className="bg-black/60 rounded-lg p-3 flex items-center gap-3">
            <code className="text-emerald-400 text-xs break-all flex-1">{createdUser.api_key.key}</code>
            <button onClick={() => copyKey(createdUser.api_key.key)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30 flex items-center gap-1.5">
              {copied ? <><I.Check /> Copiada</> : <><I.Copy /> Copiar</>}
            </button>
          </div>
        </div>
      )}

      {/* Formulário de criação */}
      {showCreate && !createdUser && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Criar novo usuário</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Nome</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} required
                placeholder="Nome do cliente" className="w-full px-3 py-2.5 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Email</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm({...createForm, email: e.target.value})} required
                placeholder="email@cliente.com" className="w-full px-3 py-2.5 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Senha</label>
              <input type="text" value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} required minLength={6}
                placeholder="Mín. 6 caracteres" className="w-full px-3 py-2.5 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Créditos iniciais</label>
              <div className="flex items-center bg-black/40 border border-gray-700 rounded-lg px-3">
                <span className="text-gray-500 text-sm mr-1">R$</span>
                <input type="number" value={createForm.initial_credits} onChange={e => setCreateForm({...createForm, initial_credits: e.target.value})}
                  placeholder="0.00" min="0" step="5" className="w-full py-2.5 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm" />
              </div>
            </div>
            <button type="submit" disabled={creating}
              className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-50 transition-all">
              {creating ? "Criando..." : "Criar"}
            </button>
          </form>
        </div>
      )}

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum usuário encontrado</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Usuário</th>
                <th className="px-3 py-3 text-right">Saldo</th>
                <th className="px-3 py-3 text-right">Renovações</th>
                <th className="px-3 py-3 text-right">Mês</th>
                <th className="px-3 py-3 text-right">Gasto</th>
                <th className="px-3 py-3 text-center">Keys</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm text-white font-medium">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-emerald-400 font-mono">R$ {u.balance.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-300">{u.total_renewals}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-400">{u.month_renewals}</td>
                  <td className="px-3 py-3 text-right text-sm text-amber-400 font-mono">R$ {u.total_spent.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-400">{u.active_keys}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {u.is_active ? "ativo" : "inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => setSelectedUser(u.id)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-all flex items-center gap-1.5 mx-auto">
                      <I.Eye /> Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── PAGE: RENEWAL LOGS ──
function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter ? `&provider=${filter}` : "";
    const res = await api.renewals(q);
    if (res.success) setLogs(res.renewals);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Logs de Renovação</h2>
          <p className="text-gray-500 text-sm mt-1">Todas as renovações de todos os clientes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filter ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Todos</button>
          {Object.keys(providerColors).map(p => (
            <button key={p} onClick={() => setFilter(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === p ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum log encontrado</div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
            {logs.map(r => {
              const c = providerColors[r.provider] || providerColors.sigma;
              return (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${r.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: c.bg, color: c.text }}>{r.provider}</span>
                    <div>
                      <span className="text-sm text-white">{r.user_name}</span>
                      <span className="text-xs text-gray-500 ml-2">{r.telas}t · {r.response_time_ms}ms</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {r.error_message && <span className="text-red-400 max-w-[200px] truncate">{r.error_message}</span>}
                    {r.cost > 0 ? <span className="text-emerald-400">R$ {r.cost.toFixed(2)}</span> : r.status === 'failed' && <span className="text-gray-600">reemb.</span>}
                    <span className="text-gray-600">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PAGE: SERVICES ──
function ServicesPage({ toast }) {
  const [services, setServices] = useState({});
  const [sessions, setSessions] = useState({});
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0 });
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [destroying, setDestroying] = useState({});
  const [destroyingAll, setDestroyingAll] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);

  const loadAll = useCallback(async () => {
    const [svcRes, sessRes] = await Promise.all([api.services(), api.allSessions()]);
    if (svcRes.success) { setServices(svcRes.services); setSummary(svcRes.summary); }
    if (sessRes.success) { setSessions(sessRes.providers); setTotalSessions(sessRes.totalSessions); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refresh = async () => {
    setChecking(true);
    await loadAll();
    setChecking(false);
  };

  const destroyProvider = async (provider) => {
    if (!confirm(`Destruir todas as sessões de ${provider}?`)) return;
    setDestroying(p => ({...p, [provider]: true}));
    const res = await api.destroyProviderSessions(provider);
    setDestroying(p => ({...p, [provider]: false}));
    if (res.success) { toast(`Sessões de ${provider} destruídas`, "success"); await loadAll(); }
    else toast(res.error, "error");
  };

  const destroyAll = async () => {
    if (!confirm("Destruir TODAS as sessões de TODOS os serviços?")) return;
    setDestroyingAll(true);
    const res = await api.destroyAllSessions();
    setDestroyingAll(false);
    if (res.success) { toast("Todas as sessões destruídas", "success"); await loadAll(); }
    else toast(res.error, "error");
  };

  const fmtTime = (ms) => {
    if (!ms && ms !== 0) return "-";
    if (ms < 60) return `${ms}min`;
    const h = Math.floor(ms / 60);
    const m = ms % 60;
    return `${h}h${m > 0 ? m + "m" : ""}`;
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Serviços & Sessões</h2>
          <p className="text-sm text-gray-500 mt-1">Monitoramento e gerenciamento dos microserviços</p>
        </div>
        <div className="flex gap-2">
          {totalSessions > 0 && (
            <button onClick={destroyAll} disabled={destroyingAll}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm hover:bg-red-500/20 flex items-center gap-2 disabled:opacity-50">
              <I.X /> {destroyingAll ? "Destruindo..." : "Encerrar Tudo"}
            </button>
          )}
          <button onClick={refresh} disabled={checking}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
            <I.Refresh /> {checking ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{summary.total}</div>
          <div className="text-xs text-gray-500 mt-1">Serviços</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{summary.online}</div>
          <div className="text-xs text-gray-500 mt-1">Online</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{totalSessions}</div>
          <div className="text-xs text-gray-500 mt-1">Sessões Ativas</div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="space-y-3">
        {Object.entries(services).map(([provider, svc]) => {
          const c = providerColors[provider] || { bg: "#e5e7eb", text: "#374151", dot: "#9ca3af" };
          const sess = sessions[provider];
          const sessionCount = sess?.total || 0;
          const isExpanded = expandedProvider === provider;
          const isOnline = svc.status === 'online';

          return (
            <div key={provider} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              {/* Provider Header */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.dot }} />
                    <span className="font-semibold text-white text-lg">{provider.charAt(0).toUpperCase() + provider.slice(1)}</span>
                    
                    {/* Status Badge */}
                    <span className={`text-xs px-2.5 py-0.5 rounded-full ${
                      isOnline 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {isOnline ? 'online' : 'offline'}
                    </span>
                    
                    {isOnline && svc.responseTime && (
                      <span className="text-xs text-gray-600">{svc.responseTime}ms</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Session Count */}
                    {sessionCount > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                        {sessionCount} sessão{sessionCount > 1 ? 'ões' : ''}
                      </span>
                    )}
                    
                    {/* Destroy Sessions Button */}
                    {sessionCount > 0 && (
                      <button onClick={() => destroyProvider(provider)} disabled={destroying[provider]}
                        className="text-xs px-3 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-all">
                        {destroying[provider] ? "..." : "Encerrar"}
                      </button>
                    )}
                    
                    {/* Expand Button */}
                    {isOnline && (
                      <button onClick={() => setExpandedProvider(isExpanded ? null : provider)}
                        className="text-xs px-3 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-all">
                        {isExpanded ? "Recolher" : "Detalhes"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Info Row */}
                {isOnline && (
                  <div className="flex gap-6 mt-3 text-xs text-gray-500">
                    {svc.version && <span>v{svc.version}</span>}
                    {svc.port && <span>:{svc.port}</span>}
                    {svc.features && Object.entries(svc.features).filter(([,v]) => v).map(([k]) => (
                      <span key={k} className="text-gray-600">
                        {k === 'session_keeper' ? '🔄 Keeper' : 
                         k === 'hcaptcha' ? '🛡️ hCaptcha' : 
                         k === 'csrf_login' ? '🔐 CSRF' :
                         k === 'multi_month' ? '📅 Multi-mês' :
                         k === 'multi_client' ? '👥 Multi-cliente' :
                         k === 'bandwidth_tracking' ? '📊 Bandwidth' :
                         k === 'socks5_proxy' ? '🌐 Proxy' :
                         k === 'name_search' ? '🔍 Busca por nome' :
                         k === 'cloudflare_worker' ? '☁️ CF Worker' :
                         k === 'turnstile_captcha' ? '🔐 Turnstile' :
                         k === 'cookie_auth' ? '🍪 Cookies' :
                         k === 'multi_month_loop' ? '📅 Multi-mês' :
                         k === 'multi_month_direct' ? '📅 Multi-mês' :
                         k === 'external_api' ? '🌐 API Externa' :
                         k === 'fixed_api' ? '🌐 API Fixa' :
                         k === 'iptv_p2p_auto' ? '📺 IPTV/P2P' :
                         k === 'configurable_domain' ? '🔗 Domínio config.' :
                         k === 'package_id_required' ? '📦 Package ID' :
                         k === 'client_cache' ? '💾 Cache Clientes' :
                         k === 'suffix_multi_screen' ? '🖥️ Sufixo Multi-tela' : k}
                      </span>
                    ))}
                    {svc.uptime != null && <span>⏱️ {svc.uptime > 3600 ? `${Math.floor(svc.uptime / 3600)}h${Math.floor((svc.uptime % 3600) / 60)}m` : svc.uptime > 60 ? `${Math.floor(svc.uptime / 60)}min` : `${svc.uptime}s`}</span>}
                    {svc.sessions && <span>💾 {svc.sessions.maxIdle} idle / {svc.sessions.maxAge} max</span>}
                    {svc.bandwidth && <span>📊 {svc.bandwidth.total_kb} KB ({svc.bandwidth.total_requests} reqs)</span>}
                  </div>
                )}
                
                {!isOnline && (
                  <div className="mt-2 text-xs text-red-400/60">{svc.error || 'Serviço não respondeu'} · {svc.url}</div>
                )}
              </div>

              {/* Expanded: Sessions Detail */}
              {isExpanded && sess?.sessions && sess.sessions.length > 0 && (
                <div className="border-t border-gray-800/50 bg-black/20">
                  <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sessões Ativas</div>
                    <div className="space-y-2">
                      {sess.sessions.map((s, i) => (
                        <div key={i} className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${s.loggedIn ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              <span className="text-sm text-white font-mono">{s.key || `${s.domain} (${s.username})`}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {s.loginCount != null && <span title="Logins">🔑 {s.loginCount}x</span>}
                              {s.renewCount != null && <span title="Renovações">🔄 {s.renewCount}</span>}
                              {s.cookiesCount != null && <span title="Cookies">🍪 {s.cookiesCount}</span>}
                              {s.bandwidth?.total_kb != null && <span title="Bandwidth total">📊 {s.bandwidth.total_kb} KB</span>}
                            </div>
                          </div>
                          <div className="flex gap-6 mt-2 text-[11px] text-gray-600">
                            {s.domain && <span>🌐 {s.domain.replace(/^https?:\/\//, '')}</span>}
                            {s.username && <span>👤 {s.username}</span>}
                            {s.sessionMinutes != null && <span>⏱️ Ativa: {fmtTime(s.sessionMinutes)}</span>}
                            {s.idleMinutes != null && <span>💤 Idle: {fmtTime(s.idleMinutes)}</span>}
                          </div>
                          {s.bandwidth && (
                            <div className="flex gap-6 mt-1 text-[11px] text-gray-600">
                              <span title="Enviado">📤 Enviado: {s.bandwidth.sent_kb} KB</span>
                              <span title="Recebido">📥 Recebido: {s.bandwidth.received_kb} KB</span>
                              <span title="Requests">🔁 {s.bandwidth.total_requests} requests</span>
                              <span title="Média por request">📏 Média: {s.bandwidth.avg_per_request_kb} KB/req</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isExpanded && (!sess?.sessions || sess.sessions.length === 0) && (
                <div className="border-t border-gray-800/50 bg-black/20 px-5 py-4">
                  {sess?.bandwidth ? (
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Consumo de Banda (acumulado)</div>
                      <div className="flex gap-6 text-xs text-gray-500">
                        <span>📤 Enviado: {sess.bandwidth.global_sent_kb} KB</span>
                        <span>📥 Recebido: {sess.bandwidth.global_received_kb} KB</span>
                        <span>📊 Total: {sess.bandwidth.global_total_kb} KB</span>
                        <span>🔁 {sess.bandwidth.global_requests} requests</span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1">Stateless — sem sessões ativas (login a cada renovação)</div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 text-center">
                      {sess?.status === 'no_keeper' ? 'Este serviço não possui session keeper' : 'Nenhuma sessão ativa'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PAGE: SETTINGS ──
function SettingsPage({ toast }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState({});
  const [proxyTest, setProxyTest] = useState(null);
  const [testingProxy, setTestingProxy] = useState(false);
  const [captchaTests, setCaptchaTests] = useState({});
  const [testingCaptcha, setTestingCaptcha] = useState({});

  const load = useCallback(async () => {
    const res = await api.getSettings();
    if (res.success) {
      setSettings(res.settings);
      // Inicializar editValues - campos secretos ficam VAZIOS (não carregam máscara)
      const vals = {};
      for (const cat of Object.values(res.settings)) {
        for (const s of cat) {
          vals[s.key] = s.is_secret ? '' : (s.value || '');
        }
      }
      setEditValues(vals);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSetting = async (key) => {
    // Não salvar se campo secreto está vazio (não foi editado)
    const setting = Object.values(settings).flat().find(s => s.key === key);
    if (setting?.is_secret && !editValues[key]) {
      toast("Nenhuma alteração (campo vazio)", "info");
      return;
    }
    setSaving(p => ({...p, [key]: true}));
    const res = await api.updateSetting({ key, value: editValues[key] });
    setSaving(p => ({...p, [key]: false}));
    if (res.success) {
      toast(`Configuração salva!`, "success");
      // Limpar o campo secreto após salvar (não mostrar a máscara)
      if (setting?.is_secret) {
        setEditValues(p => ({...p, [key]: ''}));
      }
      load();
    } else {
      toast(res.error, "error");
    }
  };

  const handleTestProxy = async () => {
    setTestingProxy(true);
    setProxyTest(null);
    // Salvar APENAS configs do proxy que foram editadas (não vazias de campos secretos)
    const proxyKeys = Object.keys(editValues).filter(k => k.startsWith('proxy_'));
    const toSave = proxyKeys.filter(k => {
      const setting = settings.proxy?.find(s => s.key === k);
      // Salvar campo não-secreto sempre, campo secreto só se preenchido
      return !setting?.is_secret || editValues[k];
    });
    if (toSave.length > 0) {
      await api.updateSettingsBulk({
        settings: toSave.map(k => ({ key: k, value: editValues[k] }))
      });
    }
    const res = await api.testProxy();
    setTestingProxy(false);
    if (res.success) setProxyTest(res);
    else toast(res.error, "error");
  };

  const handleTestCaptcha = async (service) => {
    setTestingCaptcha(p => ({...p, [service]: true}));
    const keyName = service === '2captcha' ? 'captcha_2captcha_key' : 'captcha_anticaptcha_key';
    // Só salvar a key se o usuário digitou algo novo
    if (editValues[keyName]) {
      await api.updateSetting({ key: keyName, value: editValues[keyName] });
    }
    const res = await api.testCaptcha({ service });
    setTestingCaptcha(p => ({...p, [service]: false}));
    if (res.success) setCaptchaTests(p => ({...p, [service]: res}));
    else toast(res.error, "error");
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;

  const InputField = ({ setting, showSave = true }) => {
    const isSecret = setting.is_secret;
    const key = setting.key;
    // Verificar se o campo secreto tem valor salvo (o value da API vem mascarado)
    const hasExistingValue = isSecret && setting.value && setting.value.includes('•');
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1">{setting.description}</label>
        <div className="flex gap-2">
          <input
            type={isSecret ? "password" : "text"}
            value={editValues[key] || ''}
            onChange={e => setEditValues(p => ({...p, [key]: e.target.value}))}
            placeholder={isSecret ? (hasExistingValue ? "••• chave salva (digite para alterar)" : "Não configurado") : "Não configurado"}
            className="flex-1 px-3 py-2 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm font-mono"
          />
          {showSave && (
            <button onClick={() => saveSetting(key)} disabled={saving[key]}
              className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-all disabled:opacity-50 shrink-0">
              {saving[key] ? "..." : "Salvar"}
            </button>
          )}
        </div>
        {hasExistingValue && !editValues[key] && (
          <span className="text-[10px] text-gray-600 mt-0.5 block">Valor atual: {setting.value}</span>
        )}
      </div>
    );
  };

  const StatusBadge = ({ result }) => {
    if (!result) return null;
    const isOk = result.status === 'online' || result.status === 'ok';
    return (
      <div className={`mt-3 p-3 rounded-lg border text-sm ${isOk ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="font-medium">{result.message}</span>
        </div>
        {result.response_time_ms && <span className="text-xs text-gray-500 mt-1 block">{result.response_time_ms}ms</span>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Configurações</h2>

      {/* ── CAPTCHA ── */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <span className="text-amber-400 text-xs font-bold">C</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Captcha</h3>
            <p className="text-xs text-gray-500">Chaves para resolver captchas automaticamente</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* 2Captcha */}
          <div className="bg-black/20 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-white">2Captcha</h4>
                <p className="text-xs text-gray-500">Usado para Turnstile (CloudNation / Live21)</p>
              </div>
              <button onClick={() => handleTestCaptcha('2captcha')} disabled={testingCaptcha['2captcha']}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50">
                {testingCaptcha['2captcha'] ? "Testando..." : "Testar conexão"}
              </button>
            </div>
            {settings.captcha?.find(s => s.key === 'captcha_2captcha_key') && (
              <InputField setting={settings.captcha.find(s => s.key === 'captcha_2captcha_key')} />
            )}
            <StatusBadge result={captchaTests['2captcha']} />
          </div>

          {/* Anti-Captcha */}
          <div className="bg-black/20 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-white">Anti-Captcha</h4>
                <p className="text-xs text-gray-500">Usado para hCaptcha (Koffice, Club)</p>
              </div>
              <button onClick={() => handleTestCaptcha('anticaptcha')} disabled={testingCaptcha['anticaptcha']}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50">
                {testingCaptcha['anticaptcha'] ? "Testando..." : "Testar conexão"}
              </button>
            </div>
            {settings.captcha?.find(s => s.key === 'captcha_anticaptcha_key') && (
              <InputField setting={settings.captcha.find(s => s.key === 'captcha_anticaptcha_key')} />
            )}
            <StatusBadge result={captchaTests['anticaptcha']} />
          </div>
        </div>
      </div>

      {/* ── PROXY ── */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <span className="text-red-400 text-xs font-bold">P</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Proxy Residencial</h3>
              <p className="text-xs text-gray-500">Necessário para Uniplay e painéis com bloqueio de IP</p>
            </div>
          </div>
          <button onClick={handleTestProxy} disabled={testingProxy}
            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-2">
            <I.Refresh /> {testingProxy ? "Testando..." : "Testar proxy"}
          </button>
        </div>

        <StatusBadge result={proxyTest} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {settings.proxy?.filter(s => s.key === 'proxy_protocol').map(s => (
            <div key={s.key}>
              <label className="block text-xs text-gray-400 mb-1">{s.description}</label>
              <select value={editValues[s.key] || 'socks5'} onChange={e => setEditValues(p => ({...p, [s.key]: e.target.value}))}
                className="w-full px-3 py-2 bg-black/40 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500/50 text-sm">
                <option value="socks5">SOCKS5</option>
                <option value="socks4">SOCKS4</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </div>
          ))}
          {settings.proxy?.filter(s => s.key === 'proxy_host').map(s => <div key={s.key}><InputField setting={s} showSave={false} /></div>)}
          {settings.proxy?.filter(s => s.key === 'proxy_port').map(s => <div key={s.key}><InputField setting={s} showSave={false} /></div>)}
          {settings.proxy?.filter(s => s.key === 'proxy_username').map(s => <div key={s.key}><InputField setting={s} showSave={false} /></div>)}
          {settings.proxy?.filter(s => s.key === 'proxy_password').map(s => <div key={s.key}><InputField setting={s} showSave={false} /></div>)}
        </div>

        <button onClick={async () => {
          const proxyKeys = Object.keys(editValues).filter(k => k.startsWith('proxy_'));
          // Filtrar: campos não-secretos sempre, secretos só se preenchidos
          const toSave = proxyKeys.filter(k => {
            const setting = settings.proxy?.find(s => s.key === k);
            return !setting?.is_secret || editValues[k];
          });
          if (toSave.length === 0) { toast("Nenhuma alteração", "info"); return; }
          setSaving(p => ({...p, proxy_bulk: true}));
          const res = await api.updateSettingsBulk({ settings: toSave.map(k => ({ key: k, value: editValues[k] })) });
          setSaving(p => ({...p, proxy_bulk: false}));
          if (res.success) { toast("Proxy salvo!", "success"); load(); }
          else toast(res.error, "error");
        }} disabled={saving.proxy_bulk}
          className="mt-4 px-5 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-all disabled:opacity-50">
          {saving.proxy_bulk ? "Salvando..." : "Salvar configurações do proxy"}
        </button>
      </div>

      {/* ── CLOUDFLARE WORKERS ── */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <span className="text-sky-400 text-xs font-bold">W</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Cloudflare Workers</h3>
            <p className="text-xs text-gray-500">Workers usados para bypass de painéis protegidos</p>
          </div>
        </div>

        <div className="space-y-4">
          {settings.workers?.map(s => (
            <InputField key={s.key} setting={s} />
          ))}
          {(!settings.workers || settings.workers.length === 0) && (
            <p className="text-gray-500 text-sm">Nenhum worker configurado</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──
export default function App() {
  const [authed, setAuthed] = useState(!!api.getToken());
  const [page, setPage] = useState("dashboard");
  const [toastData, setToastData] = useState(null);

  const toast = (message, type = "info") => setToastData({ message, type, key: Date.now() });

  useEffect(() => {
    if (authed) {
      api.dashboard().then(res => { if (!res.success) { api.clearToken(); setAuthed(false); } });
    }
  }, [authed]);

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: I.Dashboard },
    { id: "users", label: "Usuários", icon: I.Users },
    { id: "logs", label: "Logs", icon: I.Logs },
    { id: "services", label: "Serviços", icon: I.Server },
    { id: "settings", label: "Configurações", icon: I.Settings },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(180deg, #0a0a1a 0%, #111015 100%)" }}>
      {toastData && <Toast {...toastData} onClose={() => setToastData(null)} />}

      <aside className="w-60 shrink-0 border-r border-gray-800/50 p-6 flex flex-col">
        <div className="mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">IPTV Renewal</h1>
              <span className="text-[10px] text-red-400 uppercase tracking-widest font-semibold">Admin</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                page === n.id ? 'bg-red-500/10 text-white border border-red-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}>
              <n.icon /> {n.label}
            </button>
          ))}
        </nav>

        <button onClick={() => { api.clearToken(); setAuthed(false); }}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
          <I.Logout /> Sair
        </button>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {page === "dashboard" && <DashboardPage />}
          {page === "users" && <UsersPage toast={toast} />}
          {page === "logs" && <LogsPage />}
          {page === "services" && <ServicesPage toast={toast} />}
          {page === "settings" && <SettingsPage toast={toast} />}
        </div>
      </main>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
      `}</style>
    </div>
  );
}
