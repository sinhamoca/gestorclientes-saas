import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { GW_CFG } from '@/lib/utils'
import { PageHeader, PageLoader, Modal, Spinner } from '@/components/ui'
import { Plug, Plus, Star, AlertCircle, Zap, CreditCard, CheckCircle2, XCircle, Copy, QrCode } from 'lucide-react'
import type { GatewayConfig, GatewayType } from '@/types'
import toast from 'react-hot-toast'

const GW_FIELDS: Record<string, { fields: { key: string; label: string; placeholder: string; secret?: boolean }[] }> = {
  MERCADO_PAGO: { fields: [{ key: 'accessToken', label: 'Access Token', placeholder: 'APP_USR-xxxx...', secret: true }] },
  ASAAS: { fields: [{ key: 'apiKey', label: 'API Key', placeholder: '$aact_xxxx...', secret: true }, { key: 'sandbox', label: 'Sandbox? (true/false)', placeholder: 'false' }] },
  STRIPE: { fields: [{ key: 'secretKey', label: 'Secret Key', placeholder: 'sk_live_xxxx...', secret: true }, { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_live_xxxx...' }] },
  PICPAY: { fields: [{ key: 'xPicpayToken', label: 'X-PicPay-Token', placeholder: 'xxxx...', secret: true }] },
}

interface TestResult {
  success: boolean
  gateway: string
  message: string
  details?: Record<string, any>
  payment?: {
    id: string; status: string; amount: string
    pixCopiaECola?: string | null; pixQrCode?: string | null; expiresAt?: string | null
  }
}

export default function GatewaysPage() {
  const [configured, setConfigured] = useState<GatewayConfig[]>([])
  const [available, setAvailable] = useState<GatewayType[]>([])
  const [loading, setLoading] = useState(true)

  // Config modal
  const [modal, setModal] = useState(false)
  const [selGw, setSelGw] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [primary, setPrimary] = useState(false)
  const [saving, setSaving] = useState(false)

  // Test modal
  const [testModal, setTestModal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testType, setTestType] = useState<'connection' | 'payment'>('connection')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState('')
  const [testGwId, setTestGwId] = useState('')
  const [testGwName, setTestGwName] = useState('')

  const load = async () => {
    try { const { data } = await userApi.getGateways(); setConfigured(data.data.configured || []); setAvailable(data.data.available || []) }
    catch { setAvailable(['MERCADO_PAGO', 'ASAAS', 'STRIPE', 'PICPAY']) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const open = (gw?: string) => { setSelGw(gw || ''); setCreds({}); setPrimary(configured.length === 0); setModal(true) }

  const save = async () => {
    if (!selGw) return; setSaving(true)
    try { await userApi.configGateway({ gateway: selGw, credentials: creds, isPrimary: primary }); toast.success('Gateway salvo!'); setModal(false); load() }
    catch (e: any) { toast.error(e.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  // ── Test Functions ──
  const openTest = (id: string, gateway: GatewayType, type: 'connection' | 'payment') => {
    setTestGwId(id)
    setTestGwName(GW_CFG[gateway]?.label || gateway)
    setTestType(type)
    setTestResult(null)
    setTestError('')
    setTesting(true)
    setTestModal(true)
    runTest(id, type)
  }

  const runTest = async (id: string, type: 'connection' | 'payment') => {
    setTesting(true); setTestResult(null); setTestError('')
    try {
      const { data } = type === 'connection'
        ? await userApi.testGateway(id)
        : await userApi.testPayment(id)
      setTestResult(data.data)
    } catch (e: any) {
      setTestError(e.response?.data?.message || 'Erro ao testar')
    } finally {
      setTesting(false)
    }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copiado!') }

  if (loading) return <PageLoader />

  const uncfg = available.filter(g => !configured.find(c => c.gateway === g))

  return <>
    <PageHeader title="Gateways" desc="Configure seus gateways de pagamento"
      actions={<button onClick={() => open()} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Adicionar</button>} />

    {/* ── Configured Gateways ── */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {configured.map((c, i) => { const g = GW_CFG[c.gateway]; return (
        <div key={c.id} className="card group hover:border-surface-400/60 transition-all animate-in" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${g.color}15` }}><Plug className="w-5 h-5" style={{ color: g.color }} /></div>
              <div><h3 className="text-sm font-semibold text-surface-800">{g.label}</h3><p className="text-[11px] text-surface-500">{c.isActive ? 'Ativo' : 'Inativo'}</p></div>
            </div>
            {c.isPrimary && <span className="badge bg-amber-400/10 text-amber-400 border border-amber-400/20"><Star className="w-3 h-3" />Primário</span>}
          </div>
          <div className="flex items-center gap-2 mb-4"><span className={`w-2 h-2 rounded-full ${c.isActive ? 'bg-emerald-400' : 'bg-surface-500'}`} /><span className="text-[11px] text-surface-500">Credenciais configuradas</span></div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-3 border-t border-surface-300/30">
            <button onClick={() => open(c.gateway)}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-surface-600 hover:text-surface-800 hover:bg-surface-200/60 border border-surface-300/40 transition-all">
              Editar
            </button>
            <button onClick={() => openTest(c.id, c.gateway, 'connection')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-400/5 hover:bg-blue-400/10 border border-blue-400/20 transition-all flex items-center justify-center gap-1.5">
              <Zap className="w-3 h-3" />Testar
            </button>
            <button onClick={() => openTest(c.id, c.gateway, 'payment')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-400/5 hover:bg-emerald-400/10 border border-emerald-400/20 transition-all flex items-center justify-center gap-1.5">
              <CreditCard className="w-3 h-3" />PIX Teste
            </button>
          </div>
        </div>
      )})}
      {uncfg.map(gw => { const g = GW_CFG[gw]; return (
        <button key={gw} onClick={() => open(gw)} className="card border-dashed border-surface-300/60 hover:border-brand-500/40 hover:bg-surface-200/30 transition-all group text-left">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-surface-200/60 flex items-center justify-center group-hover:bg-brand-500/10 transition-all"><Plus className="w-5 h-5 text-surface-500 group-hover:text-brand-400" /></div>
            <div><h3 className="text-sm font-medium text-surface-600 group-hover:text-surface-800">{g.label}</h3><p className="text-[11px] text-surface-500">Não configurado</p></div></div>
        </button>
      )})}
    </div>

    <div className="card bg-surface-100/40 border-surface-300/30 flex items-start gap-3">
      <AlertCircle className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
      <div className="text-xs text-surface-500 space-y-1">
        <p>Credenciais encriptadas com AES-256. O gateway <strong className="text-surface-700">Primário</strong> é usado quando nenhum é especificado na API.</p>
        <p><strong className="text-blue-400">Testar</strong> valida se as credenciais estão corretas. <strong className="text-emerald-400">PIX Teste</strong> gera um pagamento real de R$ 1,00 para verificar a integração completa.</p>
      </div>
    </div>

    {/* ── Configure Modal ── */}
    <Modal open={modal} onClose={() => setModal(false)} title={`Configurar ${selGw ? GW_CFG[selGw as GatewayType]?.label || selGw : 'Gateway'}`}>
      <div className="space-y-4">
        {!selGw && <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Gateway</label>
          <select value={selGw} onChange={e => { setSelGw(e.target.value); setCreds({}) }} className="input-base">
            <option value="">Selecione...</option>{available.map(g => <option key={g} value={g}>{GW_CFG[g].label}</option>)}
          </select></div>}
        {selGw && GW_FIELDS[selGw]?.fields.map(f => <div key={f.key}><label className="block text-xs font-medium text-surface-600 mb-1.5">{f.label}</label>
          <input type={f.secret ? 'password' : 'text'} value={creds[f.key] || ''} onChange={e => setCreds({ ...creds, [f.key]: e.target.value })} placeholder={f.placeholder} className="input-base font-mono text-xs" /></div>)}
        <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer"><input type="checkbox" checked={primary} onChange={e => setPrimary(e.target.checked)} className="rounded" />Gateway primário</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(false)} className="btn-ghost">Cancelar</button><button onClick={save} disabled={saving || !selGw} className="btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button></div>
      </div>
    </Modal>

    {/* ── Test Modal ── */}
    <Modal open={testModal} onClose={() => setTestModal(false)} title={testType === 'connection' ? `Testar Conexão — ${testGwName}` : `Pagamento de Teste — ${testGwName}`} wide>
      <div className="space-y-4">

        {/* Loading */}
        {testing && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Spinner />
            <p className="text-sm text-surface-500">
              {testType === 'connection' ? 'Validando credenciais...' : 'Gerando pagamento PIX de teste...'}
            </p>
          </div>
        )}

        {/* Error */}
        {!testing && testError && (
          <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-red-400 mb-1">Falha no teste</h3>
                <p className="text-sm text-surface-600">{testError}</p>
              </div>
            </div>
            <button onClick={() => runTest(testGwId, testType)} className="btn-ghost mt-4 text-xs">Tentar novamente</button>
          </div>
        )}

        {/* Success - Connection */}
        {!testing && testResult && testType === 'connection' && (
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-emerald-400 mb-1">{testResult.message}</h3>

                {testResult.details?.totalMethods != null && (
                  <p className="text-xs text-surface-600 mb-2">{testResult.details.totalMethods} métodos de pagamento encontrados</p>
                )}
                {testResult.details?.activeMethods?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {testResult.details.activeMethods.map((m: string) => (
                      <span key={m} className="badge bg-surface-200/60 text-surface-600 border border-surface-300/40">{m}</span>
                    ))}
                  </div>
                )}
                {testResult.details?.environment && (
                  <p className="text-xs text-surface-600 mt-1">
                    Ambiente: <strong className="text-surface-800">{testResult.details.environment}</strong>
                    {testResult.details.balance != null && <> · Saldo: <strong className="text-surface-800">R$ {Number(testResult.details.balance).toFixed(2).replace('.', ',')}</strong></>}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success - Payment */}
        {!testing && testResult && testType === 'payment' && testResult.payment && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-1">{testResult.message}</h3>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">ID</span>
                      <p className="text-xs text-surface-800 font-mono mt-0.5">{testResult.payment.id}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">Status</span>
                      <p className="text-xs text-surface-800 font-medium mt-0.5">{testResult.payment.status}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">Valor</span>
                      <p className="text-xs text-surface-800 font-semibold mt-0.5">{testResult.payment.amount}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code */}
            {testResult.payment.pixQrCode && (
              <div className="flex flex-col items-center gap-3 py-3">
                <div className="flex items-center gap-2 text-sm text-surface-600"><QrCode className="w-4 h-4" />QR Code PIX</div>
                <img src={`data:image/png;base64,${testResult.payment.pixQrCode}`} alt="QR Code PIX" className="w-48 h-48 rounded-xl border border-surface-300/40 bg-white p-2" />
              </div>
            )}

            {/* Copia e Cola */}
            {testResult.payment.pixCopiaECola && (
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">PIX Copia e Cola</label>
                <div className="flex gap-2">
                  <input value={testResult.payment.pixCopiaECola} readOnly className="input-base font-mono text-xs flex-1" />
                  <button onClick={() => copy(testResult.payment!.pixCopiaECola!)} className="btn-ghost p-2.5 flex-shrink-0"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-amber-400/5 border border-amber-400/20 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-surface-500">Este é um pagamento <strong className="text-amber-400">real</strong> (R$ 1,00 no MP / R$ 5,00 no Asaas). Se pago, será processado normalmente pelo gateway.</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  </>
}
