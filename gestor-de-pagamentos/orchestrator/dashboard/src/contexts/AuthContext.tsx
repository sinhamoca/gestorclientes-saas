import { createContext, useContext, useState, ReactNode } from 'react'
import { authApi } from '@/lib/api'
import type { AccountRole } from '@/types'

interface AuthAccount {
  id: string; name: string; email: string; role: AccountRole; mustChangePassword: boolean
}

interface AuthCtx {
  account: AuthAccount | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthAccount>
  logout: () => void
  updateAccount: (partial: Partial<AuthAccount>) => void
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(() => {
    const s = localStorage.getItem('account')
    return s ? JSON.parse(s) : null
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(false)

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { data } = await authApi.login(email, password)
      const { account: a, token: t } = data.data
      setAccount(a)
      setToken(t)
      localStorage.setItem('account', JSON.stringify(a))
      localStorage.setItem('token', t)
      return a
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setAccount(null); setToken(null)
    localStorage.clear()
  }

  const updateAccount = (partial: Partial<AuthAccount>) => {
    if (!account) return
    const updated = { ...account, ...partial }
    setAccount(updated)
    localStorage.setItem('account', JSON.stringify(updated))
  }

  return (
    <AuthContext.Provider value={{ account, token, loading, login, logout, updateAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
