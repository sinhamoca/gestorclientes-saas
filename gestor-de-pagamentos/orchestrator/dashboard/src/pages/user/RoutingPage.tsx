import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { METHOD_CFG, GW_CFG, cn } from '@/lib/utils'
import { PageHeader, PageLoader, GatewayBadge } from '@/components/ui'
import { Route, Save, CheckCircle2, ArrowRight, AlertCircle, Shuffle } from 'lucide-react'
import type { PaymentMethod, GatewayType } from '@/types'
import toast from 'react-hot-toast'

interface RoutingData {
  method: PaymentMethod
  gatewayConfigId: string | null
  gateway: GatewayType | null
  source: 'routing' | 'primary'
  effectiveGateway: GatewayType | null
}

interface GwOption {
  id: string
  gateway: GatewayType
  isPrimary: boolean
}

export default function RoutingPage() {
  const [routings, setRoutings] = useState<RoutingData[]>([])
  const [gateways, setGateways] = useState<GwOption[]>([])
  const [primaryGw, setPrimaryGw] = useState<GwOption | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Local state for edits
  const [localRoutes, setLocalRoutes] = useState<Record<string, string | null>>({})

  const load = async () => {
    try {
      const { data } = await userApi.getRouting()
      const d = data.data
      setRoutings(d.routings || [])
      setGateways(d.configuredGateways || [])
      setPrimaryGw(d.primaryGateway || null)

      // Initialize local state
      const initial: Record<string, string | null> = {}
      for (const r of d.routings || []) {
        initial[r.method] = r.gatewayConfigId
      }
      setLocalRoutes(initial)
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const setRoute = (method: string, gatewayConfigId: string | null) => {
    setLocalRoutes(prev => ({ ...prev, [method]: gatewayConfigId }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const routes = Object.entries(localRoutes).map(([method, gatewayConfigId]) => ({
        method,
        gatewayConfigId: gatewayConfigId || null,
      }))
      await userApi.saveRouting(routes)
      toast.success('Roteamento salvo!')
      setDirty(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />

  if (gateways.length < 2) {
    return <>
      <PageHeader title="Roteamento" desc="Defina qual gateway processa cada método de pagamento" />
      <div className="card flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-surface-800 mb-1">Você precisa de pelo menos 2 gateways configurados</h3>
          <p className="text-xs text-surface-500">
            O roteamento permite direcionar cada método de pagamento para um gateway diferente.
            Configure pelo menos dois gateways na página <a href="/gateways" className="text-brand-400 hover:underline">Gateways</a> para usar esta funcionalidade.
          </p>
          {gateways.length === 1 && (
            <p className="text-xs text-surface-600 mt-2">
              Atualmente você tem apenas o <strong>{GW_CFG[gateways[0].gateway]?.label}</strong> configurado.
              Todos os pagamentos serão processados por ele.
            </p>
          )}
        </div>
      </div>
    </>
  }

  const methods: PaymentMethod[] = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO']

  return <>
    <PageHeader title="Roteamento" desc="Defina qual gateway processa cada método de pagamento"
      actions={
        <button onClick={save} disabled={saving || !dirty}
          className={cn('flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-all',
            dirty
              ? 'btn-primary'
              : 'bg-surface-200/60 text-surface-500 cursor-not-allowed')}>
          {saving ? 'Salvando...' : <><Save className="w-4 h-4" />Salvar Roteamento</>}
        </button>
      } />

    {/* Routing cards */}
    <div className="space-y-3 mb-6">
      {methods.map((method, i) => {
        const cfg = METHOD_CFG[method]
        const selectedId = localRoutes[method]
        const selectedGw = gateways.find(g => g.id === selectedId)
        const effectiveGw = selectedGw || primaryGw
        const isCustom = !!selectedId

        return (
          <div key={method}
            className="card animate-in flex flex-col sm:flex-row sm:items-center gap-4"
            style={{ animationDelay: `${i * 60}ms` }}>

            {/* Method */}
            <div className="flex items-center gap-3 sm:w-48 flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-surface-200/60 flex items-center justify-center text-lg">
                {cfg.icon}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">{cfg.label}</h3>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">{method}</p>
              </div>
            </div>

            {/* Arrow */}
            <ArrowRight className="w-4 h-4 text-surface-400 hidden sm:block flex-shrink-0" />

            {/* Gateway selector */}
            <div className="flex-1 flex flex-wrap items-center gap-2">
              {/* "Primário" option */}
              <button
                onClick={() => setRoute(method, null)}
                className={cn(
                  'px-3.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2',
                  !selectedId
                    ? 'bg-brand-600/10 border-brand-500/30 text-brand-400'
                    : 'border-surface-300/40 text-surface-600 hover:bg-surface-200/60'
                )}>
                {primaryGw ? (
                  <>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GW_CFG[primaryGw.gateway]?.color }} />
                    {GW_CFG[primaryGw.gateway]?.label}
                    <span className="text-[10px] text-surface-500">(primário)</span>
                  </>
                ) : 'Primário'}
              </button>

              {/* Each configured gateway */}
              {gateways.filter(g => !g.isPrimary).map(gw => {
                const gwCfg = GW_CFG[gw.gateway]
                const isSelected = selectedId === gw.id
                return (
                  <button key={gw.id}
                    onClick={() => setRoute(method, gw.id)}
                    className={cn(
                      'px-3.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2',
                      isSelected
                        ? 'border-brand-500/30 text-brand-400'
                        : 'border-surface-300/40 text-surface-600 hover:bg-surface-200/60'
                    )}
                    style={isSelected ? { backgroundColor: `${gwCfg.color}10` } : {}}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: gwCfg.color }} />
                    {gwCfg.label}
                  </button>
                )
              })}

              {/* Also show primary in the list if it's not already there */}
              {gateways.filter(g => g.isPrimary).map(gw => {
                const gwCfg = GW_CFG[gw.gateway]
                const isSelected = selectedId === gw.id
                if (!selectedId) return null // Already selected via "Primário" button
                return (
                  <button key={gw.id}
                    onClick={() => setRoute(method, gw.id)}
                    className={cn(
                      'px-3.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2',
                      isSelected
                        ? 'border-brand-500/30 text-brand-400'
                        : 'border-surface-300/40 text-surface-600 hover:bg-surface-200/60'
                    )}
                    style={isSelected ? { backgroundColor: `${gwCfg.color}10` } : {}}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: gwCfg.color }} />
                    {gwCfg.label}
                  </button>
                )
              })}
            </div>

            {/* Status indicator */}
            <div className="flex-shrink-0 sm:w-28 text-right">
              {isCustom ? (
                <span className="badge bg-blue-400/10 border border-blue-400/20 text-blue-400">
                  <Shuffle className="w-3 h-3" />Personalizado
                </span>
              ) : (
                <span className="badge bg-surface-200/60 border border-surface-300/40 text-surface-500">
                  Padrão
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>

    {/* Summary */}
    <div className="card bg-surface-100/40 border-surface-300/30">
      <h3 className="text-xs font-semibold text-surface-700 mb-3 flex items-center gap-2">
        <Route className="w-3.5 h-3.5" />Resumo do roteamento
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {methods.map(method => {
          const selectedId = localRoutes[method]
          const selectedGw = gateways.find(g => g.id === selectedId)
          const effectiveGw = selectedGw?.gateway || primaryGw?.gateway
          const gwCfg = effectiveGw ? GW_CFG[effectiveGw] : null

          return (
            <div key={method} className="flex items-center gap-2 text-xs">
              <span>{METHOD_CFG[method].icon}</span>
              <span className="text-surface-600">{METHOD_CFG[method].label}</span>
              <span className="text-surface-400">→</span>
              {gwCfg ? (
                <span className="flex items-center gap-1 font-medium" style={{ color: gwCfg.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gwCfg.color }} />
                  {gwCfg.label}
                </span>
              ) : (
                <span className="text-surface-500">Não definido</span>
              )}
            </div>
          )
        })}
      </div>
    </div>

    {/* Info box */}
    <div className="card bg-surface-100/40 border-surface-300/30 mt-4 flex items-start gap-3">
      <AlertCircle className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
      <div className="text-xs text-surface-500 space-y-1">
        <p>O roteamento define qual gateway processa cada tipo de pagamento. Isso permite usar, por exemplo, <strong className="text-surface-700">Mercado Pago para PIX</strong> e <strong className="text-surface-700">Asaas para Cartão de Crédito</strong>.</p>
        <p>Métodos sem rota personalizada usam o <strong className="text-surface-700">gateway primário</strong>. A API também aceita o parâmetro <code className="text-surface-700 bg-surface-200/60 px-1.5 py-0.5 rounded">gateway</code> para forçar um gateway específico por requisição.</p>
      </div>
    </div>
  </>
}
