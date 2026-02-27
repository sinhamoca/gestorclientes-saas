import { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn, STATUS_CFG, METHOD_CFG, GW_CFG } from '@/lib/utils'
import type { PaymentStatus, PaymentMethod, GatewayType } from '@/types'

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const c = STATUS_CFG[status]
  return <span className={cn('badge border', c.bg, c.color)}><span className="w-1.5 h-1.5 rounded-full bg-current" />{c.label}</span>
}

export function MethodBadge({ method }: { method: PaymentMethod }) {
  const c = METHOD_CFG[method]
  return <span className="badge bg-surface-200/60 text-surface-700 border border-surface-300/40">{c.icon} {c.label}</span>
}

export function GatewayBadge({ gateway }: { gateway: GatewayType }) {
  const c = GW_CFG[gateway]
  return <span className="badge border border-surface-300/40 text-surface-700" style={{ backgroundColor: `${c.color}15` }}>
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />{c.label}
  </span>
}

export function Spinner() { return <Loader2 className="w-6 h-6 animate-spin text-brand-400" /> }
export function PageLoader() { return <div className="flex items-center justify-center py-32"><Spinner /></div> }

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return <div className="flex items-start justify-between mb-8">
    <div><h1 className="text-xl font-semibold text-surface-900">{title}</h1>{desc && <p className="text-sm text-surface-500 mt-1">{desc}</p>}</div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
}

export function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: ReactNode }) {
  return <div className="card animate-in group hover:border-surface-400/60 transition-all">
    <div className="flex items-start justify-between mb-3">
      <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">{label}</span>
      <div className="w-9 h-9 rounded-lg bg-surface-200/60 flex items-center justify-center text-surface-500 group-hover:text-brand-400 group-hover:bg-brand-500/10 transition-all">{icon}</div>
    </div>
    <p className="text-2xl font-bold text-surface-900 tracking-tight">{value}</p>
    {sub && <p className="text-xs text-surface-500 mt-1">{sub}</p>}
  </div>
}

export function EmptyState({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-xl bg-surface-200/60 flex items-center justify-center text-surface-500 mb-4">{icon}</div>
    <h3 className="text-sm font-semibold text-surface-800 mb-1">{title}</h3>
    <p className="text-xs text-surface-500 max-w-xs">{desc}</p>
  </div>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <div className={cn('relative w-full mx-4 rounded-2xl bg-surface-100 border border-surface-300/50 shadow-2xl', wide ? 'max-w-2xl' : 'max-w-lg')} style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-300/40">
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        <button onClick={onClose} className="text-surface-500 hover:text-surface-700 text-xl leading-none">&times;</button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-surface-300/40"><table className="w-full text-sm">{children}</table></div>
}
export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn('text-left px-4 py-3 text-[10px] font-semibold text-surface-500 uppercase tracking-wider bg-surface-100/80 border-b border-surface-300/40', className)}>{children}</th>
}
export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3.5 text-surface-800 border-b border-surface-200/40', className)}>{children}</td>
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <button onClick={onToggle} className={cn('w-10 h-5 rounded-full transition-colors relative', on ? 'bg-brand-500' : 'bg-surface-400')}>
    <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', on ? 'left-5' : 'left-0.5')} />
  </button>
}
