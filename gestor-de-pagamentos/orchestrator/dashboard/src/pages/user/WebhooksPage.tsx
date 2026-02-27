import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { PageHeader, PageLoader, Table, Th, Td, EmptyState, GatewayBadge } from '@/components/ui'
import { Webhook, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Save, Globe, Lock, Eye, EyeOff } from 'lucide-react'
import type { WebhookLog } from '@/types'
import toast from 'react-hot-toast'

export default function WebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Webhook config
  const [callbackUrl, setCallbackUrl] = useState('')
  const [callbackSecret, setCallbackSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)

  const loadConfig = async () => {
    try {
      const { data } = await userApi.getWebhookConfig()
      setCallbackUrl(data.data.webhookCallbackUrl || '')
      setHasSecret(data.data.hasSecret || false)
    } catch { /* empty */ }
    finally { setConfigLoaded(true) }
  }

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      await userApi.saveWebhookConfig({
        webhookCallbackUrl: callbackUrl || null,
        ...(callbackSecret ? { webhookCallbackSecret: callbackSecret } : {}),
      })
      toast.success('Webhook callback salvo!')
      setCallbackSecret('')
      loadConfig()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erro ao salvar')
    } finally { setSavingConfig(false) }
  }

  const load = async (p = 1) => {
    setLoading(true)
    try {
      const { data } = await userApi.getWebhooks(p)
      setLogs(data.data || [])
      setTotal(data.pagination?.total || 0)
      setPage(data.pagination?.page || 1)
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadConfig(); load() }, [])

  const totalPages = Math.ceil(total / 20)

  return <>
    <PageHeader title="Webhooks" desc="Configuração de callback e logs de webhook" />

    {/* ── Webhook Callback Config ── */}
    {configLoaded && (
      <div className="card mb-6 animate-in">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-surface-800">Webhook de Saída</h3>
          <span className="badge bg-surface-200/60 text-surface-500 border border-surface-300/40 text-[10px]">Notificações</span>
        </div>
        <p className="text-xs text-surface-500 mb-4">
          Configure uma URL para receber notificações quando pagamentos mudarem de status.
          O Orchestrator enviará um POST com os dados do pagamento para esta URL.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Callback URL</label>
            <input
              value={callbackUrl}
              onChange={e => setCallbackUrl(e.target.value)}
              placeholder="https://seu-sistema.com/api/webhook/payment"
              className="input-base font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">
              Secret (HMAC-SHA256) {hasSecret && <span className="text-brand-400">— configurado</span>}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={callbackSecret}
                onChange={e => setCallbackSecret(e.target.value)}
                placeholder={hasSecret ? 'Deixe vazio para manter o atual' : 'Opcional — mín. 8 caracteres'}
                className="input-base font-mono text-xs pr-10"
              />
              <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500">
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-surface-500 mt-1">
              Se configurado, cada webhook terá o header <code className="text-surface-700 bg-surface-200/60 px-1 py-0.5 rounded">X-Webhook-Signature</code> com HMAC-SHA256 do body.
            </p>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-surface-500">
              Payload: <code className="text-surface-700 bg-surface-200/60 px-1 py-0.5 rounded">
                {`{ event, paymentId, externalId, status, method, amount, ... }`}
              </code>
            </div>
            <button onClick={saveConfig} disabled={savingConfig} className="btn-primary text-xs flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" />{savingConfig ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Logs ── */}
    <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
      <Webhook className="w-4 h-4 text-surface-500" />
      Logs ({total})
    </h3>

    {loading && logs.length === 0 ? <PageLoader /> : logs.length === 0 ? (
      <EmptyState icon={<Webhook className="w-6 h-6" />} title="Nenhum webhook" desc="Os logs aparecerão quando os gateways enviarem notificações." />
    ) : (
      <>
        <Table>
          <thead>
            <tr>
              <Th>Gateway</Th>
              <Th>Direção</Th>
              <Th>Status</Th>
              <Th>Payment ID</Th>
              <Th>Erro</Th>
              <Th>Quando</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={l.id} className="hover:bg-surface-200/30 transition-colors animate-in" style={{ animationDelay: `${i * 30}ms` }}>
                <Td><GatewayBadge gateway={l.gateway} /></Td>
                <Td>
                  <span className={`badge border ${l.direction === 'INBOUND' ? 'bg-blue-400/10 border-blue-400/20 text-blue-400' : 'bg-purple-400/10 border-purple-400/20 text-purple-400'}`}>
                    {l.direction === 'INBOUND' ? '← Entrada' : '→ Saída'}
                  </span>
                </Td>
                <Td>
                  {l.success ? (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" />Erro</span>
                  )}
                </Td>
                <Td>
                  {l.paymentId ? (
                    <code className="text-xs font-mono text-surface-600 bg-surface-200/60 px-1.5 py-0.5 rounded">{l.paymentId.slice(0, 12)}...</code>
                  ) : <span className="text-surface-500 text-xs">—</span>}
                </Td>
                <Td>
                  {l.error ? (
                    <span className="text-xs text-red-400/80 truncate max-w-[200px] block" title={l.error}>{l.error}</span>
                  ) : <span className="text-surface-500 text-xs">—</span>}
                </Td>
                <Td><span className="text-xs text-surface-600">{relativeTime(l.createdAt)}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="text-xs text-surface-500">Pág {page}/{totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => load(page - 1)} disabled={page <= 1} className="btn-ghost p-2 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </>
    )}
  </>
}
