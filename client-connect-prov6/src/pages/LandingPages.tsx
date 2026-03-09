import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Copy, ExternalLink, Pencil, Trash2, Loader2,
  Link2, Users, ToggleLeft, ToggleRight, Eye, RefreshCw,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────
interface PanelCredential {
  id: string;
  provider: string;
  label: string;
  domain?: string;
}

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  panel_credential_id: string | null;
  trial_config: Record<string, any>;
  html_content: string | null;
  is_active: boolean;
  created_at: string;
  panel_credentials?: PanelCredential | null;
  _leadsCount?: number;
}

interface Lead {
  id: string;
  name: string | null;
  status: string;
  trial_username: string | null;
  trial_password: string | null;
  provider: string | null;
  error_message: string | null;
  created_at: string;
}

interface SigmaPackage {
  id: string;
  name: string;
  server_id: string;
  server_name?: string;
  max_connections?: number;
  duration?: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  sigma: "Sigma",
  cloudnation: "CloudNation",
  koffice: "Koffice",
  uniplay: "Uniplay",
  club: "Club",
  rush: "Rush",
  painelfoda: "PainelFoda",
};

const TRIAL_PROVIDERS = ["sigma", "cloudnation", "koffice"];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent:    { label: "Enviado",  variant: "default" },
  pending: { label: "Pendente", variant: "secondary" },
  failed:  { label: "Falhou",   variant: "destructive" },
};

