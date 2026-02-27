import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { METHOD_CFG } from '@/lib/utils'
import { PageHeader, PageLoader, Table, Th, Td, Modal, EmptyState } from '@/components/ui'
import { Percent, Plus } from 'lucide-react'
import type { FeeRule, PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

export default function FeesPage() {
  const [fees, setFees] = useState<FeeRule[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ method: 'PIX', feeType: 'PERCENTAGE', feeValue: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try { const { data } = await userApi.getFees(); setFees(data.data || []) }
    catch { setFees([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    const val = parseFloat(form.feeValue)
    if (isNaN(val) || val < 0) { toast.error('Valor inválido'); return }
    setSaving(true)
    try {
      await userApi.configFee({ method: form.method, feeType: form.feeType, feeValue: val })
      toast.success('Taxa salva!')
      setModal(false); setForm({ method: 'PIX', feeType: 'PERCENTAGE', feeValue: '' })
      load()
    } catch (e: any) { toast.error(e.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  if (loading) return <PageLoader />

  return <>
    <PageHeader title="Taxas" desc="Configure taxas por método de pagamento"
      actions={<button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Nova Taxa</button>} />

    {fees.length === 0 ? (
      <EmptyState icon={<Percent className="w-6 h-6" />} title="Nenhuma taxa" desc="Configure taxas para cada método de pagamento." />
    ) : (
      <Table>
        <thead><tr><Th>Método</Th><Th>Tipo</Th><Th>Valor</Th><Th>Exemplo (R$ 100)</Th></tr></thead>
        <tbody>
          {fees.map((f, i) => {
            const ex = f.feeType === 'PERCENTAGE' ? (100 * f.feeValue / 100) : f.feeValue / 100
            return (
              <tr key={f.id} className="hover:bg-surface-200/30 transition-colors animate-in" style={{ animationDelay: `${i * 40}ms` }}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span>{METHOD_CFG[f.method]?.icon}</span>
                    <span className="font-medium text-surface-800">{METHOD_CFG[f.method]?.label || f.method}</span>
                  </span>
                </Td>
                <Td>
                  <span className={`badge border ${f.feeType === 'PERCENTAGE' ? 'bg-blue-400/10 border-blue-400/20 text-blue-400' : 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400'}`}>
                    {f.feeType === 'PERCENTAGE' ? 'Porcentagem' : 'Fixo'}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono font-semibold text-surface-900">
                    {f.feeType === 'PERCENTAGE' ? `${f.feeValue}%` : `R$ ${(f.feeValue / 100).toFixed(2).replace('.', ',')}`}
                  </span>
                </Td>
                <Td>
                  <span className="text-surface-600 text-xs">
                    R$ {ex.toFixed(2).replace('.', ',')} de taxa → cliente paga R$ {(100 + ex).toFixed(2).replace('.', ',')}
                  </span>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    )}

    <Modal open={modal} onClose={() => setModal(false)} title="Configurar Taxa">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Método</label>
          <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="input-base">
            {(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO'] as PaymentMethod[]).map(m => (
              <option key={m} value={m}>{METHOD_CFG[m]?.icon} {METHOD_CFG[m]?.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'PERCENTAGE', l: 'Porcentagem (%)' }, { v: 'FIXED', l: 'Fixo (centavos)' }].map(t => (
              <button key={t.v} onClick={() => setForm({ ...form, feeType: t.v })}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${form.feeType === t.v ? 'bg-brand-600/10 border-brand-500/30 text-brand-400' : 'border-surface-300/40 text-surface-600 hover:bg-surface-200/60'}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">
            Valor {form.feeType === 'PERCENTAGE' ? '(ex: 2.5 = 2.5%)' : '(em centavos, ex: 150 = R$ 1,50)'}
          </label>
          <input type="number" step="0.01" value={form.feeValue} onChange={e => setForm({ ...form, feeValue: e.target.value })} className="input-base font-mono" placeholder={form.feeType === 'PERCENTAGE' ? '2.5' : '150'} />
        </div>
        <p className="text-[11px] text-surface-500">Se já existir uma taxa para esse método, ela será substituída.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setModal(false)} className="btn-ghost">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar Taxa'}</button>
        </div>
      </div>
    </Modal>
  </>
}
