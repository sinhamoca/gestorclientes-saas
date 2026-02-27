import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import ManageAdminsPage from '@/pages/super-admin/ManageAdminsPage'
import ManageUsersPage from '@/pages/admin/ManageUsersPage'
import DashboardPage from '@/pages/user/DashboardPage'
import PaymentsPage from '@/pages/user/PaymentsPage'
import GatewaysPage from '@/pages/user/GatewaysPage'
import RoutingPage from '@/pages/user/RoutingPage'
import FeesPage from '@/pages/user/FeesPage'
import ApiKeysPage from '@/pages/user/ApiKeysPage'
import WebhooksPage from '@/pages/user/WebhooksPage'

function RoleHome() {
  const { account } = useAuth()
  if (!account) return <Navigate to="/login" replace />
  if (account.mustChangePassword) return <Navigate to="/change-password" replace />

  switch (account.role) {
    case 'SUPER_ADMIN': return <ManageAdminsPage />
    case 'ADMIN': return <ManageUsersPage />
    case 'USER': return <DashboardPage />
    default: return <Navigate to="/login" replace />
  }
}

function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const { account } = useAuth()
  if (!account) return <Navigate to="/login" replace />
  if (account.mustChangePassword) return <Navigate to="/change-password" replace />
  if (account.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{
          duration: 3000,
          style: { background: '#171f2b', color: '#e4eaf2', border: '1px solid #283445', fontSize: '13px', borderRadius: '10px' },
          success: { iconTheme: { primary: '#4ba883', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<RoleHome />} />
            {/* User routes */}
            <Route path="/payments" element={<RequireRole role="USER"><PaymentsPage /></RequireRole>} />
            <Route path="/gateways" element={<RequireRole role="USER"><GatewaysPage /></RequireRole>} />
            <Route path="/routing" element={<RequireRole role="USER"><RoutingPage /></RequireRole>} />
            <Route path="/fees" element={<RequireRole role="USER"><FeesPage /></RequireRole>} />
            <Route path="/api-keys" element={<RequireRole role="USER"><ApiKeysPage /></RequireRole>} />
            <Route path="/webhooks" element={<RequireRole role="USER"><WebhooksPage /></RequireRole>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
