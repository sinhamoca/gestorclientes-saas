import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus, Play, Pause, Trash2, Loader2, Upload, FileSpreadsheet, Send,
  CheckCircle2, AlertCircle, Clock, Megaphone, Image, Video, X, Eye,
  ChevronLeft, RotateCcw, MessageSquare, Users, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// Campaign contacts are stored as plain text (temporary external spreadsheet data)
// The send-campaigns edge function's decryptValue() gracefully handles plain text

// ═══════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════

interface Campaign {
  id: string;
  name: string;
  status: string;
  messages: string[];
  media_type: string | null;
  media_base64: string | null;
  schedule_times: string[];
  batch_size: number;
  messages_per_minute: number;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  last_batch_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CampaignContact {
  id: string;
  name: string;
  status: string;
  message_index: number | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();

  // List state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    messages: ["", "", ""],
    messageCount: 1,
    scheduleTimes: ["09:00"],
    batchSize: 25,
    messagesPerMinute: 3,
  });
  const [contacts, setContacts] = useState<{ name: string; whatsapp: string }[]>([]);
  const [contactFileName, setContactFileName] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Detail view
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null);
  const [contactLogs, setContactLogs] = useState<CampaignContact[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("all");

  // Edit config (inline in detail view)
  const [editConfig, setEditConfig] = useState({ scheduleTimes: ["09:00"], batchSize: 25, messagesPerMinute: 3 });
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ═══════════════════════════════════════════
  //  FETCH CAMPAIGNS
  // ═══════════════════════════════════════════

  const fetchCampaigns = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCampaigns((data as Campaign[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Auto-refresh every 30s if there's an active campaign
  useEffect(() => {
    const hasActive = campaigns.some(c => c.status === "active");
    if (!hasActive) return;
    const interval = setInterval(fetchCampaigns, 30000);
    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  // ═══════════════════════════════════════════
  //  FILE UPLOAD (contacts)
  // ═══════════════════════════════════════════

  const handleContactFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContactFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", codepage: 65001 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });

      // Try to find header row
      const parsed: { name: string; whatsapp: string }[] = [];
      let startRow = 0;

      // Check if first row is a header
      if (rows.length > 0) {
        const first = rows[0];
        const firstStr = String(first[0] || "").toLowerCase();
        if (firstStr.includes("nome") || firstStr.includes("cliente") || firstStr.includes("name")) {
          startRow = 1;
        }
      }

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[0] || "").trim();
        const whatsapp = String(row[1] || "").replace(/\D/g, "").trim();
        if (name && whatsapp) {
          parsed.push({ name, whatsapp });
        }
      }

      if (parsed.length === 0) {
        toast({ title: "Planilha sem contatos válidos", description: "Coluna A = nome, Coluna B = whatsapp", variant: "destructive" });
        return;
      }

      if (parsed.length > 10000) {
        toast({ title: "Máximo 10.000 contatos por campanha", variant: "destructive" });
        return;
      }

      setContacts(parsed);
      toast({ title: `${parsed.length} contatos carregados` });
    } catch (err: any) {
      toast({ title: "Erro ao ler planilha", description: err.message, variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ═══════════════════════════════════════════
  //  MEDIA UPLOAD
  // ═══════════════════════════════════════════

  const handleMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      toast({ title: "Formato não suportado", description: "Envie uma imagem ou vídeo", variant: "destructive" });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB para imagem, 15MB para vídeo", variant: "destructive" });
      return;
    }

    setMediaFile(file);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => setMediaPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setMediaPreview(null);
    }

    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
  };

  // ═══════════════════════════════════════════
  //  SCHEDULE TIME MANAGEMENT
  // ═══════════════════════════════════════════

  const addScheduleTime = () => {
    if (form.scheduleTimes.length >= 5) return;
    setForm(prev => ({
      ...prev,
      scheduleTimes: [...prev.scheduleTimes, "10:00"],
    }));
  };

  const removeScheduleTime = (idx: number) => {
    if (form.scheduleTimes.length <= 1) return;
    setForm(prev => ({
      ...prev,
      scheduleTimes: prev.scheduleTimes.filter((_, i) => i !== idx),
    }));
  };

  const updateScheduleTime = (idx: number, value: string) => {
    setForm(prev => ({
      ...prev,
      scheduleTimes: prev.scheduleTimes.map((t, i) => i === idx ? value : t),
    }));
  };

  // ═══════════════════════════════════════════
  //  CREATE CAMPAIGN
  // ═══════════════════════════════════════════

  const handleCreate = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast({ title: "Nome da campanha é obrigatório", variant: "destructive" });
      return;
    }
    if (contacts.length === 0) {
      toast({ title: "Carregue a planilha de contatos", variant: "destructive" });
      return;
    }

    const activeMessages = form.messages.slice(0, form.messageCount).filter(m => m.trim());
    if (activeMessages.length === 0) {
      toast({ title: "Escreva pelo menos 1 mensagem", variant: "destructive" });
      return;
    }

    setCreating(true);

    try {
      // 1. Convert media to base64 if present
      let mediaBase64: string | null = null;
      let mediaType: string | null = null;

      if (mediaFile) {
        mediaType = mediaFile.type.startsWith("image/") ? "image" : "video";

        // Limit: 5MB for images, 15MB for videos (base64 stored in DB)
        const maxSize = mediaType === "image" ? 5 * 1024 * 1024 : 15 * 1024 * 1024;
        if (mediaFile.size > maxSize) {
          throw new Error(`${mediaType === "image" ? "Imagem" : "Vídeo"} muito grande. Máximo: ${mediaType === "image" ? "5MB" : "15MB"}`);
        }

        mediaBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data:xxx;base64, prefix
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
          reader.readAsDataURL(mediaFile);
        });
      }

      // 2. Create campaign
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          status: "draft",
          messages: activeMessages,
          media_type: mediaType,
          media_base64: mediaBase64,
          schedule_times: form.scheduleTimes,
          batch_size: form.batchSize,
          messages_per_minute: form.messagesPerMinute,
          total_contacts: contacts.length,
          sent_count: 0,
          failed_count: 0,
        })
        .select("id")
        .single();

      if (campErr) throw campErr;

      // 3. Insert contacts in batches (plain text - decryptValue handles both)
      const batchSize = 500;

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        const rows = batch.map(c => ({
          campaign_id: campaign.id,
          name: c.name,
          whatsapp_encrypted: c.whatsapp,
          status: "pending",
        }));

        const { error: insertErr } = await supabase.from("campaign_contacts").insert(rows);
        if (insertErr) throw insertErr;
      }

      toast({ title: "Campanha criada!", description: "Ative para iniciar o envio." });
      resetForm();
      setCreateOpen(false);
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: "Erro ao criar campanha", description: e.message, variant: "destructive" });
    }

    setCreating(false);
  };

  const resetForm = () => {
    setForm({
      name: "",
      messages: ["", "", ""],
      messageCount: 1,
      scheduleTimes: ["09:00"],
      batchSize: 25,
      messagesPerMinute: 3,
    });
    setContacts([]);
    setContactFileName("");
    setMediaFile(null);
    setMediaPreview(null);
  };

  // ═══════════════════════════════════════════
  //  ACTIONS: activate, pause, delete
  // ═══════════════════════════════════════════

  const toggleStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await supabase.from("campaigns")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    toast({ title: newStatus === "active" ? "Campanha ativada!" : "Campanha pausada" });
    fetchCampaigns();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Delete contacts first (cascade should handle this, but be safe)
    await supabase.from("campaign_contacts").delete().eq("campaign_id", deleteId);
    await supabase.from("campaigns").delete().eq("id", deleteId);
    toast({ title: "Campanha removida" });
    setDeleteId(null);
    if (viewCampaign?.id === deleteId) setViewCampaign(null);
    fetchCampaigns();
  };

  // ═══════════════════════════════════════════
  //  VIEW CAMPAIGN DETAIL + LOGS
  // ═══════════════════════════════════════════

  const openCampaignDetail = async (campaign: Campaign) => {
    setViewCampaign(campaign);
    setEditConfig({
      scheduleTimes: campaign.schedule_times || ["09:00"],
      batchSize: campaign.batch_size || 25,
      messagesPerMinute: campaign.messages_per_minute || 3,
    });
    setLogFilter("all");
    await fetchContactLogs(campaign.id, "all");
  };

  const handleSaveConfig = async () => {
    if (!viewCampaign) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("campaigns")
      .update({
        schedule_times: editConfig.scheduleTimes,
        batch_size: editConfig.batchSize,
        messages_per_minute: editConfig.messagesPerMinute,
        updated_at: new Date().toISOString(),
      })
      .eq("id", viewCampaign.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva!" });
      fetchCampaigns();
    }
    setEditSaving(false);
  };

  const fetchContactLogs = async (campaignId: string, filter: string) => {
    setLoadingLogs(true);
    let query = supabase
      .from("campaign_contacts")
      .select("id, name, status, message_index, sent_at, error, created_at")
      .eq("campaign_id", campaignId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setContactLogs((data as CampaignContact[]) || []);
    setLoadingLogs(false);
  };

  const handleLogFilterChange = (filter: string) => {
    setLogFilter(filter);
    if (viewCampaign) {
      fetchContactLogs(viewCampaign.id, filter);
    }
  };

  // ═══════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════

  const statusLabel = (s: string) => {
    switch (s) {
      case "draft": return { label: "Rascunho", color: "bg-gray-500/10 text-gray-400" };
      case "active": return { label: "Ativa", color: "bg-green-500/10 text-green-500" };
      case "paused": return { label: "Pausada", color: "bg-yellow-500/10 text-yellow-500" };
      case "completed": return { label: "Concluída", color: "bg-blue-500/10 text-blue-500" };
      default: return { label: s, color: "bg-gray-500/10 text-gray-400" };
    }
  };

  const progressPercent = (c: Campaign) => {
    if (c.total_contacts === 0) return 0;
    return Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100);
  };

  const formatDateTime = (dt: string | null) => {
    if (!dt) return "-";
    const d = new Date(dt);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const estimateDays = () => {
    if (contacts.length === 0) return "-";
    const dailySends = form.scheduleTimes.length * form.batchSize;
    if (dailySends === 0) return "-";
    return Math.ceil(contacts.length / dailySends);
  };

  // ═══════════════════════════════════════════
  //  RENDER: DETAIL VIEW
  // ═══════════════════════════════════════════

  if (viewCampaign) {
    const camp = campaigns.find(c => c.id === viewCampaign.id) || viewCampaign;
    const st = statusLabel(camp.status);
    const pct = progressPercent(camp);
    const pending = camp.total_contacts - camp.sent_count - camp.failed_count;

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => setViewCampaign(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {camp.name}
              <Badge className={st.color}>{st.label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Criada em {formatDateTime(camp.created_at)}
              {camp.last_batch_at && ` · Último envio: ${formatDateTime(camp.last_batch_at)}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {(camp.status === "draft" || camp.status === "paused") && (
              <Button size="sm" onClick={() => toggleStatus(camp)}>
                <Play className="h-4 w-4 mr-1" /> Ativar
              </Button>
            )}
            {camp.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => toggleStatus(camp)}>
                <Pause className="h-4 w-4 mr-1" /> Pausar
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setDeleteId(camp.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{camp.total_contacts}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold text-green-500">{camp.sent_count}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
              <p className="text-2xl font-bold text-red-500">{camp.failed_count}</p>
              <p className="text-xs text-muted-foreground">Falhados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold text-yellow-500">{pending}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Config editable */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Configuração
              {editSaving && <Loader2 className="h-3 w-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Schedule times */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Horários de envio</Label>
              <div className="flex flex-wrap gap-2">
                {(editConfig.scheduleTimes || []).map((time: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={time}
                      onChange={e => {
                        const times = [...editConfig.scheduleTimes];
                        times[idx] = e.target.value;
                        setEditConfig((p: any) => ({ ...p, scheduleTimes: times }));
                      }}
                      className="w-28 h-8 text-sm"
                    />
                    {editConfig.scheduleTimes.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                        setEditConfig((p: any) => ({ ...p, scheduleTimes: p.scheduleTimes.filter((_: any, i: number) => i !== idx) }));
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {editConfig.scheduleTimes.length < 5 && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                    setEditConfig((p: any) => ({ ...p, scheduleTimes: [...p.scheduleTimes, "10:00"] }));
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Horário
                  </Button>
                )}
              </div>
            </div>

            {/* Batch + speed */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mensagens por lote</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={editConfig.batchSize}
                  onChange={e => setEditConfig((p: any) => ({ ...p, batchSize: parseInt(e.target.value) || 25 }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mensagens por minuto</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={editConfig.messagesPerMinute}
                  onChange={e => setEditConfig((p: any) => ({ ...p, messagesPerMinute: parseInt(e.target.value) || 3 }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Info row */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(camp.messages || []).length} variações de mensagem
                {camp.media_type && ` · ${camp.media_type === "image" ? "📷 Imagem" : "🎥 Vídeo"}`}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={editSaving}
                onClick={handleSaveConfig}
              >
                {editSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contact logs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">Log de Envio</h2>
            <div className="flex gap-1">
              {["all", "sent", "failed", "pending"].map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={logFilter === f ? "default" : "ghost"}
                  className="text-xs h-7 px-2"
                  onClick={() => handleLogFilterChange(f)}
                >
                  {f === "all" ? "Todos" : f === "sent" ? "Enviados" : f === "failed" ? "Falhados" : "Pendentes"}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => viewCampaign && fetchContactLogs(viewCampaign.id, logFilter)}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Msg</TableHead>
                  <TableHead className="text-xs">Enviado em</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLogs ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : contactLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum registro
                    </TableCell>
                  </TableRow>
                ) : contactLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-medium">{log.name}</TableCell>
                    <TableCell>
                      {log.status === "sent" && <Badge className="bg-green-500/10 text-green-500 text-xs">Enviado</Badge>}
                      {log.status === "failed" && <Badge className="bg-red-500/10 text-red-500 text-xs">Falhou</Badge>}
                      {log.status === "pending" && <Badge variant="outline" className="text-xs">Pendente</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.message_index != null ? `#${log.message_index + 1}` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.sent_at)}</TableCell>
                    <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{log.error || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {contactLogs.length >= 100 && (
            <p className="text-xs text-muted-foreground text-center">Mostrando últimos 100 registros</p>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os contatos e logs desta campanha serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  RENDER: CAMPAIGN LIST
  // ═══════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground text-sm">Envio em massa de mensagens via WhatsApp</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Nova Campanha</span>
        </Button>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center space-y-3">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhuma campanha criada ainda</p>
            <Button variant="outline" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Criar primeira campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map(camp => {
            const st = statusLabel(camp.status);
            const pct = progressPercent(camp);
            return (
              <Card
                key={camp.id}
                className="hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => openCampaignDetail(camp)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">{camp.name}</h3>
                        <Badge className={`${st.color} text-xs shrink-0`}>{st.label}</Badge>
                        {camp.media_type && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {camp.media_type === "image" ? <Image className="h-3 w-3 mr-1" /> : <Video className="h-3 w-3 mr-1" />}
                            Mídia
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {camp.total_contacts}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> {camp.sent_count}
                        </span>
                        {camp.failed_count > 0 && (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-red-500" /> {camp.failed_count}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {(camp.messages || []).length} msgs
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {(camp.schedule_times || []).join(", ")}
                        </span>
                      </div>
                      {camp.status !== "draft" && (
                        <div className="mt-2">
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {(camp.status === "draft" || camp.status === "paused") && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleStatus(camp)}>
                              <Play className="h-4 w-4 text-green-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ativar</TooltipContent>
                        </Tooltip>
                      )}
                      {camp.status === "active" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleStatus(camp)}>
                              <Pause className="h-4 w-4 text-yellow-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Pausar</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId(camp.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/*  CREATE CAMPAIGN DIALOG                     */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Nova Campanha
            </DialogTitle>
            <DialogDescription>Configure o envio em massa de mensagens</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2">
            <div className="space-y-6 pb-4">

              {/* Name */}
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input
                  placeholder="Ex: Promoção Janeiro"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Contacts upload */}
              <div className="space-y-2">
                <Label>Contatos (planilha)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {contacts.length > 0 ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span><strong>{contacts.length}</strong> contatos carregados</span>
                      <span className="text-muted-foreground">({contactFileName})</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Clique para selecionar. Coluna A = nome, Coluna B = whatsapp
                      </p>
                      <p className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleContactFile}
                />
              </div>

              {/* Messages */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Mensagens ({form.messageCount}/3)</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3].map(n => (
                      <Button
                        key={n}
                        size="sm"
                        variant={form.messageCount >= n ? "default" : "outline"}
                        className="h-7 w-7 p-0 text-xs"
                        onClick={() => setForm(p => ({ ...p, messageCount: n }))}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                {Array.from({ length: form.messageCount }).map((_, idx) => (
                  <div key={idx} className="space-y-1">
                    <p className="text-xs text-muted-foreground">Mensagem {idx + 1}</p>
                    <Textarea
                      placeholder={`Ex: {saudacao} {nome}! Temos uma promoção especial para você...`}
                      value={form.messages[idx]}
                      onChange={e => {
                        const msgs = [...form.messages];
                        msgs[idx] = e.target.value;
                        setForm(p => ({ ...p, messages: msgs }));
                      }}
                      rows={3}
                    />
                  </div>
                ))}

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => {
                    const idx = form.messageCount - 1;
                    const msgs = [...form.messages];
                    msgs[idx] = (msgs[idx] || "") + "{nome}";
                    setForm(p => ({ ...p, messages: msgs }));
                  }}>{"{nome}"}</Badge>
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => {
                    const idx = form.messageCount - 1;
                    const msgs = [...form.messages];
                    msgs[idx] = (msgs[idx] || "") + "{saudacao}";
                    setForm(p => ({ ...p, messages: msgs }));
                  }}>{"{saudacao}"}</Badge>
                </div>
              </div>

              {/* Media */}
              <div className="space-y-2">
                <Label>Mídia (opcional)</Label>
                {mediaFile ? (
                  <div className="border rounded-lg p-3 flex items-center gap-3">
                    {mediaPreview ? (
                      <img src={mediaPreview} alt="preview" className="h-16 w-16 object-cover rounded" />
                    ) : (
                      <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                        <Video className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mediaFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB ·
                        {mediaFile.type.startsWith("image") ? " Imagem" : " Vídeo"}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={removeMedia}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    <div className="flex items-center justify-center gap-3 text-muted-foreground">
                      <Image className="h-5 w-5" />
                      <span className="text-sm">Imagem (5MB) ou vídeo (15MB)</span>
                      <Video className="h-5 w-5" />
                    </div>
                  </div>
                )}
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleMediaFile}
                />
              </div>

              {/* Schedule */}
              <div className="space-y-3">
                <Label>Horários de envio</Label>
                {form.scheduleTimes.map((time, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={time}
                      onChange={e => updateScheduleTime(idx, e.target.value)}
                      className="w-32"
                    />
                    {form.scheduleTimes.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeScheduleTime(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.scheduleTimes.length < 5 && (
                  <Button size="sm" variant="outline" onClick={addScheduleTime}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar horário
                  </Button>
                )}
              </div>

              {/* Batch config */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mensagens por lote</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.batchSize}
                    onChange={e => setForm(p => ({ ...p, batchSize: parseInt(e.target.value) || 25 }))}
                  />
                  <p className="text-xs text-muted-foreground">Enviadas por horário</p>
                </div>
                <div className="space-y-2">
                  <Label>Mensagens por minuto</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.messagesPerMinute}
                    onChange={e => setForm(p => ({ ...p, messagesPerMinute: parseInt(e.target.value) || 3 }))}
                  />
                  <p className="text-xs text-muted-foreground">Velocidade de envio</p>
                </div>
              </div>

              {/* Estimate */}
              {contacts.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" /> Estimativa
                  </p>
                  <p className="text-muted-foreground">
                    {contacts.length} contatos × {form.scheduleTimes.length} envios/dia × {form.batchSize}/lote
                    = <strong className="text-foreground">~{estimateDays()} dias</strong> para completar
                  </p>
                  <p className="text-muted-foreground">
                    {form.scheduleTimes.length * form.batchSize} mensagens por dia nos horários {form.scheduleTimes.join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...</>
              ) : (
                <><Megaphone className="h-4 w-4 mr-2" /> Criar Campanha</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os contatos e logs serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
