import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Servers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", cost_per_screen: "0", multiply_by_screens: false });

  const fetchServers = async () => {
    if (!user) return;
    const { data } = await supabase.from("servers").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setServers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchServers(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, cost_per_screen: String(editing.cost_per_screen), multiply_by_screens: editing.multiply_by_screens });
    } else {
      setForm({ name: "", cost_per_screen: "0", multiply_by_screens: false });
    }
  }, [editing, modalOpen]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id, name: form.name.trim(),
      cost_per_screen: parseFloat(form.cost_per_screen) || 0,
      multiply_by_screens: form.multiply_by_screens,
    };
    const { error } = editing
      ? await supabase.from("servers").update(payload).eq("id", editing.id)
      : await supabase.from("servers").insert(payload);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: editing ? "Servidor atualizado" : "Servidor criado" }); setModalOpen(false); setEditing(null); fetchServers(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("servers").delete().eq("id", deleteId);
    toast({ title: "Servidor removido" }); setDeleteId(null); fetchServers();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servidores</h1>
          <p className="text-muted-foreground">{servers.length} servidores cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Servidor
        </Button>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Custo/Tela</TableHead>
              <TableHead>Multiplicar por Telas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : servers.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum servidor cadastrado</TableCell></TableRow>
            ) : servers.map(server => (
              <TableRow key={server.id} className="border-border/30">
                <TableCell className="font-medium">{server.name}</TableCell>
                <TableCell>R$ {Number(server.cost_per_screen).toFixed(2)}</TableCell>
                <TableCell>{server.multiply_by_screens ? "Sim" : "Não"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(server); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(server.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* MOBILE: Cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : servers.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum servidor cadastrado</p>
        ) : servers.map(server => (
          <div key={server.id} className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="font-medium">{server.name}</span>
                <p className="text-sm text-muted-foreground">
                  R$ {Number(server.cost_per_screen).toFixed(2)}/tela • {server.multiply_by_screens ? "Multiplica por telas" : "Não multiplica"}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => { setEditing(server); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(server.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Servidor" : "Novo Servidor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Custo por Tela (R$)</Label><Input type="number" step="0.01" value={form.cost_per_screen} onChange={e => setForm(f => ({ ...f, cost_per_screen: e.target.value }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.multiply_by_screens} onCheckedChange={v => setForm(f => ({ ...f, multiply_by_screens: v }))} />
              <Label>Multiplicar custo pelo nº de telas do plano</Label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover servidor?</AlertDialogTitle>
            <AlertDialogDescription>Clientes associados ficarão sem servidor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Servers;