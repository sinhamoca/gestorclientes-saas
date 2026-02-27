import { useState, useEffect } from 'react'
import { adminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PageHeader, PageLoader, Table, Th, Td, Modal, EmptyState, Toggle } from '@/components/ui'
import { Users, Plus, RotateCcw, CreditCard, Key } from 'lucide-react'
import type { Account } from '@/types'
import toast from 'react-hot-toast'

export default function ManageUsersPage() {
  const [users, setUsers] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showReset, setShowReset] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [resetPw, setResetPw] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try { const { data } = await adminApi.listUsers(); setUsers(data.data || []) }
    catch { setUsers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    try {
      await adminApi.createUser(form)
      toast.success('Usuário criado!')
      setShowCreate(false); setForm({ name: '', email: '', password: '' })
      load()
    } catch (err: any) { toast.error(err.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await adminApi.updateUser(id, { isActive: !current })
      toast.success(current ? 'Usuário desativado' : 'Usuário ativado')
      load()
    } catch { toast.error('Erro') }
  }

  const handleReset = async () => {
    if (!showReset || !resetPw) return
    setSaving(true)
    try {
      await adminApi.resetPassword(showReset, resetPw)
      toast.success('Senha resetada!')
      setShowReset(null); setResetPw('')
      load()
    } catch (err: any) { toast.error(err.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  if (loading) return <PageLoader />

  return <>
    <PageHeader title="Gerenciar Usuários" desc={`${users.length} usuário(s)`}
      actions={<button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Novo Usuário</button>} />

    {users.length === 0 ? (
      <EmptyState icon={<Users className="w-6 h-6" />} title="Nenhum usuário" desc="Crie o primeiro usuário para ele poder usar o gateway de pagamentos." />
    ) : (
      <Table>
        <thead><tr><Th>Nome</Th><Th>Email</Th><Th>Pagamentos</Th><Th>API Keys</Th><Th>Status</Th><Th>Criado</Th><Th className="text-right">Ações</Th></tr></thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.id} className="hover:bg-surface-200/30 transition-colors animate-in" style={{ animationDelay: `${i * 40}ms` }}>
              <Td><p className="font-medium text-surface-800">{u.name}</p></Td>
              <Td><span className="text-surface-600 text-xs font-mono">{u.email}</span></Td>
              <Td><span className="flex items-center gap-1.5 text-xs text-surface-600"><CreditCard className="w-3.5 h-3.5" />{u.totalPayments || 0}</span></Td>
              <Td><span className="flex items-center gap-1.5 text-xs text-surface-600"><Key className="w-3.5 h-3.5" />{u.totalApiKeys || 0}</span></Td>
              <Td><Toggle on={u.isActive} onToggle={() => handleToggle(u.id, u.isActive)} /></Td>
              <Td><span className="text-xs text-surface-600">{formatDate(u.createdAt, false)}</span></Td>
              <Td className="text-right">
                <button onClick={() => { setShowReset(u.id); setResetPw('') }} className="p-1.5 rounded-md hover:bg-surface-200/80 text-surface-500 hover:text-amber-400 transition-colors" title="Resetar senha">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}

    <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Usuário">
      <div className="space-y-4">
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Nome</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-base" placeholder="Nome do usuário" /></div>
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-base" placeholder="usuario@email.com" /></div>
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Senha inicial</label>
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-base" placeholder="Mín. 6 caracteres" />
          <p className="text-[11px] text-surface-500 mt-1">O usuário será obrigado a trocar no primeiro login</p></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancelar</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Criando...' : 'Criar Usuário'}</button>
        </div>
      </div>
    </Modal>

    <Modal open={!!showReset} onClose={() => setShowReset(null)} title="Resetar Senha">
      <div className="space-y-4">
        <p className="text-sm text-surface-600">O usuário será obrigado a trocar a senha no próximo login.</p>
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Nova senha temporária</label>
          <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} className="input-base" placeholder="Mín. 6 caracteres" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setShowReset(null)} className="btn-ghost">Cancelar</button>
          <button onClick={handleReset} disabled={saving} className="btn-danger">{saving ? 'Resetando...' : 'Resetar Senha'}</button>
        </div>
      </div>
    </Modal>
  </>
}