// ──────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────
export default function LandingPages() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [pages, setPages]         = useState<LandingPage[]>([]);
  const [panels, setPanels]       = useState<PanelCredential[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<LandingPage | null>(null);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  // Leads modal
  const [leadsModalOpen, setLeadsModalOpen] = useState(false);
  const [leadsPage, setLeadsPage]           = useState<LandingPage | null>(null);
  const [leads, setLeads]                   = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading]     = useState(false);
  const [deleteLeadId, setDeleteLeadId]     = useState<string | null>(null);

  // Sigma packages
  const [sigmaPackages, setSigmaPackages]       = useState<SigmaPackage[]>([]);
  const [loadingPackages, setLoadingPackages]   = useState(false);
  const [selectedPkgId, setSelectedPkgId]       = useState("");

  // Form state
  const [formName, setFormName]             = useState("");
  const [formSlug, setFormSlug]             = useState("");
  const [formPanelId, setFormPanelId]       = useState("");
  const [formActive, setFormActive]         = useState(true);
  const [formHtml, setFormHtml]             = useState("");
  const [formServerId, setFormServerId]     = useState("");
  const [formTrialPkg, setFormTrialPkg]     = useState("");
  const [formTrialHours, setFormTrialHours] = useState("1");
  const [formPlanoId, setFormPlanoId]       = useState("17");
  const [formExtraLabel, setFormExtraLabel] = useState("Link de acesso");
  const [formExtraValue, setFormExtraValue] = useState("");

  // ── Data fetching ──────────────────────────────────────────
  const fetchPages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("landing_pages")
      .select("*, panel_credentials:panel_credential_id(id, provider, label, domain)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const ids = data.map((p: LandingPage) => p.id);
      const { data: leadsData } = await supabase
        .from("landing_page_leads")
        .select("landing_page_id")
        .in("landing_page_id", ids);

      const countMap: Record<string, number> = {};
      (leadsData || []).forEach((l: any) => {
        countMap[l.landing_page_id] = (countMap[l.landing_page_id] || 0) + 1;
      });

      setPages(data.map((p: LandingPage) => ({ ...p, _leadsCount: countMap[p.id] || 0 })));
    }
    setLoading(false);
  };

  const fetchPanels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("panel_credentials")
      .select("id, provider, label, domain")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("provider", TRIAL_PROVIDERS);
    setPanels(data || []);
  };

  useEffect(() => { fetchPages(); fetchPanels(); }, [user]);

  // ── Sigma packages fetch ───────────────────────────────────
  const fetchSigmaPackages = async () => {
    if (!formPanelId) return;
    setLoadingPackages(true);
    setSigmaPackages([]);
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
        toast({ title: `${result.packages.length} pacotes encontrados` });
      } else {
        toast({ title: "Erro ao buscar pacotes", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
    setLoadingPackages(false);
  };

  const handleSelectSigmaPackage = (pkgId: string) => {
    setSelectedPkgId(pkgId);
    const pkg = sigmaPackages.find(p => p.id === pkgId);
    if (pkg) {
      setFormServerId(pkg.server_id);
      setFormTrialPkg(pkg.id);
    }
  };

  // ── Leads ──────────────────────────────────────────────────
  const openLeads = async (lp: LandingPage) => {
    setLeadsPage(lp);
    setLeadsModalOpen(true);
    setLeadsLoading(true);
    const { data } = await supabase
      .from("landing_page_leads")
      .select("id, name, status, trial_username, trial_password, provider, error_message, created_at")
      .eq("landing_page_id", lp.id)
      .order("created_at", { ascending: false });
    setLeads(data || []);
    setLeadsLoading(false);
  };

  const handleDeleteLead = async (leadId: string) => {
    const { error } = await supabase.from("landing_page_leads").delete().eq("id", leadId);
    if (error) {
      toast({ title: "Erro ao excluir lead", variant: "destructive" });
    } else {
      toast({ title: "Lead excluído — número liberado para novo teste" });
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setPages(prev => prev.map(p =>
        p.id === leadsPage?.id ? { ...p, _leadsCount: (p._leadsCount || 1) - 1 } : p
      ));
    }
    setDeleteLeadId(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  // ── Form helpers ───────────────────────────────────────────
  const selectedPanel = panels.find(p => p.id === formPanelId);
  const provider      = selectedPanel?.provider || "";

  const slugify = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const openCreate = () => {
    setEditing(null);
    setFormName(""); setFormSlug(""); setFormPanelId(""); setFormActive(true);
    setFormHtml(""); setFormServerId(""); setFormTrialPkg(""); setFormTrialHours("1");
    setFormPlanoId("17"); setFormExtraLabel("Link de acesso"); setFormExtraValue("");
    setSigmaPackages([]); setSelectedPkgId("");
    setModalOpen(true);
  };

  const openEdit = (lp: LandingPage) => {
    setEditing(lp);
    setFormName(lp.name);
    setFormSlug(lp.slug);
    setFormPanelId(lp.panel_credential_id || "");
    setFormActive(lp.is_active);
    setFormHtml(lp.html_content ? atob(lp.html_content) : "");
    const tc = lp.trial_config || {};
    setFormServerId(tc.server_id || "");
    setFormTrialPkg(tc.trial_package_id || "");
    setFormTrialHours(String(tc.trial_hours || 1));
    setFormPlanoId(tc.plano_id || "17");
    setFormExtraLabel(tc.extra_label || "Link de acesso");
    setFormExtraValue(tc.extra_value || "");
    setSigmaPackages([]); setSelectedPkgId(tc.trial_package_id || "");
    setModalOpen(true);
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !formName.trim() || !formSlug.trim()) {
      toast({ title: "Preencha nome e slug", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      let trial_config: Record<string, any> = {};
      if (provider === "sigma") {
        if (!formServerId || !formTrialPkg) {
          toast({ title: "Sigma requer server_id e package_id do trial", variant: "destructive" });
          setSaving(false); return;
        }
        trial_config = { server_id: formServerId, trial_package_id: formTrialPkg, trial_hours: parseInt(formTrialHours) };
      } else if (provider === "cloudnation") {
        trial_config = { plano_id: formPlanoId || "17" };
      }

      trial_config.extra_label = formExtraLabel.trim() || "Link de acesso";
      trial_config.extra_value = formExtraValue.trim();

      const payload: any = {
        user_id:             user.id,
        name:                formName.trim(),
        slug:                formSlug.trim(),
        panel_credential_id: formPanelId || null,
        trial_config,
        html_content:        formHtml.trim() ? btoa(unescape(encodeURIComponent(formHtml.trim()))) : null,
        is_active:           formActive,
      };

      if (editing) {
        const { error } = await supabase.from("landing_pages").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Landing page atualizada!" });
      } else {
        const { error } = await supabase.from("landing_pages").insert(payload);
        if (error) {
          if (error.code === "23505") {
            toast({ title: "Slug já em uso. Escolha outro.", variant: "destructive" });
            setSaving(false); return;
          }
          throw error;
        }
        toast({ title: "Landing page criada!" });
      }

      setModalOpen(false);
      fetchPages();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("landing_pages").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir", variant: "destructive" });
    else { toast({ title: "Landing page excluída" }); fetchPages(); }
    setDeleteId(null);
  };

  const toggleActive = async (lp: LandingPage) => {
    await supabase.from("landing_pages").update({ is_active: !lp.is_active }).eq("id", lp.id);
    fetchPages();
  };

  const getLpUrl = (slug: string) => `${window.location.origin.replace(/:5\d{3}/, "")}/lp/${slug}`;

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(getLpUrl(slug));
    toast({ title: "Link copiado!" });
  };

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Landing Pages</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie páginas de captação que geram testes IPTV automaticamente
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Nova Landing Page
          </Button>
        </div>

        {/* Tabela */}
        {pages.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <Link2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma landing page criada</p>
            <p className="text-sm mt-1">Crie sua primeira página e comece a captar leads</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Criar agora
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug / Link</TableHead>
                  <TableHead>Painel</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map(lp => (
                  <TableRow key={lp.id}>
                    <TableCell className="font-medium">{lp.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">{lp.slug}</code>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(lp.slug)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar link</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={getLpUrl(lp.slug)} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir página</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lp.panel_credentials ? (
                        <span className="text-sm">
                          {PROVIDER_LABELS[lp.panel_credentials.provider] || lp.panel_credentials.provider}
                          {lp.panel_credentials.label && (
                            <span className="text-muted-foreground ml-1">· {lp.panel_credentials.label}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        className="inline-flex items-center gap-1 text-sm hover:text-primary transition-colors"
                        onClick={() => openLeads(lp)}
                      >
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {lp._leadsCount}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <button onClick={() => toggleActive(lp)}>
                        {lp.is_active
                          ? <ToggleRight className="h-5 w-5 text-green-500" />
                          : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => openLeads(lp)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ver leads</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(lp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(lp.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Modal Leads ── */}
        <Dialog open={leadsModalOpen} onOpenChange={setLeadsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Leads — {leadsPage?.name}</DialogTitle>
            </DialogHeader>
            {leadsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum lead ainda</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Senha</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map(lead => {
                      const badge = STATUS_BADGE[lead.status] || { label: lead.status, variant: "outline" as const };
                      return (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium">
                            {lead.name || <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                              </TooltipTrigger>
                              {lead.error_message && (
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{lead.error_message}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {lead.trial_username
                              ? <code className="text-xs bg-muted px-2 py-0.5 rounded">{lead.trial_username}</code>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {lead.trial_password
                              ? <code className="text-xs bg-muted px-2 py-0.5 rounded">{lead.trial_password}</code>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(lead.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon"
                                  className="text-destructive hover:text-destructive h-7 w-7"
                                  onClick={() => setDeleteLeadId(lead.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Excluir lead (libera número para novo teste)</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm delete lead */}
        <Dialog open={!!deleteLeadId} onOpenChange={() => setDeleteLeadId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Excluir lead?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              O número será liberado e poderá gerar um novo teste nesta landing page.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteLeadId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => deleteLeadId && handleDeleteLead(deleteLeadId)}>Excluir</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Modal Criar/Editar LP ── */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Landing Page" : "Nova Landing Page"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome interno <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Ex: LP Sigma Jogos"
                  value={formName}
                  onChange={e => {
                    setFormName(e.target.value);
                    if (!editing) setFormSlug(slugify(e.target.value));
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Slug (URL) <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm whitespace-nowrap">/lp/</span>
                  <Input placeholder="minha-oferta" value={formSlug} onChange={e => setFormSlug(slugify(e.target.value))} />
                </div>
                {formSlug && (
                  <p className="text-xs text-muted-foreground">
                    Link: <span className="font-mono">{getLpUrl(formSlug)}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Painel IPTV</Label>
                <Select value={formPanelId} onValueChange={v => { setFormPanelId(v); setSigmaPackages([]); setSelectedPkgId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o painel para os testes" />
                  </SelectTrigger>
                  <SelectContent>
                    {panels.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {PROVIDER_LABELS[p.provider] || p.provider}
                        {p.label ? ` · ${p.label}` : ""}
                        {p.domain ? ` (${p.domain})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Config Sigma */}
              {provider === "sigma" && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Configuração Sigma</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchSigmaPackages}
                      disabled={loadingPackages || !formPanelId}
                    >
                      {loadingPackages
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Buscando...</>
                        : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Buscar pacotes</>}
                    </Button>
                  </div>

                  {/* Seletor de pacote (aparece após fetch) */}
                  {sigmaPackages.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Selecione o pacote de trial</Label>
                      <Select value={selectedPkgId} onValueChange={handleSelectSigmaPackage}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha o pacote..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sigmaPackages.map(pkg => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                              {pkg.name}
                              {pkg.max_connections ? ` · ${pkg.max_connections} tela(s)` : ""}
                              {pkg.duration ? ` · ${pkg.duration}h` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecionar um pacote preenche automaticamente server_id e package_id.
                      </p>
                    </div>
                  )}

                  {/* Campos manuais (sempre visíveis para edição) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">server_id <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="Ex: BV4D3rLaqZ"
                        value={formServerId}
                        onChange={e => setFormServerId(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">package_id do trial <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="Ex: rlKWO3lWzo"
                        value={formTrialPkg}
                        onChange={e => setFormTrialPkg(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Horas do trial</Label>
                    <Select value={formTrialHours} onValueChange={setFormTrialHours}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 6, 12].map(h => (
                          <SelectItem key={h} value={String(h)}>{h}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Config CloudNation */}
              {provider === "cloudnation" && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-semibold">Configuração CloudNation</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ID do plano de teste (plano_id)</Label>
                    <Input placeholder="17" value={formPlanoId} onChange={e => setFormPlanoId(e.target.value)} className="w-32 font-mono text-xs" />
                    <p className="text-xs text-muted-foreground">Padrão: 17 (3h)</p>
                  </div>
                </div>
              )}

              {/* Koffice */}
              {provider === "koffice" && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    ✅ Koffice usa automaticamente o domínio e credenciais do painel selecionado — nenhuma configuração extra necessária.
                  </p>
                </div>
              )}

              {/* Campo extra */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div>
                  <p className="text-sm font-semibold">Campo extra no card de sucesso</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aparece acima de Usuário/Senha após o teste ser gerado. Ex: link do app, endereço do servidor.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rótulo</Label>
                    <Input placeholder="Ex: Link de acesso" value={formExtraLabel} onChange={e => setFormExtraLabel(e.target.value)} className="text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor</Label>
                    <Input placeholder="Ex: http://app.starplay.tv" value={formExtraValue} onChange={e => setFormExtraValue(e.target.value)} className="text-xs font-mono" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Deixe o valor em branco para não exibir o campo.</p>
              </div>

              {/* HTML */}
              <div className="space-y-1.5">
                <Label>HTML da página</Label>
                <Textarea
                  placeholder={`Cole aqui o HTML completo da sua landing page.\n\nAdicione <div id="gestaopro-widget"></div> onde quer que o formulário apareça.`}
                  value={formHtml}
                  onChange={e => setFormHtml(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Adicione <code className="bg-muted px-1 rounded">&lt;div id="gestaopro-widget"&gt;&lt;/div&gt;</code> onde o formulário deve aparecer.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <Label>Página ativa</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Confirmar Delete LP */}
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Excluir landing page?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Todos os leads associados também serão excluídos. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Excluir</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
