import { useState, useEffect } from 'react'
import { superAdminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PageHeader, PageLoader, Table, Th, Td, Modal, EmptyState, Toggle } from '@/components/ui'
import { Shield, Plus, RotateCcw, Users } from 'lucide-react'
import type { Account } from '@/types'
import toast from 'react-hot-toast'

export default function ManageAdminsPage() {
  const [admins, setAdmins] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showReset, setShowReset] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [resetPw, setResetPw] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try { const { data } = await superAdminApi.listAdmins(); setAdmins(data.data || []) }
    catch { setAdmins([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    try {
      await superAdminApi.createAdmin(form)
      toast.success('Admin criado!')
      setShowCreate(false); setForm({ name: '', email: '', password: '' })
      load()
    } catch (err: any) { toast.error(err.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await superAdminApi.updateAdmin(id, { isActive: !current })
      toast.success(current ? 'Admin desativado' : 'Admin ativado')
      load()
    } catch { toast.error('Erro') }
  }

  const handleReset = async () => {
    if (!showReset || !resetPw) return
    setSaving(true)
    try {
      await superAdminApi.resetPassword(showReset, resetPw)
      toast.success('Senha resetada!')
      setShowReset(null); setResetPw('')
      load()
    } catch (err: any) { toast.error(err.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  if (loading) return <PageLoader />

  return <>
    <PageHeader title="Gerenciar Admins" desc={`${admins.length} admin(s) cadastrado(s)`}
      actions={<button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Novo Admin</button>} />

    {admins.length === 0 ? (
      <EmptyState icon={<Shield className="w-6 h-6" />} title="Nenhum admin" desc="Crie o primeiro admin para começar." />
    ) : (
      <Table>
        <thead><tr><Th>Nome</Th><Th>Email</Th><Th>Usuários</Th><Th>Status</Th><Th>Criado</Th><Th className="text-right">Ações</Th></tr></thead>
        <tbody>
          {admins.map((a, i) => (
            <tr key={a.id} className="hover:bg-surface-200/30 transition-colors animate-in" style={{ animationDelay: `${i * 40}ms` }}>
              <Td><p className="font-medium text-surface-800">{a.name}</p></Td>
              <Td><span className="text-surface-600 text-xs font-mono">{a.email}</span></Td>
              <Td><span className="flex items-center gap-1.5 text-xs text-surface-600"><Users className="w-3.5 h-3.5" />{a.totalUsers || 0}</span></Td>
              <Td><Toggle on={a.isActive} onToggle={() => handleToggle(a.id, a.isActive)} /></Td>
              <Td><span className="text-xs text-surface-600">{formatDate(a.createdAt, false)}</span></Td>
              <Td className="text-right">
                <button onClick={() => { setShowReset(a.id); setResetPw('') }} className="p-1.5 rounded-md hover:bg-surface-200/80 text-surface-500 hover:text-amber-400 transition-colors" title="Resetar senha">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}

    {/* Create Modal */}
    <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Admin">
      <div className="space-y-4">
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Nome</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-base" placeholder="Nome do admin" /></div>
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-base" placeholder="admin@email.com" /></div>
        <div><label className="block text-xs font-medium text-surface-600 mb-1.5">Senha inicial</label>
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-base" placeholder="Mín. 6 caracteres" />
          <p className="text-[11px] text-surface-500 mt-1">O admin será obrigado a trocar no primeiro login</p></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancelar</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Criando...' : 'Criar Admin'}</button>
        </div>
      </div>
    </Modal>

    {/* Reset Password Modal */}
    <Modal open={!!showReset} onClose={() => setShowReset(null)} title="Resetar Senha">
      <div className="space-y-4">
        <p className="text-sm text-surface-600">O admin será obrigado a trocar a senha no próximo login.</p>
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
