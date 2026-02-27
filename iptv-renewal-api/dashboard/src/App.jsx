import { useState, useEffect, useCallback, useRef } from "react";

// ========================================
// CONFIG
// ========================================
const API_BASE = "/api/v1";

// ========================================
// API SERVICE
// ========================================
const api = {
  token: null,
  
  setToken(t) { this.token = t; localStorage.setItem("irapi_token", t); },
  getToken() { return this.token || localStorage.getItem("irapi_token"); },
  clearToken() { this.token = null; localStorage.removeItem("irapi_token"); },
  
  async request(method, path, body = null, useApiKey = false) {
    const headers = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token && !useApiKey) headers["Authorization"] = `Bearer ${token}`;
    
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!res.ok && res.status === 401) { this.clearToken(); window.location.reload(); }
    return data;
  },
  
  // Auth
  register: (d) => api.request("POST", "/auth/register", d),
  login: (d) => api.request("POST", "/auth/login", d),
  profile: () => api.request("GET", "/auth/profile"),
  listKeys: () => api.request("GET", "/auth/api-keys"),
  createKey: (d) => api.request("POST", "/auth/api-keys", d),
  revokeKey: (id) => api.request("DELETE", `/auth/api-keys/${id}`),
  
  // Credits
  balance: () => api.request("GET", "/credits/balance"),
  addCredits: (d) => api.request("POST", "/credits/add", d),
  transactions: (limit = 30) => api.request("GET", `/credits/transactions?limit=${limit}`),
  
  // Usage
  summary: () => api.request("GET", "/usage/summary"),
  history: (q = "") => api.request("GET", `/usage/history?limit=50${q}`),
  pricing: () => api.request("GET", "/usage/providers/pricing"),
  status: () => api.request("GET", "/usage/providers/status"),
  
  // Sigma
  sigmaPackages: (d) => api.request("POST", "/sigma/packages", d),
};

// ========================================
// ICONS (inline SVG)
// ========================================
const Icons = {
  Key: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Wallet: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  Chart: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
  List: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>,
  Server: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>,
  Logout: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
  Copy: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>,
  Refresh: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>,
  User: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Dollar: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Package: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
};

// ========================================
// PROVIDER BADGE COLORS
// ========================================
const providerColors = {
  sigma: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  cloudnation: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  koffice: { bg: "#fed7aa", text: "#9a3412", dot: "#f97316" },
  uniplay: { bg: "#bfdbfe", text: "#1e3a8a", dot: "#2563eb" },
  club: { bg: "#fce7f3", text: "#9d174d", dot: "#ec4899" },
  painelfoda: { bg: "#fecaca", text: "#991b1b", dot: "#ef4444" },
  rush: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
};

// ========================================
// COPY HOOK
// ========================================
// ========================================
// COPY HELPER (funciona em HTTP e HTTPS)
// ========================================
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback para HTTP
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text) => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return { copied, copy };
}

