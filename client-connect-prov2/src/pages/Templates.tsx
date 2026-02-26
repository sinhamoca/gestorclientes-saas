import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Loader2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const VARIABLES = [
  { key: "{saudacao}", desc: "Bom dia/Boa tarde/Boa noite" },
  { key: "{nome}", desc: "Nome do cliente" },
  { key: "{vencimento}", desc: "Data de vencimento" },
  { key: "{dias}", desc: "Dias até o vencimento" },
  { key: "{valor}", desc: "Valor do plano" },
  { key: "{plano}", desc: "Nome do plano" },
  { key: "{whatsapp}", desc: "WhatsApp do cliente" },
  { key: "{link_pagamento}", desc: "Link de pagamento" },
];

const Templates = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", content: "" });

  const fetchTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [user]);

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, content: editing.content });
    } else {
      setForm({ name: "", content: "" });
    }
  }, [editing, modalOpen]);

  const handleSave = async () => {
    if (!user || !form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    const payload = { user_id: user.id, name: form.name.trim(), content: form.content.trim() };
    const { error } = editing
      ? await supabase.from("message_templates").update(payload).eq("id", editing.id)
      : await supabase.from("message_templates").insert(payload);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: editing ? "Template atualizado" : "Template criado" });
      setModalOpen(false); setEditing(null); fetchTemplates();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("message_templates").delete().eq("id", deleteId);
    toast({ title: "Template removido" }); setDeleteId(null); fetchTemplates();
  };

  const insertVariable = (variable: string) => {
    setForm(f => ({ ...f, content: f.content + variable }));
  };

  const extractVariables = (content: string) => {
    const found = VARIABLES.filter(v => content.includes(v.key));
    return found;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Mensagem</h1>
          <p className="text-muted-foreground">{templates.length} templates cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Template
        </Button>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Conteúdo</TableHead>
              <TableHead>Variáveis</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : templates.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum template cadastrado</TableCell></TableRow>
            ) : templates.map(t => (
              <TableRow key={t.id} className="border-border/30">
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">{t.content}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {extractVariables(t.content).map(v => (
                      <Badge key={v.key} variant="secondary" className="text-xs">{v.key}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
        ) : templates.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum template cadastrado</p>
        ) : templates.map(t => (
          <div key={t.id} className="glass-card rounded-xl p-3 space-y-1.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{t.name}</span>
              <div className="flex gap-0 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setModalOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 break-all">{t.content}</p>
            {extractVariables(t.content).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {extractVariables(t.content).map(v => (
                  <Badge key={v.key} variant="secondary" className="text-[10px] px-1.5 py-0">{v.key}</Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar Template" : "Novo Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Lembrete de vencimento" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Olá {nome}, seu plano vence em {vencimento}..."
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Variáveis disponíveis (clique para inserir)</Label>
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map(v => (
                  <Button
                    key={v.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => insertVariable(v.key)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {v.key} <span className="text-muted-foreground ml-1">— {v.desc}</span>
                  </Button>
                ))}
              </div>
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
            <AlertDialogTitle>Remover template?</AlertDialogTitle>
            <AlertDialogDescription>Lembretes associados ficarão sem template.</AlertDialogDescription>
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

export default Templates;