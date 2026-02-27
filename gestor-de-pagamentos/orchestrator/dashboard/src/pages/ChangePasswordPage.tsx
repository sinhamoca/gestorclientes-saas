import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/api'
import { Zap, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChangePasswordPage() {
  const { account, updateAccount, logout } = useAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirm) { toast.error('Senhas não conferem'); return }
    if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return }

    setLoading(true)
    try {
      await authApi.changePassword({ newPassword })
      updateAccount({ mustChangePassword: false })
      toast.success('Senha alterada!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao trocar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm mx-4 animate-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-surface-900">Troque sua senha</h1>
          <p className="text-sm text-surface-500 mt-1 text-center">Por segurança, defina uma nova senha para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Nova senha</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="input-base" required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Confirmar senha</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repita a senha" className="input-base" required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
      </div>
    </div>
  )
}
