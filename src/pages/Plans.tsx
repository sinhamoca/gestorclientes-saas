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
import { Plus, Edit, Trash2, Loader2, Search, ChevronDown, ChevronUp, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const PROVIDERS_WITH_PACKAGE = ["sigma", "painelfoda"];
const PROVIDERS_WITH_RUSH = ["rush"];

interface PlanOption {
  id?: string;
  label: string;
  package_id: string;
  duration_months: number;
  num_screens: number;
  price: number;
  cost: number;
  rush_type: string;
  is_active: boolean;
  _tempId?: string; // for new unsaved options
}

const emptyOption = (): PlanOption => ({
  label: "",
  package_id: "",
  duration_months: "" as any,
  num_screens: "" as any,
  price: "" as any,
  cost: "" as any,
  rush_type: "",
  is_active: true,
  _tempId: crypto.randomUUID(),
});

const Plans = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPanelId, setFormPanelId] = useState("");
  const [options, setOptions] = useState<PlanOption[]>([emptyOption()]);

  // Sigma packages
  const [sigmaPackages, setSigmaPackages] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const [activeOptionIdx, setActiveOptionIdx] = useState<number | null>(null);

  const fetchPlans = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("plans")
      .select("*, code, panel_credentials:panel_credential_id(id, provider, label), plan_options(*), clients(count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPlans(data || []);
    setLoading(false);
  };

  const fetchPanels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("panel_credentials")
      .select("id, provider, label")
      .eq("user_id", user.id)
      .eq("is_active", true);
    setPanels(data || []);
  };

  useEffect(() => { fetchPlans(); fetchPanels(); }, [user]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (editing) {
      setFormName(editing.name);
      setFormPanelId(editing.panel_credential_id || "");
      // Load existing options
      const existingOptions = (editing.plan_options || []).map((o: any) => ({
        id: o.id,
        label: o.label || "",
        package_id: o.package_id || "",
        duration_months: o.duration_months || 1,
        num_screens: o.num_screens || 1,
        price: o.price || 0,
        cost: o.cost || 0,
        rush_type: o.rush_type || "",
        is_active: o.is_active !== false,
      }));
      setOptions(existingOptions.length > 0 ? existingOptions : [emptyOption()]);
    } else {
      setFormName("");
      setFormPanelId("");
      setOptions([emptyOption()]);
    }
    setSigmaPackages([]);
    setShowPackages(false);
    setActiveOptionIdx(null);
  }, [editing, modalOpen]);

  const selectedPanel = panels.find(p => p.id === formPanelId);
  const provider = selectedPanel?.provider || "";
  const needsPackageId = PROVIDERS_WITH_PACKAGE.includes(provider);
  const needsRushType = PROVIDERS_WITH_RUSH.includes(provider);

  // ─── Option Management ───
  const addOption = () => {
    setOptions(prev => [...prev, emptyOption()]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 1) return;
    setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, field: string, value: any) => {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o));
  };

  // ─── Sigma Packages ───
  const handleFetchPackages = async () => {
    if (!formPanelId || provider !== "sigma") return;
    setLoadingPackages(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sigma-packages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ credential_id: formPanelId }),
        }
      );
      const result = await res.json();
      if (result.success && result.packages) {
        setSigmaPackages(result.packages);
        setShowPackages(true);
      } else {
        toast({ title: "Erro", description: result.error || "Falha ao buscar pacotes", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
    setLoadingPackages(false);
  };

  const selectSigmaPackage = (pkg: any, idx: number) => {
    updateOption(idx, "package_id", pkg.id);
    if (!options[idx].label) {
      updateOption(idx, "label", `${pkg.name} (${pkg.connections} tela${pkg.connections > 1 ? "s" : ""})`);
    }
    if (pkg.connections) updateOption(idx, "num_screens", pkg.connections);
  };

  // ─── Save ───
  const handleSave = async () => {
    if (!user || !formName.trim()) return;
    if (options.some(o => !o.label.trim())) {
      toast({ title: "Preencha o nome de todas as opções", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      const planPayload: any = {
        user_id: user.id,
        name: formName.trim(),
        panel_credential_id: formPanelId || null,
        // Keep legacy fields from first option for backward compat
        duration_months: options[0]?.duration_months || 1,
        num_screens: options[0]?.num_screens || 1,
        package_id: options[0]?.package_id || null,
        rush_type: needsRushType ? (options[0]?.rush_type || "IPTV") : null,
      };

      let planId: string;

      if (editing) {
        const { error } = await supabase.from("plans").update(planPayload).eq("id", editing.id);
        if (error) throw error;
        planId = editing.id;
      } else {
        const { data, error } = await supabase.from("plans").insert(planPayload).select("id").single();
        if (error) throw error;
        planId = data.id;
      }

      // ─── Sync plan_options ───
      if (editing) {
        // Delete removed options
        const keepIds = options.filter(o => o.id).map(o => o.id);
        const existing = (editing.plan_options || []).map((o: any) => o.id);
        const toDelete = existing.filter((id: string) => !keepIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from("plan_options").delete().in("id", toDelete);
        }
      }

      // Upsert options
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const optPayload = {
          plan_id: planId,
          label: o.label.trim(),
          package_id: needsPackageId ? (o.package_id || null) : null,
          duration_months: o.duration_months || 1,
          num_screens: o.num_screens || 1,
          price: o.price || 0,
          cost: o.cost || 0,
          rush_type: needsRushType ? (o.rush_type || "IPTV") : null,
          is_active: o.is_active,
          sort_order: i,
        };

        if (o.id) {
          await supabase.from("plan_options").update(optPayload).eq("id", o.id);
        } else {
          await supabase.from("plan_options").insert(optPayload);
        }
      }

      toast({ title: editing ? "Plano atualizado" : "Plano criado" });
      setModalOpen(false);
      setEditing(null);
      fetchPlans();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("plans").delete().eq("id", deleteId);
    toast({ title: "Plano removido" });
    setDeleteId(null);
    fetchPlans();
  };

  const toggleExpand = (planId: string) => {
    setExpandedPlan(prev => prev === planId ? null : planId);
  };

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-muted-foreground">{plans.length} planos cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Plano
        </Button>
      </div>

      {/* ═══ DESKTOP TABLE ═══ */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="w-20">Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Painel</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead>Opções</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : plans.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum plano cadastrado</TableCell></TableRow>
            ) : plans.map(plan => {
              const optCount = plan.plan_options?.length || 0;
              const isExpanded = expandedPlan === plan.id;
              return (
                <TableRow key={plan.id} className="border-border/30">
                  <TableCell className="font-mono text-primary font-bold">{plan.code || "—"}</TableCell>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    {plan.panel_credentials ? (
                      <Badge variant="outline">{plan.panel_credentials.label || plan.panel_credentials.provider}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{plan.clients?.[0]?.count || 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs gap-1"
                      onClick={() => toggleExpand(plan.id)}
                    >
                      <Package className="h-3.5 w-3.5" />
                      {optCount} {optCount === 1 ? "opção" : "opções"}
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    {isExpanded && optCount > 0 && (
                      <div className="mt-2 space-y-1">
                        {plan.plan_options
                          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                          .map((opt: any) => (
                          <div key={opt.id} className="flex items-center gap-3 text-xs bg-muted/50 rounded px-2 py-1.5">
                            <span className="font-medium min-w-[140px]">{opt.label}</span>
                            <span className="text-muted-foreground">{opt.duration_months}m</span>
                            <span className="text-muted-foreground">{opt.num_screens}t</span>
                            <span className="text-primary font-medium">R${Number(opt.price).toFixed(2)}</span>
                            <span className="text-muted-foreground">custo R${Number(opt.cost).toFixed(2)}</span>
                            {opt.package_id && <Badge variant="secondary" className="text-[10px]">{opt.package_id}</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(plan); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(plan.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : plans.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum plano cadastrado</p>
        ) : plans.map(plan => {
          const optCount = plan.plan_options?.length || 0;
          const isExpanded = expandedPlan === plan.id;
          return (
            <div key={plan.id} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="font-mono shrink-0">{plan.code || "—"}</Badge>
                  <span className="font-medium truncate">{plan.name}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(plan); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(plan.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs">Painel:</span>
                {plan.panel_credentials ? (
                  <Badge variant="outline" className="text-xs">{plan.panel_credentials.label || plan.panel_credentials.provider}</Badge>
                ) : "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs">Clientes:</span>
                <Badge variant="secondary" className="text-xs">{plan.clients?.[0]?.count || 0}</Badge>
              </div>
              <Button
                variant="ghost" size="sm" className="w-full text-xs gap-1 justify-start"
                onClick={() => toggleExpand(plan.id)}
              >
                <Package className="h-3.5 w-3.5" />
                {optCount} {optCount === 1 ? "opção" : "opções"}
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              {isExpanded && plan.plan_options?.length > 0 && (
                <div className="space-y-1.5">
                  {plan.plan_options
                    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                    .map((opt: any) => (
                    <div key={opt.id} className="bg-muted/50 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-primary font-bold">R${Number(opt.price).toFixed(2)}</span>
                      </div>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>{opt.duration_months} {opt.duration_months === 1 ? "mês" : "meses"}</span>
                        <span>{opt.num_screens} {opt.num_screens === 1 ? "tela" : "telas"}</span>
                        <span>custo R${Number(opt.cost).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ PLAN MODAL ═══ */}
      <Dialog open={modalOpen} onOpenChange={() => { setModalOpen(false); setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader><DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
          <div className="space-y-5 mt-4">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label>Nome do Plano *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Star Play" />
            </div>

            {/* Panel */}
            <div className="space-y-2">
              <Label>Painel IPTV</Label>
              <Select value={formPanelId} onValueChange={v => { setFormPanelId(v); setSigmaPackages([]); setShowPackages(false); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar painel (opcional)" /></SelectTrigger>
                <SelectContent>
                  {panels.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label || p.provider} ({p.provider})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sigma: buscar pacotes */}
            {provider === "sigma" && (
              <Button type="button" variant="outline" size="sm" onClick={handleFetchPackages} disabled={loadingPackages}>
                {loadingPackages ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Buscar pacotes do Sigma
              </Button>
            )}

            {/* ═══ OPTIONS ═══ */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Label className="text-base font-semibold">Opções do Plano</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar opção
                </Button>
              </div>

              {options.map((opt, idx) => (
                <div key={opt.id || opt._tempId} className="border rounded-lg p-4 space-y-3 bg-muted/20 relative">
                  {options.length > 1 && (
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="absolute top-2 right-2 h-7 w-7 hover:text-destructive"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <div className="text-xs font-medium text-muted-foreground mb-1">Opção {idx + 1}</div>

                  {/* Label */}
                  <div className="space-y-1">
                    <Label className="text-xs">Nome da opção *</Label>
                    <Input
                      value={opt.label}
                      onChange={e => updateOption(idx, "label", e.target.value)}
                      placeholder="Ex: Mensal 1 Tela"
                      className="h-9"
                    />
                  </div>

                  {/* Package ID (sigma/painelfoda) */}
                  {needsPackageId && (
                    <div className="space-y-1">
                      <Label className="text-xs">Package ID</Label>
                      <div className="flex gap-2">
                        <Input
                          value={opt.package_id}
                          onChange={e => updateOption(idx, "package_id", e.target.value)}
                          placeholder="Ex: XYgD9JWr6V"
                          className="h-9"
                        />
                      </div>
                      {/* Sigma packages selector */}
                      {showPackages && sigmaPackages.length > 0 && activeOptionIdx === idx && (
                        <div className="border rounded-lg p-2 max-h-36 overflow-y-auto space-y-0.5 mt-1">
                          {sigmaPackages.map((pkg: any) => (
                            <button
                              key={pkg.id}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent ${opt.package_id === pkg.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                              onClick={() => selectSigmaPackage(pkg, idx)}
                            >
                              <span className="font-mono">{pkg.id}</span> — {pkg.name} ({pkg.connections}t)
                            </button>
                          ))}
                        </div>
                      )}
                      {showPackages && sigmaPackages.length > 0 && activeOptionIdx !== idx && (
                        <Button type="button" variant="link" size="sm" className="text-xs p-0 h-auto"
                          onClick={() => setActiveOptionIdx(idx)}>
                          Selecionar pacote...
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Rush type */}
                  {needsRushType && (
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo Rush</Label>
                      <Select value={opt.rush_type || "IPTV"} onValueChange={v => updateOption(idx, "rush_type", v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IPTV">IPTV</SelectItem>
                          <SelectItem value="P2P">P2P</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Duration + Screens + Price + Cost */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Duração (meses)</Label>
                      <Input
                        type="number" min="1" className="h-9"
                        value={opt.duration_months}
                        onChange={e => updateOption(idx, "duration_months", e.target.value === "" ? "" : parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nº Telas</Label>
                      <Input
                        type="number" min="1" className="h-9"
                        value={opt.num_screens}
                        onChange={e => updateOption(idx, "num_screens", e.target.value === "" ? "" : parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input
                        type="number" min="0" step="0.01" className="h-9"
                        value={opt.price}
                        onChange={e => updateOption(idx, "price", e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Custo (R$)</Label>
                      <Input
                        type="number" min="0" step="0.01" className="h-9"
                        value={opt.cost}
                        onChange={e => updateOption(idx, "cost", e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>
              ))}
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

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover plano?</AlertDialogTitle>
            <AlertDialogDescription>As opções do plano também serão removidas. Clientes associados ficarão sem plano.</AlertDialogDescription>
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

export default Plans;
