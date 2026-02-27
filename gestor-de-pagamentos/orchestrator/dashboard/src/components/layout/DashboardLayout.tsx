import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from './Sidebar'

export function DashboardLayout() {
  const { account } = useAuth()
  if (!account) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="p-6 lg:p-8 max-w-[1400px]"><Outlet /></div>
      </main>
    </div>
  )
}
