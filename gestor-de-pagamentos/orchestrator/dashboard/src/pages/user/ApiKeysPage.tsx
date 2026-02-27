import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PageHeader, PageLoader, Table, Th, Td, Modal, EmptyState, Toggle } from '@/components/ui'
import { Key, Plus, Copy, Trash2, AlertCircle } from 'lucide-react'
import type { ApiKeyItem } from '@/types'
import toast from 'react-hot-toast'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = async () => {
    try { const { data } = await userApi.getApiKeys(); setKeys(data.data || []) }
    catch { setKeys([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    setSaving(true)
    try {
      const { data } = await userApi.createApiKey(label || undefined)
      toast.success('API Key criada!')
      setModal(false); setLabel('')
      load()
    } catch (e: any) { toast.error(e.response?.data?.message || 'Erro') }
    finally { setSaving(false) }
  }

  const toggle = async (id: string) => {
    try { await userApi.toggleApiKey(id); load() }
    catch { toast.error('Erro') }
  }

  const del = async (id: string) => {
    try { await userApi.deleteApiKey(id); toast.success('Key removida'); setConfirmDel(null); load() }
    catch { toast.error('Erro') }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copiado!') }

  if (loading) return <PageLoader />

  return <>
    <PageHeader title="API Keys" desc="Chaves de acesso para integração com GestãoPro"
      actions={<button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Nova Key</button>} />

    {keys.length === 0 ? (
      <EmptyState icon={<Key className="w-6 h-6" />} title="Nenhuma API Key" desc="Crie uma API key para integrar com o GestãoPro." />
    ) : (
      <Table>
        <thead><tr><Th>Label</Th><Th>Chave</Th><Th>Status</Th><Th>Criada</Th><Th className="text-right">Ações</Th></tr></thead>
        <tbody>
          {keys.map((k, i) => (
            <tr key={k.id} className="hover:bg-surface-200/30 transition-colors animate-in" style={{ animationDelay: `${i * 40}ms` }}>
              <Td><span className="font-medium text-surface-800">{k.label || 'Sem label'}</span></Td>
              <Td>
                <div className="flex items-center gap-2 max-w-md">
                  <code className="text-xs font-mono text-surface-600 bg-surface-200/60 px-2.5 py-1.5 rounded-md truncate flex-1">{k.key}</code>
                  <button onClick={() => copy(k.key)} className="p-1.5 rounded-md hover:bg-surface-200/80 text-surface-500 hover:text-brand-400 transition-colors flex-shrink-0" title="Copiar">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Td>
              <Td><Toggle on={k.isActive} onToggle={() => toggle(k.id)} /></Td>
              <Td><span className="text-xs text-surface-600">{formatDate(k.createdAt, false)}</span></Td>
              <Td className="text-right">
                <button onClick={() => setConfirmDel(k.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors" title="Deletar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}

    <div className="card bg-surface-100/40 border-surface-300/30 mt-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-surface-500 space-y-2">
          <p>Use a API key no header <code className="text-surface-700 bg-surface-200/60 px-1.5 py-0.5 rounded">X-Api-Key</code> ao chamar a API de pagamentos.</p>
          <p className="font-mono text-surface-600">curl -H "X-Api-Key: orch_xxx..." POST /api/v1/payments</p>
        </div>
      </div>
    </div>

    {/* Create Modal */}
    <Modal open={modal} onClose={() => setModal(false)} title="Nova API Key">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Label (opcional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} className="input-base" placeholder="Ex: GestãoPro Produção" />
        </div>
        <p className="text-[11px] text-surface-500">A chave será gerada automaticamente e ficará sempre visível no painel.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setModal(false)} className="btn-ghost">Cancelar</button>
          <button onClick={create} disabled={saving} className="btn-primary">{saving ? 'Criando...' : 'Criar Key'}</button>
        </div>
      </div>
    </Modal>

    {/* Delete Confirm */}
    <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirmar exclusão">
      <div className="space-y-4">
        <p className="text-sm text-surface-600">Tem certeza? Integrações usando esta key vão parar de funcionar imediatamente.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setConfirmDel(null)} className="btn-ghost">Cancelar</button>
          <button onClick={() => confirmDel && del(confirmDel)} className="btn-danger">Deletar Key</button>
        </div>
      </div>
    </Modal>
  </>
}
