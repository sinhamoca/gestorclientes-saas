import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { decryptValues } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Loader2, Link2, RefreshCw, MessageCircle, Send, History, ChevronLeft, ChevronRight, Tv, MoreHorizontal } from "lucide-react";
import { ClientModal } from "@/components/ClientModal";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  name: string;
  whatsapp_number: string | null;
  is_active: boolean;
  due_date: string | null;
  price_value: number;
  username: string | null;
  plan_id: string | null;
  plan_option_id: string | null;
  server_id: string | null;
  payment_token: string | null;
  payment_type: string | null;
  plans: { name: string; duration_months: number; panel_credential_id: string | null; panel_credentials: { id: string; label: string; provider: string } | null } | null;
  plan_options: { duration_months: number; num_screens: number; label: string; price: number } | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  mp_status: string | null;
  created_at: string;
}

const PAGE_SIZE = 10;

const Clients = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewingIptvId, setRenewingIptvId] = useState<string | null>(null);
  const [iptvConfirmClient, setIptvConfirmClient] = useState<Client | null>(null);
  const [renewConfirmClient, setRenewConfirmClient] = useState<Client | null>(null);
  const [panelCredentials, setPanelCredentials] = useState<{ id: string; provider: string; label: string }[]>([]);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [wuzapiConfigured, setWuzapiConfigured] = useState(false);
  const [pixKey, setPixKey] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [panelFilter, setPanelFilter] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("*, plans(name, duration_months, panel_credential_id, panel_credentials(id, label, provider)), plan_options(duration_months, num_screens, label, price)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      // Decrypt all WhatsApp numbers in batch
      const encryptedNumbers = data.map((c: any) => c.whatsapp_number).filter(Boolean);
      if (encryptedNumbers.length > 0) {
        try {
          const decrypted = await decryptValues(encryptedNumbers);
          let idx = 0;
          for (const c of data as any[]) {
            if (c.whatsapp_number) {
              c.whatsapp_number = decrypted[idx++];
            }
          }
        } catch (e) {
          console.error("Failed to decrypt WhatsApp numbers:", e);
        }
      }
    }

    setClients((data as any) || []);
    setLoading(false);
  };

  // Check WhatsApp status + fetch PIX key + panels
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key")
        .eq("user_id", user.id)
        .single();
      if (profile?.wuzapi_url && profile?.wuzapi_token) {
        setWuzapiConfigured(true);
        try {
          const { data } = await supabase.functions.invoke("wuzapi-proxy", {
            body: { endpoint: "/session/status", method: "GET" },
          });
          const parsed = typeof data?.wuzapi_response === "string" ? JSON.parse(data.wuzapi_response) : data?.wuzapi_response;
          setWhatsappConnected(parsed?.data?.connected === true || parsed?.data?.Connected === true);
        } catch { /* ignore */ }
      }
      if (profile?.pix_key) setPixKey(profile.pix_key);

      const { data: creds } = await supabase
        .from("panel_credentials")
        .select("id, provider, label")
        .eq("user_id", user.id);
      setPanelCredentials(creds || []);
    };
    init();
  }, [user]);

  useEffect(() => { fetchClients(); }, [user]);

  const getStatus = (client: Client) => {
    if (!client.is_active) return { label: "Inativo", variant: "secondary" as const, key: "inactive" };
    if (!client.due_date) return { label: "Ativo", variant: "default" as const, key: "active" };
    const [y, m, d] = client.due_date.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    if (due < now) return { label: "Vencido", variant: "destructive" as const, key: "expired" };
    const in7 = new Date(now.getTime() + 7 * 86400000);
    if (due <= in7) return { label: "Vencendo", variant: "outline" as const, key: "expiring" };
    return { label: "Ativo", variant: "default" as const, key: "active" };
  };

  const normalize = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtered = useMemo(() => {
    const term = normalize(search);
    let result = clients.filter(c =>
      normalize(c.name).includes(term) ||
      c.whatsapp_number?.includes(search) ||
      normalize(c.username || "").includes(term)
    );

    if (statusFilter !== "all") {
      result = result.filter(c => {
        const s = getStatus(c).key;
        if (statusFilter === "active") return s === "active" || s === "expiring";
        if (statusFilter === "expired") return s === "expired";
        if (statusFilter === "inactive") return s === "inactive";
        return true;
      });
    }

    if (panelFilter !== "all") {
      result = result.filter(c => {
        if (panelFilter === "none") return !c.plans?.panel_credential_id;
        return c.plans?.panel_credential_id === panelFilter;
      });
    }

    return result;
  }, [clients, search, statusFilter, panelFilter]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, panelFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedClients = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("clients").delete().eq("id", deleteId);
    toast({ title: "Cliente removido" });
    setDeleteId(null);
    fetchClients();
  };

  const handleRenew = async (client: Client) => {
    setRenewingId(client.id);
    const durationMonths = client.plan_options?.duration_months || client.plans?.duration_months || 1;
    const now = new Date();
    let baseDate: Date;

    if (client.due_date) {
      const [y, m, d] = client.due_date.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      baseDate = due < now ? now : due;
    } else {
      baseDate = now;
    }

    baseDate.setMonth(baseDate.getMonth() + durationMonths);
    const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

    const { error } = await supabase
      .from("clients")
      .update({ due_date: newDue, is_active: true })
      .eq("id", client.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      // Registrar pagamento
      await supabase.from("payments").insert({
        user_id: user!.id,
        client_id: client.id,
        amount: Number(client.price_value || 0),
        status: "paid",
        payment_method: "manual",
      });
      toast({ title: "Cliente renovado!", description: `Novo vencimento: ${newDue.split("-").reverse().join("/")}` });
      fetchClients();
    }
    setRenewingId(null);
  };

  const handleRenewIptv = async (client: Client) => {
    setRenewingIptvId(client.id);
    try {
      const { data, error } = await supabase.functions.invoke("renew-client", {
        body: { client_id: client.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        toast({ title: "IPTV renovado!", description: `Cliente ${client.name} renovado no painel IPTV.` });
      } else {
        toast({ title: "Erro na renovação IPTV", description: data?.error || "Falha ao renovar no painel", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setRenewingIptvId(null);
  };

  const handleSendInvoice = async (client: Client) => {
    if (!client.whatsapp_number) {
      toast({ title: "Erro", description: "Cliente sem WhatsApp cadastrado", variant: "destructive" });
      return;
    }
    if (!whatsappConnected) {
      toast({ title: "WhatsApp desconectado", description: "Conecte o WhatsApp nas configurações antes de enviar", variant: "destructive" });
      return;
    }
    setSendingInvoice(client.id);
    try {
      let invoiceContent: string;

      if (client.payment_type === "pix") {
        if (!pixKey) {
          toast({ title: "Erro", description: "Chave PIX não configurada. Vá em Configurações para cadastrar.", variant: "destructive" });
          setSendingInvoice(null);
          return;
        }
        invoiceContent = pixKey;
      } else {
        if (!client.payment_token) {
          toast({ title: "Erro", description: "Cliente sem token de pagamento", variant: "destructive" });
          setSendingInvoice(null);
          return;
        }
        invoiceContent = `${window.location.origin}/pay/${client.payment_token}`;
      }

      const phone = client.whatsapp_number.replace(/\D/g, "");

      await supabase.functions.invoke("wuzapi-proxy", {
        body: {
          endpoint: "/chat/send/text",
          method: "POST",
          body: {
            Phone: phone,
            Body: invoiceContent,
          },
        },
      });
      toast({ title: "Fatura enviada!", description: `Enviado para ${client.whatsapp_number}` });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSendingInvoice(null);
  };

  const openHistory = async (client: Client) => {
    setHistoryClient(client);
    setLoadingPayments(true);
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    setPayments((data as Payment[]) || []);
    setLoadingPayments(false);
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      paid: { label: "Pago", variant: "default" },
      approved: { label: "Pago", variant: "default" },
      pending: { label: "Pendente", variant: "outline" },
      rejected: { label: "Rejeitado", variant: "destructive" },
      cancelled: { label: "Cancelado", variant: "secondary" },
    };
    return map[s] || { label: s, variant: "secondary" as const };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <Button onClick={() => { setEditingClient(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, WhatsApp ou username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="expired">Vencidos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={panelFilter} onValueChange={setPanelFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Painel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos painéis</SelectItem>
            <SelectItem value="none">Sem painel</SelectItem>
            {panelCredentials.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.label || p.provider}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Nome</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Painel</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedClients.map((client) => {
                const status = getStatus(client);
                const panelName = client.plans?.panel_credentials?.label || client.plans?.panel_credentials?.provider || "—";
                return (
                  <TableRow key={client.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell>
                      <div className="font-medium">{client.name}</div>
                      {client.whatsapp_number && (
                        <div className="text-xs text-muted-foreground">{client.whatsapp_number}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.plans?.name || "—"}</TableCell>
                    <TableCell>
                      {client.plans?.panel_credentials ? (
                        <Badge variant="outline" className="text-xs">{panelName}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.due_date ? (() => { const [y,m,d] = client.due_date!.split("-"); return `${d}/${m}/${y}`; })() : "—"}
                    </TableCell>
                    <TableCell>R$ {Number(client.price_value).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setRenewConfirmClient(client)} disabled={renewingId === client.id}>
                              {renewingId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Renovar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setIptvConfirmClient(client)} disabled={renewingIptvId === client.id}>
                              {renewingIptvId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tv className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Renovar IPTV</TooltipContent>
                        </Tooltip>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              if (client.whatsapp_number) {
                                window.open(`https://wa.me/${client.whatsapp_number.replace(/\D/g, "")}`, "_blank");
                              } else {
                                toast({ title: "Sem número", description: "Cliente não tem WhatsApp cadastrado", variant: "destructive" });
                              }
                            }}>
                              <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendInvoice(client)} disabled={sendingInvoice === client.id || !whatsappConnected}>
                              <Send className="h-4 w-4 mr-2" /> Enviar fatura
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openHistory(client)}>
                              <History className="h-4 w-4 mr-2" /> Histórico
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              const link = `${window.location.origin}/pay/${client.payment_token}`;
                              const textArea = document.createElement("textarea");
                              textArea.value = link;
                              textArea.style.position = "fixed";
                              textArea.style.left = "-9999px";
                              document.body.appendChild(textArea);
                              textArea.select();
                              document.execCommand("copy");
                              document.body.removeChild(textArea);
                              toast({ title: "Link copiado!", description: link });
                            }}>
                              <Link2 className="h-4 w-4 mr-2" /> Copiar link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setEditingClient(client); setModalOpen(true); }}>
                              <Edit className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteId(client.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* MOBILE: Cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : paginatedClients.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum cliente encontrado</p>
        ) : (
          paginatedClients.map((client) => {
            const status = getStatus(client);
            return (
              <div key={client.id} className="glass-card rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{client.name}</span>
                    <Badge variant={status.variant} className="shrink-0 text-xs">{status.label}</Badge>
                  </div>
                  <span className="font-bold text-primary shrink-0 ml-2">R$ {Number(client.price_value).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground text-xs">Plano</span><p className="truncate">{client.plans?.name || "—"}</p></div>
                  <div><span className="text-muted-foreground text-xs">Vencimento</span><p>{client.due_date ? (() => { const [y,m,d] = client.due_date!.split("-"); return `${d}/${m}/${y}`; })() : "—"}</p></div>
                  <div><span className="text-muted-foreground text-xs">Painel</span><p className="truncate">{client.plans?.panel_credentials?.label || client.plans?.panel_credentials?.provider || "—"}</p></div>
                  <div><span className="text-muted-foreground text-xs">WhatsApp</span><p className="truncate">{client.whatsapp_number || "—"}</p></div>
                </div>
                <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border/30">
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => setRenewConfirmClient(client)} disabled={renewingId === client.id}>
                      {renewingId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger><TooltipContent>Renovar</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => setIptvConfirmClient(client)} disabled={renewingIptvId === client.id}>
                      {renewingIptvId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tv className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger><TooltipContent>Renovar IPTV</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => { if (client.whatsapp_number) { window.open(`https://wa.me/${client.whatsapp_number.replace(/\D/g, "")}`, "_blank"); } else { toast({ title: "Sem número", description: "Cliente não tem WhatsApp cadastrado", variant: "destructive" }); } }}>
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleSendInvoice(client)} disabled={sendingInvoice === client.id || !whatsappConnected}>
                      {sendingInvoice === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger><TooltipContent>Enviar fatura</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => openHistory(client)}>
                      <History className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger><TooltipContent>Histórico</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => { const link = `${window.location.origin}/pay/${client.payment_token}`; const textArea = document.createElement("textarea"); textArea.value = link; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; document.body.appendChild(textArea); textArea.select(); document.execCommand("copy"); document.body.removeChild(textArea); toast({ title: "Link copiado!", description: link }); }}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger><TooltipContent>Copiar link</TooltipContent></Tooltip>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingClient(client); setModalOpen(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(client.id)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} clientes
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Página {currentPage} de {totalPages}</span>
            <Button
              variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ClientModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingClient(null); }}
        client={editingClient}
        onSaved={fetchClients}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renewal Confirmation Dialog */}
      <AlertDialog open={!!renewConfirmClient} onOpenChange={() => setRenewConfirmClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Renovação de Mensalidade</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                {renewConfirmClient && (() => {
                  const durationMonths = renewConfirmClient.plan_options?.duration_months || renewConfirmClient.plans?.duration_months || 1;
                  const now = new Date();
                  let baseDate: Date;
                  if (renewConfirmClient.due_date) {
                    const [y, m, d] = renewConfirmClient.due_date.split("-").map(Number);
                    const due = new Date(y, m - 1, d);
                    baseDate = due < now ? now : due;
                  } else {
                    baseDate = now;
                  }
                  const newDate = new Date(baseDate);
                  newDate.setMonth(newDate.getMonth() + durationMonths);
                  const newDueStr = `${String(newDate.getDate()).padStart(2, "0")}/${String(newDate.getMonth() + 1).padStart(2, "0")}/${newDate.getFullYear()}`;
                  return (
                    <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cliente:</span>
                        <span className="font-medium text-foreground">{renewConfirmClient.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plano:</span>
                        <span className="font-medium text-foreground">{renewConfirmClient.plans?.name || "Sem plano"}{renewConfirmClient.plan_options?.label ? ` (${renewConfirmClient.plan_options.label})` : ""}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duração:</span>
                        <span className="font-medium text-foreground">{durationMonths} {durationMonths === 1 ? "mês" : "meses"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento atual:</span>
                        <span className="font-medium text-foreground">{renewConfirmClient.due_date ? renewConfirmClient.due_date.split("-").reverse().join("/") : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Novo vencimento:</span>
                        <span className="font-medium text-primary">{newDueStr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="font-medium text-foreground">R$ {Number(renewConfirmClient.price_value).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (renewConfirmClient) {
                  handleRenew(renewConfirmClient);
                  setRenewConfirmClient(null);
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Renovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* IPTV Renewal Confirmation Dialog */}
      <AlertDialog open={!!iptvConfirmClient} onOpenChange={() => setIptvConfirmClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Renovação IPTV</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                {iptvConfirmClient && (() => {
                  const cred = panelCredentials.find(c => c.id === iptvConfirmClient.plans?.panel_credential_id);
                  return (
                    <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cliente:</span>
                        <span className="font-medium text-foreground">{iptvConfirmClient.name}</span>
                      </div>
                      {iptvConfirmClient.username && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Username/ID:</span>
                          <span className="font-medium text-foreground">{iptvConfirmClient.username}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plano:</span>
                        <span className="font-medium text-foreground">{iptvConfirmClient.plans?.name || "Sem plano"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duração:</span>
                        <span className="font-medium text-foreground">{iptvConfirmClient.plan_options?.duration_months || iptvConfirmClient.plans?.duration_months || 0} {(iptvConfirmClient.plan_options?.duration_months || iptvConfirmClient.plans?.duration_months || 0) === 1 ? "mês" : "meses"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Painel IPTV:</span>
                        <span className="font-medium text-foreground">{cred ? `${cred.label || cred.provider} (${cred.provider})` : "Não vinculado"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento atual:</span>
                        <span className="font-medium text-foreground">{iptvConfirmClient.due_date ? iptvConfirmClient.due_date.split("-").reverse().join("/") : "—"}</span>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-muted-foreground text-xs">Isso enviará o comando de renovação para o painel IPTV externo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (iptvConfirmClient) {
                  handleRenewIptv(iptvConfirmClient);
                  setIptvConfirmClient(null);
                }
              }}
            >
              <Tv className="h-4 w-4 mr-2" /> Renovar IPTV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment History Dialog */}
      <Dialog open={!!historyClient} onOpenChange={() => setHistoryClient(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Pagamentos — {historyClient?.name}</DialogTitle>
          </DialogHeader>
          {loadingPayments ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum pagamento registrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => {
                  const s = statusLabel(p.mp_status || p.status);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">R$ {Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-sm uppercase text-muted-foreground">{p.payment_method || "—"}</TableCell>
                      <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Clients;