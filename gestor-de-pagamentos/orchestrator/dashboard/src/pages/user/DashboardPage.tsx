import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { METHOD_CFG, GW_CFG } from '@/lib/utils'
import { PageHeader, StatCard, PageLoader, StatusBadge, MethodBadge } from '@/components/ui'
import { DollarSign, CheckCircle2, Clock, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import type { DashboardStats, Payment } from '@/types'

export default function UserDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([userApi.getStats(), userApi.getPayments({ limit: 5 })])
        setStats(s.data.data); setRecent(p.data.data || [])
      } catch { /* empty state */ }
      finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <PageLoader />

  const PIE_COLORS = ['#4ba883', '#00b1ea', '#f59e0b', '#8b5cf6']
  const pieData = stats?.byMethod.map(m => ({ name: METHOD_CFG[m.method]?.label || m.method, value: m.count })) || []
  const barData = stats?.byGateway.map(g => ({ name: GW_CFG[g.gateway]?.label || g.gateway, total: g.total / 100, color: GW_CFG[g.gateway]?.color || '#666' })) || []

  return <>
    <PageHeader title="Dashboard" desc="Visão geral das suas transações" />

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard label="Receita Total" value={stats?.revenueFormatted || 'R$ 0,00'} icon={<DollarSign className="w-[18px] h-[18px]" />} />
      <StatCard label="Aprovados" value={stats?.approved || 0} sub={`de ${stats?.total || 0} transações`} icon={<CheckCircle2 className="w-[18px] h-[18px]" />} />
      <StatCard label="Pendentes" value={stats?.pending || 0} icon={<Clock className="w-[18px] h-[18px]" />} />
      <StatCard label="Taxa Aprovação" value={stats?.approvalRate != null ? `${stats.approvalRate}%` : '100%'} icon={<TrendingUp className="w-[18px] h-[18px]" />} />
    </div>

    {(barData.length > 0 || pieData.length > 0) && (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        <div className="card lg:col-span-3">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Receita por Gateway</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#283445" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7f9b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7f9b' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#171f2b', border: '1px solid #283445', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Total']} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#4ba883" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Por Método</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
              {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie><Tooltip contentStyle={{ background: '#171f2b', border: '1px solid #283445', borderRadius: 8, fontSize: 12 }} /></PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {pieData.map((e, i) => <span key={i} className="flex items-center gap-1.5 text-xs text-surface-600"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{e.name}</span>)}
          </div>
        </div>
      </div>
    )}

    {recent.length > 0 && (
      <div className="card">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Pagamentos Recentes</h3>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-surface-300/30">
              {['Pagador', 'Método', 'Valor', 'Status'].map(h => <th key={h} className="text-left px-5 pb-3 text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody>
              {recent.map(p => <tr key={p.id} className="border-b border-surface-200/20 hover:bg-surface-200/20 transition-colors">
                <td className="px-5 py-3"><p className="font-medium text-surface-800">{p.payerName || '—'}</p><p className="text-xs text-surface-500">{p.payerEmail || ''}</p></td>
                <td className="px-5 py-3"><MethodBadge method={p.method} /></td>
                <td className="px-5 py-3 font-mono font-medium text-surface-900">{p.amountFormatted}</td>
                <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </>
}
