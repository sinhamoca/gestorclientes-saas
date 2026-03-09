import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gift, Plus, Trash2, Trophy, Users, Loader2, ChevronDown, ChevronUp, Ticket, Eye, Pencil,
} from "lucide-react";

interface Promotion {
  id: string;
  name: string;
  discount_percent: number;
  prize_count: number;
  eligibility_mode: "paid" | "active";
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  drawn_at: string | null;
  created_at: string;
}

interface Winner {
  id: string;
  client_id: string;
  discount_percent: number;
  drawn_at: string;
  client_name?: string;
}

interface Participant {
  id: string;
  name: string;
}

const emptyForm = {
  name: "",
  discount_percent: "",
  prize_count: "",
  eligibility_mode: "paid" as "paid" | "active",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  is_active: true,
};

type FormState = typeof emptyForm;

export default function Promotions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal criar/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Sorteio
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [drawConfirmPromo, setDrawConfirmPromo] = useState<Promotion | null>(null);

  // Ganhadores expandidos
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [winners, setWinners] = useState<Record<string, Winner[]>>({});
  const [loadingWinners, setLoadingWinners] = useState<string | null>(null);

  // Participantes
  const [participantsPromo, setParticipantsPromo] = useState<Promotion | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const setField = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const fetchPromotions = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("promotions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPromotions(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPromotions(); }, [user]);

  // ── Abrir modal ──
  const openCreate = () => {
    setEditingPromo(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (promo: Promotion) => {
    setEditingPromo(promo);
    setForm({
      name: promo.name,
      discount_percent: String(promo.discount_percent),
      prize_count: String(promo.prize_count),
      eligibility_mode: promo.eligibility_mode,
      start_date: promo.start_date,
      end_date: promo.end_date || "",
      is_active: promo.is_active,
    });
    setModalOpen(true);
  };

  // ── Salvar (criar ou editar) ──
  const handleSave = async () => {
    if (!user || !form.name.trim() || !form.discount_percent || !form.prize_count) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      discount_percent: parseFloat(form.discount_percent),
      prize_count: parseInt(form.prize_count),
      eligibility_mode: form.eligibility_mode,
      start_date: form.start_date,
      end_date: form.end_date || null,
      is_active: form.is_active,
    };

    if (editingPromo) {
      // Editar
      const { error } = await supabase
        .from("promotions")
        .update(payload)
        .eq("id", editingPromo.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Promoção atualizada!" });
        setModalOpen(false);
        fetchPromotions();
      }
    } else {
      // Criar
      const { error } = await supabase
        .from("promotions")
        .insert({ ...payload, user_id: user.id });
      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Promoção criada!" });
        setModalOpen(false);
        fetchPromotions();
      }
    }
    setSaving(false);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("promotions").delete().eq("id", deleteId);
    toast({ title: "Promoção removida" });
    setDeleteId(null);
    fetchPromotions();
  };

  // ── Sorteio ──
  const handleDraw = async () => {
    if (!drawConfirmPromo) return;
    setDrawingId(drawConfirmPromo.id);
    setDrawConfirmPromo(null);
    try {
      const { data, error } = await supabase.functions.invoke("draw-promotion", {
        body: { promotion_id: drawConfirmPromo.id },
      });
      if (error) throw new Error(error.message);
      if (!data.success) throw new Error(data.error);
      toast({
        title: "Sorteio realizado!",
        description: `${data.winners_count} ganhador(es) de ${data.eligible_count} participantes.`,
      });
      fetchPromotions();
      setWinners(prev => { const next = { ...prev }; delete next[drawConfirmPromo.id]; return next; });
      setExpandedId(drawConfirmPromo.id);
      await fetchWinners(drawConfirmPromo.id);
    } catch (e: any) {
      toast({ title: "Erro no sorteio", description: e.message, variant: "destructive" });
    }
    setDrawingId(null);
  };

  // ── Ganhadores ──
  const fetchWinners = async (promotionId: string) => {
    if (winners[promotionId]) return;
    setLoadingWinners(promotionId);
    const { data } = await supabase
      .from("promotion_winners")
      .select("*, clients(name)")
      .eq("promotion_id", promotionId)
      .order("drawn_at", { ascending: false });
    setWinners(prev => ({
      ...prev,
      [promotionId]: (data || []).map((w: any) => ({ ...w, client_name: w.clients?.name || "—" })),
    }));
    setLoadingWinners(null);
  };

  const handleExpand = async (promoId: string) => {
    if (expandedId === promoId) { setExpandedId(null); return; }
    setExpandedId(promoId);
    await fetchWinners(promoId);
  };

  // ── Participantes ──
  const handleViewParticipants = async (promo: Promotion) => {
    setParticipantsPromo(promo);
    setParticipants([]);
    setLoadingParticipants(true);
    const endDate = promo.end_date || new Date().toISOString().split("T")[0];

    if (promo.eligibility_mode === "paid") {
      const { data } = await supabase
        .from("payments")
        .select("client_id, clients(name)")
        .eq("user_id", user!.id)
        .eq("status", "paid")
        .gte("created_at", `${promo.start_date}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`);
      const seen = new Set<string>();
      const unique: Participant[] = [];
      for (const p of (data || [])) {
        if (p.client_id && !seen.has(p.client_id)) {
          seen.add(p.client_id);
          unique.push({ id: p.client_id, name: (p as any).clients?.name || "—" });
        }
      }
      setParticipants(unique);
    } else {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .gte("due_date", promo.start_date);
      setParticipants((data || []).map((c: any) => ({ id: c.id, name: c.name })));
    }
    setLoadingParticipants(false);
  };

  // ── Badges / helpers ──
  const statusBadge = (promo: Promotion) => {
    if (promo.drawn_at) return (
      <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/30 flex items-center gap-1">
        <Trophy className="h-3 w-3" /> Sorteado
      </Badge>
    );
    if (!promo.is_active) return <Badge variant="secondary">Inativa</Badge>;
    const today = new Date().toISOString().split("T")[0];
    if (promo.end_date && promo.end_date < today) return <Badge variant="outline" className="text-muted-foreground">Encerrada</Badge>;
    return <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Ativa</Badge>;
  };

  const eligibilityLabel = (mode: string) => mode === "paid" ? "Pagamento no período" : "Clientes ativos";
  const canDraw = (promo: Promotion) => !promo.drawn_at && promo.is_active;

  // ── Modal title ──
  const modalTitle = editingPromo ? "Editar Promoção" : "Nova Promoção";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Promoções</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Promoção
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Suas Promoções</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : promotions.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Ticket className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground">Nenhuma promoção cadastrada.</p>
              <p className="text-xs text-muted-foreground/60">Crie sua primeira promoção para começar a sortear prêmios!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promotions.map((promo) => (
                <div key={promo.id} className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{promo.name}</span>
                        {statusBadge(promo)}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Gift className="h-3 w-3" />{promo.discount_percent}% de desconto</span>
                        <span className="flex items-center gap-1"><Trophy className="h-3 w-3" />{promo.prize_count} prêmio(s)</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{eligibilityLabel(promo.eligibility_mode)}</span>
                        <span>
                          {format(new Date(promo.start_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                          {promo.end_date ? ` → ${format(new Date(promo.end_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}` : " → sem fim"}
                        </span>
                        {promo.drawn_at && (
                          <span className="text-purple-500">
                            Sorteado em {format(new Date(promo.drawn_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* Ver participantes — só para não sorteadas */}
                      {!promo.drawn_at && (
                        <Button size="sm" variant="outline" onClick={() => handleViewParticipants(promo)}>
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Participantes
                        </Button>
                      )}

                      {/* Sorteio */}
                      {canDraw(promo) && (
                        <Button
                          size="sm"
                          onClick={() => setDrawConfirmPromo(promo)}
                          disabled={drawingId === promo.id}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          {drawingId === promo.id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sorteando...</>
                          ) : (
                            <><Trophy className="h-3.5 w-3.5 mr-1.5" />Realizar Sorteio</>
                          )}
                        </Button>
                      )}

                      {/* Ver ganhadores (pós-sorteio) */}
                      {promo.drawn_at && (
                        <Button size="sm" variant="outline" onClick={() => handleExpand(promo.id)}>
                          {expandedId === promo.id
                            ? <><ChevronUp className="h-3.5 w-3.5 mr-1.5" />Ocultar</>
                            : <><ChevronDown className="h-3.5 w-3.5 mr-1.5" />Ver ganhadores</>}
                        </Button>
                      )}

                      {/* Editar — não aparece para promoções já sorteadas */}
                      {!promo.drawn_at && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(promo)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Remover */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(promo.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Ganhadores expandidos */}
                  {expandedId === promo.id && (
                    <div className="border-t border-border/50 bg-muted/20 p-4">
                      {loadingWinners === promo.id ? (
                        <p className="text-sm text-muted-foreground text-center py-2">Carregando ganhadores...</p>
                      ) : !winners[promo.id]?.length ? (
                        <p className="text-sm text-muted-foreground text-center py-2">Nenhum ganhador registrado.</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                            {winners[promo.id].length} ganhador(es)
                          </p>
                          <div className="hidden md:block">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Cliente</TableHead>
                                  <TableHead>Desconto</TableHead>
                                  <TableHead>Sorteado em</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {winners[promo.id].map((w, i) => (
                                  <TableRow key={w.id}>
                                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                                    <TableCell className="font-medium">{w.client_name}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="text-green-600 border-green-500/30">{w.discount_percent}% off</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {format(new Date(w.drawn_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="space-y-2 md:hidden">
                            {winners[promo.id].map((w, i) => (
                              <div key={w.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/30">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                                  <span className="text-sm font-medium">{w.client_name}</span>
                                </div>
                                <Badge variant="outline" className="text-green-600 border-green-500/30 text-xs">{w.discount_percent}% off</Badge>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ MODAL CRIAR / EDITAR ═══ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="col-span-2 space-y-2">
              <Label>Nome da promoção *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Ex: Sorteio de Março" />
            </div>

            <div className="space-y-2">
              <Label>Desconto (%) *</Label>
              <Input type="number" min="1" max="100" step="1" value={form.discount_percent} onChange={e => setField("discount_percent", e.target.value)} placeholder="Ex: 20" />
            </div>

            <div className="space-y-2">
              <Label>Quantidade de prêmios *</Label>
              <Input type="number" min="1" value={form.prize_count} onChange={e => setField("prize_count", e.target.value)} placeholder="Ex: 10" />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Critério de participação</Label>
              <Select value={form.eligibility_mode} onValueChange={v => setField("eligibility_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Clientes que pagaram no período</SelectItem>
                  <SelectItem value="active">Clientes ativos no período</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.eligibility_mode === "paid"
                  ? "Participam clientes com pagamento confirmado dentro das datas da promoção."
                  : "Participam todos os clientes ativos com vencimento dentro das datas da promoção."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Data início *</Label>
              <Input type="date" value={form.start_date} onChange={e => setField("start_date", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Data fim</Label>
              <Input type="date" value={form.end_date} onChange={e => setField("end_date", e.target.value)} min={form.start_date} />
              <p className="text-xs text-muted-foreground">Deixe vazio para promoção sem prazo.</p>
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setField("is_active", v)} />
              <Label>Promoção ativa</Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPromo ? "Salvar alterações" : "Criar Promoção"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL PARTICIPANTES ═══ */}
      <Dialog open={!!participantsPromo} onOpenChange={() => setParticipantsPromo(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Participantes — {participantsPromo?.name}
            </DialogTitle>
          </DialogHeader>
          {loadingParticipants ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : participants.length === 0 ? (
            <div className="text-center py-8 space-y-1">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">Nenhum participante elegível encontrado.</p>
              <p className="text-xs text-muted-foreground/60">
                {participantsPromo?.eligibility_mode === "paid"
                  ? "Nenhum cliente pagou dentro do período desta promoção."
                  : "Nenhum cliente ativo com vencimento dentro do período."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{participants.length}</span> cliente(s) participando
                </p>
                <Badge variant="outline" className="text-xs">
                  {participantsPromo?.eligibility_mode === "paid" ? "Pagaram no período" : "Ativos no período"}
                </Badge>
              </div>
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {participants.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <span className="text-xs text-muted-foreground w-6 shrink-0">{i + 1}.</span>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ CONFIRM SORTEIO ═══ */}
      <AlertDialog open={!!drawConfirmPromo} onOpenChange={() => setDrawConfirmPromo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-purple-500" />
              Realizar Sorteio
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p>Você está prestes a realizar o sorteio de:</p>
                <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Promoção:</span>
                    <span className="font-medium text-foreground">{drawConfirmPromo?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prêmios:</span>
                    <span className="font-medium text-foreground">{drawConfirmPromo?.prize_count}x {drawConfirmPromo?.discount_percent}% de desconto</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita. O sorteio será realizado uma única vez.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDraw} className="bg-purple-600 hover:bg-purple-700">
              <Trophy className="h-4 w-4 mr-2" />
              Sortear agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ CONFIRM DELETE ═══ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover promoção?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os ganhadores dessa promoção também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
