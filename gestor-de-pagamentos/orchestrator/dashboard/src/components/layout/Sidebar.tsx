import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LayoutDashboard, CreditCard, Plug, Percent, Webhook, Key, Users, Shield, LogOut, Zap, Route } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV: Record<string, { to: string; icon: any; label: string }[]> = {
  SUPER_ADMIN: [
    { to: '/', icon: Shield, label: 'Gerenciar Admins' },
  ],
  ADMIN: [
    { to: '/', icon: Users, label: 'Gerenciar Usuários' },
  ],
  USER: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/payments', icon: CreditCard, label: 'Pagamentos' },
    { to: '/gateways', icon: Plug, label: 'Gateways' },
    { to: '/routing', icon: Route, label: 'Roteamento' },
    { to: '/fees', icon: Percent, label: 'Taxas' },
    { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
    { to: '/api-keys', icon: Key, label: 'API Keys' },
  ],
}

export function Sidebar() {
  const { account, logout } = useAuth()
  const navigate = useNavigate()
  const items = NAV[account?.role || 'USER'] || []

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    USER: 'Usuário',
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col bg-surface-50 border-r border-surface-300/40 z-30">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-surface-300/40">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-surface-900 leading-none">Orchestrator</h1>
          <span className="text-[10px] text-surface-500 tracking-wider uppercase">Payments</span>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border',
              isActive
                ? 'bg-brand-600/10 text-brand-400 border-brand-500/20'
                : 'text-surface-600 hover:text-surface-800 hover:bg-surface-200/60 border-transparent'
            )}>
            <Icon className="w-[18px] h-[18px]" />{label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-surface-300/40">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-surface-300 flex items-center justify-center text-xs font-semibold text-surface-700">
            {account?.name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-800 truncate">{account?.name}</p>
            <p className="text-[11px] text-surface-500">{roleLabel[account?.role || ''] || account?.role}</p>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} className="p-1.5 rounded-md hover:bg-surface-200/80 text-surface-500 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
