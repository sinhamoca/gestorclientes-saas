import { useState, useEffect, useCallback } from 'react'
import { userApi } from '@/lib/api'
import { formatDate, relativeTime, cn } from '@/lib/utils'
import { PageHeader, PageLoader, StatusBadge, MethodBadge, GatewayBadge, Table, Th, Td, EmptyState, Modal } from '@/components/ui'
import { Search, CreditCard, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import type { Payment, Pagination as Pg, PaymentStatus, PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [pag, setPag] = useState<Pg>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('')
  const [methodF, setMethodF] = useState('')
  const [selected, setSelected] = useState<Payment | null>(null)

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const { data } = await userApi.getPayments({ page, limit: 20, ...(search && { search }), ...(statusF && { status: statusF }), ...(methodF && { method: methodF }) })
      setPayments(data.data || []); setPag(data.pagination || { page, limit: 20, total: 0, totalPages: 0 })
    } catch { setPayments([]) }
    finally { setLoading(false) }
  }, [search, statusF, methodF])

  useEffect(() => { load() }, [load])

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copiado!') }

  return <>
    <PageHeader title="Pagamentos" desc={`${pag.total} transações`} />

    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input-base pl-9" />
      </div>
      <select value={statusF} onChange={e => setStatusF(e.target.value)} className="input-base w-auto min-w-[130px]">
        <option value="">Todos Status</option>
        {(['PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED'] as PaymentStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={methodF} onChange={e => setMethodF(e.target.value)} className="input-base w-auto min-w-[130px]">
        <option value="">Todos Métodos</option>
        {(['PIX','CREDIT_CARD','BOLETO'] as PaymentMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {(statusF || methodF || search) && <button onClick={() => { setSearch(''); setStatusF(''); setMethodF('') }} className="text-xs text-brand-400 hover:text-brand-400/80">Limpar</button>}
    </div>

    {loading ? <PageLoader /> : payments.length === 0 ? (
      <EmptyState icon={<CreditCard className="w-6 h-6" />} title="Nenhum pagamento" desc="Os pagamentos aparecerão aqui quando criados via API." />
    ) : <>
      <Table>
        <thead><tr><Th>Pagador</Th><Th>Método</Th><Th>Gateway</Th><Th>Valor</Th><Th>Status</Th><Th>Data</Th></tr></thead>
        <tbody>
          {payments.map((p, i) => (
            <tr key={p.id} onClick={() => setSelected(p)} className="hover:bg-surface-200/30 cursor-pointer transition-colors animate-in" style={{ animationDelay: `${i * 30}ms` }}>
              <Td><p className="font-medium text-surface-800">{p.payerName || '—'}</p><p className="text-xs text-surface-500">{p.payerEmail || p.id.slice(0, 12)}</p></Td>
              <Td><MethodBadge method={p.method} /></Td>
              <Td><GatewayBadge gateway={p.gateway} /></Td>
              <Td><span className="font-mono font-semibold text-surface-900">{p.amountFormatted}</span>{p.feeAmount > 0 && <span className="block text-[10px] text-surface-500">taxa: R$ {(p.feeAmount / 100).toFixed(2).replace('.', ',')}</span>}</Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td><span className="text-surface-700">{relativeTime(p.createdAt)}</span><span className="block text-[10px] text-surface-500">{formatDate(p.createdAt)}</span></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pag.totalPages > 1 && <div className="flex items-center justify-between mt-4 px-1">
        <span className="text-xs text-surface-500">Pág {pag.page}/{pag.totalPages}</span>
        <div className="flex gap-1">
          <button onClick={() => load(pag.page - 1)} disabled={pag.page <= 1} className="btn-ghost p-2 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => load(pag.page + 1)} disabled={pag.page >= pag.totalPages} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>}
    </>}

    <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalhes" wide>
      {selected && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Det label="ID" val={selected.id} cp /><Det label="Gateway ID" val={selected.gatewayPaymentId || '—'} cp />
          <Det label="Status"><StatusBadge status={selected.status} /></Det><Det label="Método"><MethodBadge method={selected.method} /></Det>
          <Det label="Valor" val={selected.amountFormatted} /><Det label="Gateway"><GatewayBadge gateway={selected.gateway} /></Det>
        </div>
        {selected.pixCopiaECola && <><hr className="border-surface-300/30" /><div><label className="text-xs font-medium text-surface-500 mb-1 block">PIX Copia e Cola</label>
          <div className="flex gap-2"><input value={selected.pixCopiaECola} readOnly className="input-base font-mono text-xs flex-1" />
          <button onClick={() => copy(selected.pixCopiaECola!)} className="btn-ghost p-2.5"><Copy className="w-4 h-4" /></button></div></div></>}
      </div>}
    </Modal>
  </>
}

function Det({ label, val, cp, children }: { label: string; val?: string; cp?: boolean; children?: React.ReactNode }) {
  return <div>
    <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">{label}</span>
    {children ? <div className="mt-0.5">{children}</div> : <div className="flex items-center gap-1.5 mt-0.5">
      <p className="text-sm text-surface-800 font-medium truncate">{val}</p>
      {cp && val && val !== '—' && <button onClick={() => { navigator.clipboard.writeText(val); toast.success('Copiado!') }} className="text-surface-500 hover:text-brand-400"><Copy className="w-3 h-3" /></button>}
    </div>}
  </div>
}
