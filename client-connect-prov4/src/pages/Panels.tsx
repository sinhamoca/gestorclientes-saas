import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Loader2, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  { value: "sigma", label: "Sigma", needsDomain: true },
  { value: "cloudnation", label: "CloudNation", needsDomain: false, fixedUrl: "painel.cloudnation.top" },
  { value: "koffice", label: "Koffice", needsDomain: true },
  { value: "uniplay", label: "Uniplay", needsDomain: false, fixedUrl: "gesapioffice.com" },
  { value: "club", label: "Club", needsDomain: false, fixedUrl: "dashboard.bz" },
  { value: "rush", label: "Rush", needsDomain: false, fixedUrl: "paineloffice.click" },
  { value: "painelfoda", label: "PainelFoda", needsDomain: true },
];

const Panels = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: "", label: "", domain: "", username: "", password: "",
  });

  const fetchPanels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("panel_credentials")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPanels(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPanels(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({
        provider: editing.provider, label: editing.label || "",
        domain: editing.domain || "", username: editing.username,
        password: "",
      });
    } else {
      setForm({ provider: "", label: "", domain: "", username: "", password: "" });
    }
  }, [editing, modalOpen]);

  const selectedProvider = PROVIDERS.find(p => p.value === form.provider);

  const handleSave = async () => {
    if (!user || !form.provider || !form.username) return;
    if (selectedProvider?.needsDomain && !form.domain.trim()) {
      toast({ title: "Domínio obrigatório", description: "Este provider requer um domínio.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      provider: form.provider,
      label: form.label.trim() || `${selectedProvider?.label || form.provider}`,
      domain: selectedProvider?.needsDomain ? form.domain.trim() : null,
      username: form.username.trim(),
    };
    if (form.password) {
      payload.password = form.password;
    } else if (!editing) {
      toast({ title: "Senha obrigatória", variant: "destructive" });
      setSaving(false);
      return;
    }

    const { error } = editing
      ? await supabase.from("panel_credentials").update(payload).eq("id", editing.id)
      : await supabase.from("panel_credentials").insert(payload);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Painel atualizado" : "Painel cadastrado" });
      setModalOpen(false);
      setEditing(null);
      fetchPanels();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("panel_credentials").delete().eq("id", deleteId);
    toast({ title: "Painel removido" });
    setDeleteId(null);
    fetchPanels();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meus Painéis</h1>
          <p className="text-muted-foreground">{panels.length} painéis cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Painel
        </Button>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Domínio</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : panels.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum painel cadastrado</TableCell></TableRow>
            ) : panels.map(panel => {
              const prov = PROVIDERS.find(p => p.value === panel.provider);
              return (
                <TableRow key={panel.id} className="border-border/30">
                  <TableCell className="font-medium">{panel.label || panel.provider}</TableCell>
                  <TableCell><Badge variant="outline">{prov?.label || panel.provider}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{panel.domain || prov?.fixedUrl || "—"}</TableCell>
                  <TableCell>{panel.username}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(panel); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(panel.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* MOBILE: Cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : panels.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum painel cadastrado</p>
        ) : panels.map(panel => {
          const prov = PROVIDERS.find(p => p.value === panel.provider);
          return (
            <div key={panel.id} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{panel.label || panel.provider}</span>
                  <Badge variant="outline" className="shrink-0 text-xs">{prov?.label || panel.provider}</Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(panel); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(panel.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Domínio</span>
                  <p className="truncate">{panel.domain || prov?.fixedUrl || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Usuário</span>
                  <p className="truncate">{panel.username}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Painel" : "Novo Painel"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Provider *</Label>
              <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v, domain: "" }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar provider" /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome amigável</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Meu Sigma Principal" />
            </div>

            {selectedProvider?.needsDomain && (
              <div className="space-y-2">
                <Label>Domínio *</Label>
                <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="Ex: starplay.sigma.st" />
              </div>
            )}

            {selectedProvider && !selectedProvider.needsDomain && selectedProvider.fixedUrl && (
              <p className="text-sm text-muted-foreground">URL fixa: <span className="font-mono">{selectedProvider.fixedUrl}</span></p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Usuário *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{editing ? "Nova Senha (deixe vazio para manter)" : "Senha *"}</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover painel?</AlertDialogTitle>
            <AlertDialogDescription>Planos vinculados a este painel perderão a referência.</AlertDialogDescription>
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

export default Panels;