import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Zap, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const account = await login(email, password)
      if (account.mustChangePassword) {
        navigate('/change-password')
        toast('Você precisa trocar sua senha', { icon: '🔑' })
      } else {
        navigate('/')
        toast.success('Bem-vindo!')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Credenciais inválidas')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-600/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-600/5 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm mx-4 animate-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-600/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-surface-900">Payment Orchestrator</h1>
          <p className="text-sm text-surface-500 mt-1">Acesse o painel de controle</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="input-base" required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Senha</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-base pr-10" required />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}