// ========================================
// TOAST
// ========================================
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "border-emerald-400 bg-emerald-950/80 text-emerald-200",
    error: "border-red-400 bg-red-950/80 text-red-200",
    info: "border-sky-400 bg-sky-950/80 text-sky-200",
  };

  return (
    <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg border ${colors[type]} backdrop-blur-sm shadow-2xl`}
      style={{ animation: "slideIn 0.3s ease" }}>
      {message}
    </div>
  );
}

// ========================================
// AUTH SCREEN
// ========================================
function AuthScreen({ onAuth }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    const res = await api.login({ email: form.email, password: form.password });
    
    setLoading(false);
    
    if (res.success) {
      api.setToken(res.token);
      onAuth();
    } else {
      setError(res.error || "Erro desconhecido");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #111827 50%, #0f172a 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/80 border border-gray-700/50 mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-300 text-xs font-medium tracking-wide uppercase">IPTV Renewal API</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bem-vindo</h1>
          <p className="text-gray-500 text-sm mt-2">Faça login para acessar seu painel</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required
                className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm" 
                placeholder="seu@email.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Senha</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6}
                className="w-full px-4 py-3 bg-black/40 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm" 
                placeholder="••••••••" />
            </div>
            
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-50 transition-all mt-2">
              {loading ? "Aguarde..." : "Entrar"}
            </button>
          </form>
          
          <p className="mt-6 text-center text-xs text-gray-600">
            Conta criada pelo administrador do sistema
          </p>
        </div>
      </div>
    </div>
  );
}

// ========================================
// STAT CARD
// ========================================
function StatCard({ label, value, sub, icon: Icon, color = "emerald" }) {
  const colorMap = {
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    sky: "from-sky-500/10 to-sky-500/5 border-sky-500/20",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
    red: "from-red-500/10 to-red-500/5 border-red-500/20",
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        {Icon && <Icon />}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ========================================
// PAGE: OVERVIEW
// ========================================
function OverviewPage() {
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.profile(), api.summary()]).then(([p, s]) => {
      if (p.success) setProfile(p);
      if (s.success) setSummary(s);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;

  const stats = profile?.stats || {};
  const totals = summary?.totals || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Visão Geral</h2>
        <p className="text-gray-500 text-sm mt-1">Resumo do mês atual</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Saldo" value={`R$ ${(profile?.user?.balance || 0).toFixed(2)}`} icon={Icons.Wallet} color="emerald" />
        <StatCard label="Renovações (mês)" value={totals.requests || 0} sub={`${totals.success_rate || '0%'} de sucesso`} icon={Icons.Chart} color="sky" />
        <StatCard label="Gasto (mês)" value={`R$ ${(totals.total_cost || 0).toFixed(2)}`} icon={Icons.Dollar} color="amber" />
        <StatCard label="Tempo médio" value={`${totals.avg_response_time_ms || 0}ms`} icon={Icons.Server} color="sky" />
      </div>

      {summary?.by_provider?.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Uso por Provedor</h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {summary.by_provider.map((p) => {
              const c = providerColors[p.provider] || providerColors.sigma;
              const rate = p.total > 0 ? ((p.success / p.total) * 100).toFixed(0) : 0;
              return (
                <div key={p.provider} className="px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.dot }} />
                    <span className="text-sm text-white font-medium capitalize">{p.provider}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{p.total} req</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="text-emerald-400">{p.success} ok</span>
                    {p.failed > 0 && <span className="text-red-400">{p.failed} err</span>}
                    <span>R$ {p.cost.toFixed(2)}</span>
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// PAGE: API KEYS
// ========================================
function ApiKeysPage({ toast }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const copyKey = (text, id) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const load = useCallback(async () => {
    const res = await api.listKeys();
    if (res.success) setKeys(res.api_keys);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    const res = await api.createKey({ name: newKeyName || "unnamed" });
    setCreating(false);
    if (res.success) {
      setNewKeyName("");
      load();
      toast("API Key criada!", "success");
    } else {
      toast(res.error, "error");
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm("Revogar esta API Key? Ela parará de funcionar imediatamente.")) return;
    const res = await api.revokeKey(id);
    if (res.success) { load(); toast("API Key revogada", "info"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">API Keys</h2>
          <p className="text-gray-500 text-sm mt-1">Gerencie suas chaves de acesso · Sem limite de keys</p>
        </div>
      </div>

      {/* Criar key */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Nome da key (opcional)</label>
            <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="ex: meu-gestor-prod"
              className="w-full px-4 py-2.5 bg-black/40 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 text-sm" />
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="px-5 py-2.5 rounded-lg bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 disabled:opacity-50 transition-all flex items-center gap-2 shrink-0">
            <Icons.Plus /> {creating ? "Criando..." : "Criar Key"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma API Key encontrada</div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {keys.map(k => (
              <div key={k.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{k.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${k.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {k.is_active ? "ativa" : "revogada"}
                    </span>
                  </div>
                  {k.is_active && (
                    <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all">
                      Revogar
                    </button>
                  )}
                </div>
                {/* Full key always visible */}
                {k.full_key ? (
                  <div className="bg-black/40 rounded-lg px-3 py-2 flex items-center gap-2">
                    <code className="text-xs text-amber-400/90 font-mono break-all flex-1 select-all">{k.full_key}</code>
                    <button onClick={() => copyKey(k.full_key, k.id)}
                      className="shrink-0 px-2.5 py-1 rounded-md bg-gray-800 text-gray-400 text-xs hover:bg-gray-700 hover:text-white transition-all flex items-center gap-1">
                      {copiedId === k.id ? <><Icons.Check /> Copiada</> : <><Icons.Copy /> Copiar</>}
                    </button>
                  </div>
                ) : (
                  <code className="text-xs text-gray-500 font-mono">{k.key_prefix}... (key antiga, não recuperável)</code>
                )}
                <div className="text-xs text-gray-600 mt-2">
                  Criada: {new Date(k.created_at).toLocaleDateString("pt-BR")}
                  {k.last_used_at && <> · Último uso: {new Date(k.last_used_at).toLocaleDateString("pt-BR")}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// PAGE: CREDITS
// ========================================
function CreditsPage({ toast }) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [addAmount, setAddAmount] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([api.balance(), api.transactions()]);
    if (b.success) setBalance(b.balance);
    if (t.success) setTransactions(t.transactions);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const amount = parseFloat(addAmount);
    if (!amount || amount < 10) { toast("Mínimo R$ 10,00", "error"); return; }
    const res = await api.addCredits({ amount });
    if (res.success) {
      toast(`R$ ${amount.toFixed(2)} adicionados!`, "success");
      setAddAmount("");
      load();
    } else {
      toast(res.error, "error");
    }
  };

  const typeLabels = { purchase: "Compra", usage: "Uso", refund: "Reembolso", bonus: "Bônus" };
  const typeColors = {
    purchase: "text-emerald-400",
    usage: "text-amber-400",
    refund: "text-sky-400",
    bonus: "text-purple-400"
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Créditos</h2>
        <p className="text-gray-500 text-sm mt-1">Gerencie seu saldo pré-pago</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Saldo atual</span>
          <div className="text-3xl font-bold text-white mt-2">R$ {balance.toFixed(2)}</div>
        </div>

        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Adicionar créditos</label>
          <div className="flex gap-3">
            <div className="flex-1 flex items-center bg-black/40 border border-gray-700 rounded-lg px-4">
              <span className="text-gray-500 text-sm mr-2">R$</span>
              <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="50.00" min="10" step="5"
                className="w-full py-2.5 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm" />
            </div>
            <button onClick={handleAdd} className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 transition-all shrink-0">
              Adicionar
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setAddAmount(v.toString())}
                className="px-3 py-1 rounded-md bg-gray-800 text-gray-400 text-xs hover:bg-gray-700 hover:text-white transition-all">
                R$ {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Extrato */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Extrato</h3>
          <button onClick={load} className="text-gray-500 hover:text-white transition-colors"><Icons.Refresh /></button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma transação</div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
            {transactions.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className={`text-xs font-medium ${typeColors[t.type]}`}>{typeLabels[t.type]}</span>
                  <p className="text-sm text-gray-400 mt-0.5">{t.description}</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-mono font-semibold ${t.amount >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {t.amount >= 0 ? '+' : ''}{parseFloat(t.amount).toFixed(2)}
                  </span>
                  <div className="text-xs text-gray-600">{new Date(t.created_at).toLocaleString("pt-BR")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// PAGE: HISTORY
// ========================================
function HistoryPage() {
  const [renewals, setRenewals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter ? `&provider=${filter}` : "";
    const res = await api.history(q);
    if (res.success) {
      setRenewals(res.renewals);
      setStats(res.stats || null);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const at = stats?.all_time || {};
  const tm = stats?.this_month || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Histórico de Renovações</h2>
          <p className="text-gray-500 text-sm mt-1">{filter ? `Filtro: ${filter}` : "Todas as renovações"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!filter ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Todos</button>
          {Object.keys(providerColors).map(p => (
            <button key={p} onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${filter === p ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Este Mês</span>
            <div className="text-2xl font-bold text-white mt-1">{tm.total || 0}</div>
            <span className="text-xs text-emerald-400">{tm.success || 0} com sucesso</span>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Gasto Mês</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">R$ {(tm.total_cost || 0).toFixed(2)}</div>
            <span className="text-xs text-gray-500">{tm.total_telas || 0} tela(s)</span>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Total Geral</span>
            <div className="text-2xl font-bold text-white mt-1">{at.total || 0}</div>
            <span className="text-xs text-gray-500">Taxa: {at.success_rate || '0%'}</span>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Gasto Total</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">R$ {(at.total_cost || 0).toFixed(2)}</div>
            <span className="text-xs text-gray-500">Média: {at.avg_response_time_ms || 0}ms</span>
          </div>
        </div>
      )}

      {/* Ranking por Usuário */}
      {stats?.by_user?.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Renovações por Usuário</h3>
            <span className="text-xs text-gray-500">{stats.by_user.length} usuário(s)</span>
          </div>
          <div className="divide-y divide-gray-800/50">
            {stats.by_user.map((u, i) => (
              <div key={u.email} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-600 w-5">{i + 1}.</span>
                  <span className="text-xs text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">{u.email}</span>
                </div>
                <div className="flex items-center gap-5 text-xs">
                  <div className="text-right">
                    <span className="text-emerald-400 font-semibold">{u.success}</span>
                    <span className="text-gray-600"> ok</span>
                  </div>
                  {u.failed > 0 && (
                    <div className="text-right">
                      <span className="text-red-400">{u.failed}</span>
                      <span className="text-gray-600"> falha</span>
                    </div>
                  )}
                  <span className="text-amber-400 font-mono w-20 text-right">R$ {u.cost.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : renewals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma renovação encontrada</div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
            {renewals.map(r => {
              const c = providerColors[r.provider] || providerColors.sigma;
              return (
                <div key={r.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${r.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize font-medium" style={{ background: c.bg, color: c.text }}>{r.provider}</span>
                    <span className="text-sm text-gray-300">{r.telas} tela(s) · {r.billing_mode === 'per_tela' ? `${r.telas}x` : '1x'}</span>
                    {r.user_email && (
                      <span className="text-xs text-sky-400/80 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">{r.user_email}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {r.cost > 0 && <span className="text-amber-400">-R$ {parseFloat(r.cost).toFixed(2)}</span>}
                    {r.cost == 0 && r.status === 'failed' && <span className="text-gray-500">reembolsado</span>}
                    <span className="text-gray-600">{r.response_time_ms}ms</span>
                    <span className="text-gray-600 w-28 text-right">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
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

// ========================================
// PAGE: PROVIDERS
// ========================================
function ProvidersPage() {
  const [pricing, setPricing] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.pricing().then(res => {
      if (res.success) setPricing(res.providers);
      setLoading(false);
    });
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    const res = await api.status();
    if (res.success) setStatuses(res.services);
    setChecking(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Provedores</h2>
          <p className="text-gray-500 text-sm mt-1">Preços e status dos serviços</p>
        </div>
        <button onClick={checkStatus} disabled={checking}
          className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 transition-all flex items-center gap-2 disabled:opacity-50">
          <Icons.Refresh /> {checking ? "Verificando..." : "Checar status"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pricing.map(p => {
          const c = providerColors[p.provider] || providerColors.sigma;
          const st = statuses[p.provider];
          return (
            <div key={p.provider} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: c.dot }} />
                  <span className="font-semibold text-white">{p.display_name}</span>
                </div>
                {st && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {st.status}
                  </span>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cobrança</span>
                  <span className="text-gray-300">{p.billing_mode === 'per_tela' ? 'Por tela' : 'Por operação'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Preço</span>
                  <span className="text-white font-semibold">
                    R$ {p.billing_mode === 'per_tela' ? parseFloat(p.cost_per_tela).toFixed(2) : parseFloat(p.cost_per_operation).toFixed(2)}
                    <span className="text-gray-500 font-normal text-xs"> /{p.billing_mode === 'per_tela' ? 'tela' : 'op'}</span>
                  </span>
                </div>
                {p.has_keeper && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Keeper</span>
                    <span className="text-emerald-400 text-xs">24h ativo</span>
                  </div>
                )}
                {p.requires_captcha && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Captcha</span>
                    <span className="text-amber-400 text-xs">{p.requires_captcha}</span>
                  </div>
                )}
                {p.requires_proxy && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Proxy</span>
                    <span className="text-red-400 text-xs">Residencial BR</span>
                  </div>
                )}
              </div>

              {p.description && (
                <p className="text-xs text-gray-600 mt-4 leading-relaxed">{p.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========================================
// SIGMA PACKAGES PAGE
// ========================================
function SigmaPackagesPage({ toast }) {
  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [packages, setPackages] = useState([]);
  const [serversCount, setServersCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { copied, copy } = useCopy();
  const [copiedId, setCopiedId] = useState(null);

  const copyPkgId = (id) => {
    copyToClipboard(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSearch = async () => {
    if (!domain || !username || !password) {
      toast("Preencha todos os campos", "error");
      return;
    }

    setLoading(true);
    setPackages([]);
    setSearched(false);

    try {
      const res = await api.sigmaPackages({
        credentials: { username, password },
        sigma_domain: domain.startsWith("http") ? domain : `https://${domain}`
      });

      if (res.success) {
        setPackages(res.packages || []);
        setServersCount(res.servers_count || 0);
        setSearched(true);
        toast(`${res.packages_count} pacotes encontrados!`, "success");
      } else {
        toast(res.error || "Erro ao buscar pacotes", "error");
        setSearched(true);
      }
    } catch (error) {
      toast("Erro de conexão com a API", "error");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Pacotes Sigma</h2>
        <p className="text-gray-500 text-sm mt-1">Descubra o ID dos pacotes de qualquer domínio Sigma</p>
      </div>

      {/* Formulário */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Domínio Sigma</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="painel.exemplo.com"
              className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-amber-500/50 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Usuário (Revendedor)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seu_usuario"
              className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-amber-500/50 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm placeholder:text-gray-600 focus:border-amber-500/50 focus:outline-none transition-all"
            />
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Buscando pacotes...
            </>
          ) : (
            <>
              <Icons.Package /> Buscar Pacotes
            </>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-700 border-t-amber-500 mb-4" />
          <p className="text-gray-400 text-sm">Fazendo login e carregando pacotes...</p>
          <p className="text-gray-600 text-xs mt-1">Isso pode levar alguns segundos</p>
        </div>
      )}

      {/* Resultado */}
      {searched && !loading && packages.length === 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400">Nenhum pacote encontrado</p>
          <p className="text-gray-600 text-xs mt-1">Verifique domínio e credenciais</p>
        </div>
      )}

      {packages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">
              <span className="text-white font-semibold">{packages.length}</span> pacotes em{" "}
              <span className="text-white font-semibold">{serversCount}</span> servidores
            </p>
            <p className="text-xs text-gray-600">Clique no ID para copiar</p>
          </div>

          <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Package ID</th>
                  <th className="text-left text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Nome</th>
                  <th className="text-left text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Servidor</th>
                  <th className="text-center text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Duração</th>
                  <th className="text-center text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Telas</th>
                  <th className="text-center text-gray-500 font-medium px-4 py-3 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg, idx) => (
                  <tr key={pkg.id + '-' + idx} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyPkgId(pkg.id)}
                        className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-mono text-xs bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1 hover:bg-amber-500/10 transition-all"
                        title="Copiar ID"
                      >
                        {copiedId === pkg.id ? <Icons.Check /> : <Icons.Copy />}
                        {pkg.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-white">{pkg.name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{pkg.server_name}</td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {pkg.duration} {pkg.duration_type === 'MONTHS' ? (pkg.duration === 1 ? 'mês' : 'meses') : pkg.duration_type === 'DAYS' ? (pkg.duration === 1 ? 'dia' : 'dias') : pkg.duration_type}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{pkg.connections}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        pkg.status === 'ACTIVE' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                      }`}>
                        {pkg.status}
                      </span>
                      {pkg.is_trial === 'YES' && (
                        <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Trial</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dica de uso */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <p className="text-amber-400 text-sm font-medium mb-1">💡 Como usar</p>
        <p className="text-gray-400 text-xs leading-relaxed">
          Copie o <strong className="text-amber-400">Package ID</strong> e use no campo{" "}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded text-amber-300">sigma_plan_code</code>{" "}
          ao fazer uma renovação via API. Exemplo:
        </p>
        <pre className="mt-2 text-xs text-gray-400 bg-gray-900/80 rounded-lg p-3 overflow-x-auto">
{`curl -X POST /api/v1/renew \\
  -H "X-API-Key: sua_api_key" \\
  -d '{
    "provider": "sigma",
    "sigma_domain": "${domain || 'painel.exemplo.com'}",
    "sigma_plan_code": "${packages[0]?.id || 'PACKAGE_ID'}",
    "credentials": { "username": "...", "password": "..." },
    "client_name": "Nome do Cliente",
    "months": 1
  }'`}
        </pre>
      </div>
    </div>
  );
}

// ========================================
// MAIN APP
// ========================================
export default function App() {
  const [authed, setAuthed] = useState(!!api.getToken());
  const [page, setPage] = useState("overview");
  const [toastData, setToastData] = useState(null);
  const [userName, setUserName] = useState("");

  const toast = (message, type = "info") => setToastData({ message, type, key: Date.now() });

  useEffect(() => {
    if (authed) {
      api.profile().then(res => {
        if (res.success) setUserName(res.user.name);
        else { api.clearToken(); setAuthed(false); }
      });
    }
  }, [authed]);

  const logout = () => { api.clearToken(); setAuthed(false); };

  if (!authed) return <AuthScreen onAuth={() => setAuthed(true)} />;

  const nav = [
    { id: "overview", label: "Visão Geral", icon: Icons.Chart },
    { id: "keys", label: "API Keys", icon: Icons.Key },
    { id: "credits", label: "Créditos", icon: Icons.Wallet },
    { id: "history", label: "Renovações", icon: Icons.List },
    { id: "providers", label: "Provedores", icon: Icons.Server },
    { id: "sigma-packages", label: "Pacotes Sigma", icon: Icons.Package },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(180deg, #0a0f1e 0%, #111827 100%)" }}>
      {toastData && <Toast {...toastData} onClose={() => setToastData(null)} />}

      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-gray-800/50 p-6 flex flex-col">
        <div className="mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">IPTV Renewal</h1>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">API Dashboard</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                page === n.id 
                  ? 'bg-white/10 text-white' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}>
              <n.icon />
              {n.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-gray-800/50 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
              <Icons.User />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{userName}</p>
            </div>
          </div>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
            <Icons.Logout /> Sair
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {page === "overview" && <OverviewPage />}
          {page === "keys" && <ApiKeysPage toast={toast} />}
          {page === "credits" && <CreditsPage toast={toast} />}
          {page === "history" && <HistoryPage />}
          {page === "providers" && <ProvidersPage />}
          {page === "sigma-packages" && <SigmaPackagesPage toast={toast} />}
        </div>
      </main>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      `}</style>
    </div>
  );
}
