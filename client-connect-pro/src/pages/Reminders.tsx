import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Loader2, Clock, Send } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Reminders = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reminders, setReminders] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", template_id: "", days_offset: "-3", is_active: true, send_time: "08:00" });

  const fetchData = async () => {
    if (!user) return;
    const [remindersRes, templatesRes] = await Promise.all([
      supabase.from("reminders").select("*, message_templates(name)").eq("user_id", user.id).order("days_offset"),
      supabase.from("message_templates").select("id, name").eq("user_id", user.id).order("name"),
    ]);
    setReminders(remindersRes.data || []);
    setTemplates(templatesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        template_id: editing.template_id || "",
        days_offset: String(editing.days_offset),
        is_active: editing.is_active,
        send_time: editing.send_time || "08:00",
      });
    } else {
      setForm({ name: "", template_id: "", days_offset: "-3", is_active: true, send_time: "08:00" });
    }
  }, [editing, modalOpen]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      template_id: form.template_id || null,
      days_offset: parseInt(form.days_offset) || 0,
      is_active: form.is_active,
      send_time: form.send_time,
      last_sent_date: null,
    };
    const { error } = editing
      ? await supabase.from("reminders").update(payload).eq("id", editing.id)
      : await supabase.from("reminders").insert(payload);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: editing ? "Lembrete atualizado" : "Lembrete criado" });
      setModalOpen(false); setEditing(null); fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("reminders").delete().eq("id", deleteId);
    toast({ title: "Lembrete removido" }); setDeleteId(null); fetchData();
  };

  const handleSendNow = async (reminder: any) => {
    if (!reminder.template_id) {
      toast({ title: "Erro", description: "Este lembrete não tem template associado.", variant: "destructive" });
      return;
    }
    setSendingId(reminder.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-reminders", {
        body: { reminder_id: reminder.id },
      });
      if (error) throw new Error(error.message);
      toast({
        title: "Envio concluído!",
        description: data?.message || "Mensagens enviadas com sucesso.",
      });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSendingId(null);
  };

  const formatOffset = (offset: number) => {
    if (offset === 0) return "No dia do vencimento";
    if (offset < 0) return `${Math.abs(offset)} dias antes`;
    return `${offset} dias depois`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lembretes Automáticos</h1>
          <p className="text-muted-foreground">{reminders.length} lembretes configurados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Lembrete
        </Button>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Quando</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : reminders.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum lembrete configurado</TableCell></TableRow>
            ) : reminders.map(r => (
              <TableRow key={r.id} className="border-border/30">
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.message_templates?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatOffset(r.days_offset)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{r.send_time || "08:00"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.is_active ? "default" : "secondary"}>
                    {r.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleSendNow(r)}
                          disabled={sendingId === r.id}
                          className="hover:text-primary"
                        >
                          {sendingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Enviar agora</TooltipContent>
                    </Tooltip>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
        ) : reminders.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum lembrete configurado</p>
        ) : reminders.map(r => (
          <div key={r.id} className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{r.name}</span>
                <Badge variant={r.is_active ? "default" : "secondary"} className="shrink-0 text-xs">
                  {r.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon"
                  onClick={() => handleSendNow(r)}
                  disabled={sendingId === r.id}
                  className="hover:text-primary"
                >
                  {sendingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Template</span>
                <p className="truncate">{r.message_templates?.name || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Quando</span>
                <p>{formatOffset(r.days_offset)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Horário</span>
                <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.send_time || "08:00"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Lembrete" : "Novo Lembrete"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Aviso 3 dias antes" />
            </div>
            <div className="space-y-2">
              <Label>Template de Mensagem</Label>
              <Select value={form.template_id} onValueChange={v => setForm(f => ({ ...f, template_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deslocamento (dias)</Label>
                <Input
                  type="number"
                  value={form.days_offset}
                  onChange={e => setForm(f => ({ ...f, days_offset: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Negativo = antes. 0 = no dia. Positivo = depois.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Horário de envio</Label>
                <Input
                  type="time"
                  value={form.send_time}
                  onChange={e => setForm(f => ({ ...f, send_time: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Horário em que as mensagens serão enviadas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Ativo</Label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lembrete?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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

export default Reminders;