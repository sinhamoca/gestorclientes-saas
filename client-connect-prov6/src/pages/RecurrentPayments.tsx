import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { decryptValues } from "@/lib/crypto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, RefreshCw, Link2, Send, XCircle, CreditCard, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface RecurrentClient {
  id: string;
  name: string;
  whatsapp_number: string | null;
  due_date: string | null;
  price_value: number;
  payment_token: string | null;
  asaas_subscription_status: string | null;
  asaas_next_billing_date: string | null;
  asaas_subscription_id: string | null;
  plans: { name: string } | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active:   { label: "Ativa",     variant: "default" },
  inactive: { label: "Inativa",   variant: "secondary" },
  none:     { label: "Sem cartão", variant: "outline" },
  overdue:  { label: "Inadimpl.", variant: "destructive" },
};

const RecurrentPayments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<RecurrentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<RecurrentClient | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [sendingLink, setSendingLink] = useState<string | null>(null);
  const [paymentsModal, setPaymentsModal] = useState<RecurrentClient | null>(null);
  const [asaasPayments, setAsaasPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("id, name, whatsapp_number, due_date, price_value, payment_token, asaas_subscription_status, asaas_next_billing_date, asaas_subscription_id, plans(name)")
      .eq("user_id", user.id)
      .eq("recurrent_payment", true)
      .order("name");
    const raw = (data as any) || [];
    // Descriptografar números
    try {
      const encrypted = raw.map((c: any) => c.whatsapp_number).filter(Boolean);
      if (encrypted.length > 0) {
        const decrypted = await decryptValues(encrypted);
        let idx = 0;
        raw.forEach((c: any) => {
          if (c.whatsapp_number) c.whatsapp_number = decrypted[idx++];
        });
      }
    } catch (e) {
      console.error("Failed to decrypt WhatsApp numbers:", e);
    }
    setClients(raw);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchClients();
    // Check WhatsApp
    supabase.from("profiles").select("wuzapi_url, wuzapi_token").eq("user_id", user.id).single()
      .then(async ({ data: profile }) => {
        if (!profile?.wuzapi_url) return;
        try {
          const { data } = await supabase.functions.invoke("wuzapi-proxy", {
            body: { endpoint: "/session/status", method: "GET" },
          });
          const parsed = typeof data?.wuzapi_response === "string" ? JSON.parse(data.wuzapi_response) : data?.wuzapi_response;
          setWhatsappConnected(parsed?.data?.connected === true || parsed?.data?.Connected === true);
        } catch {}
      });
  }, [user]);

  const openPayments = async (client: RecurrentClient) => {
    setPaymentsModal(client);
    setAsaasPayments([]);
    if (!client.asaas_subscription_id) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-create-subscription", {
        body: { action: "get_payments", subscription_id: client.asaas_subscription_id },
      });
      if (error) throw new Error(error.message);
      setAsaasPayments(data?.payments || []);
    } catch (e: any) {
      toast({ title: "Erro ao buscar pagamentos", description: e.message, variant: "destructive" });
    }
    setLoadingPayments(false);
  };

  const getCheckoutLink = (client: RecurrentClient) => {
    if (!client.payment_token) return null;
    return `${window.location.origin}/recorrente/${client.payment_token}`;
  };

  const copyLink = (client: RecurrentClient) => {
    const link = getCheckoutLink(client);
    if (!link) {
      toast({ title: "Erro", description: "Cliente sem token de pagamento", variant: "destructive" });
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = link;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast({ title: "Link copiado!", description: link });
  };

  const sendLinkWhatsApp = async (client: RecurrentClient) => {
    const link = getCheckoutLink(client);
    if (!link || !client.whatsapp_number) {
      toast({ title: "Erro", description: "Cliente sem WhatsApp ou token", variant: "destructive" });
      return;
    }
    if (!whatsappConnected) {
      toast({ title: "WhatsApp desconectado", description: "Conecte o WhatsApp nas configurações", variant: "destructive" });
      return;
    }
    setSendingLink(client.id);
    try {
      const phone = client.whatsapp_number.replace(/\D/g, "");
      const message = `Olá ${client.name}! Para ativar o pagamento automático do seu plano, acesse o link abaixo e cadastre seu cartão:\n\n${link}`;
      await supabase.functions.invoke("wuzapi-proxy", {
        body: { endpoint: "/chat/send/text", method: "POST", body: { Phone: phone, Body: message } },
      });
      toast({ title: "Link enviado!", description: `Enviado para ${client.name}` });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSendingLink(null);
  };

  const handleCancelRecurrence = async () => {
    if (!cancelTarget) return;
    setCanceling(true);
    try {
      // Cancelar subscription no Asaas se existir
      if (cancelTarget.asaas_subscription_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("asaas_api_key, asaas_sandbox")
          .eq("user_id", user!.id)
          .single();
        if (profile?.asaas_api_key) {
          const baseUrl = profile.asaas_sandbox
            ? "https://sandbox.asaas.com/v3"
            : "https://api.asaas.com/v3";
          await fetch(`${baseUrl}/subscriptions/${cancelTarget.asaas_subscription_id}`, {
            method: "DELETE",
            headers: { access_token: profile.asaas_api_key },
          });
        }
      }
      // Atualizar cliente: desativar recorrência
      await supabase.from("clients").update({
        recurrent_payment: false,
        asaas_subscription_status: "inactive",
      }).eq("id", cancelTarget.id);

      toast({ title: "Recorrência cancelada", description: `${cancelTarget.name} voltará ao fluxo normal de lembretes.` });
      fetchClients();
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" });
    }
    setCanceling(false);
    setCancelTarget(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const getSubscriptionStatus = (client: RecurrentClient) => {
    const s = client.asaas_subscription_status || "none";
    return statusConfig[s] || { label: s, variant: "secondary" as const };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="h-6 w-6 text-primary" />
          Pagamento Recorrente
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {clients.length} cliente{clients.length !== 1 ? "s" : ""} com cobrança automática ativa
        </p>
      </div>

      {/* Info banner */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como funciona</p>
        <p>Clientes com pagamento recorrente recebem o <strong>template recorrente</strong> nos lembretes pré-vencimento (cobrança automática em andamento). Se o cartão for recusado, passam a receber os lembretes normais após o vencimento.</p>
        <p>Envie o link de cadastro do cartão ao cliente via WhatsApp para ativar a cobrança automática.</p>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status Assinatura</TableHead>
              <TableHead>Próx. Cobrança</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhum cliente com pagamento recorrente ativo.<br />
                  <span className="text-xs">Ative a opção "Pagamento Recorrente" no cadastro do cliente.</span>
                </TableCell>
              </TableRow>
            ) : clients.map(client => {
              const st = getSubscriptionStatus(client);
              return (
                <TableRow key={client.id} className="border-border/30 hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium">{client.name}</div>
                    {client.whatsapp_number && (
                      <div className="text-xs text-muted-foreground">{client.whatsapp_number}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{client.plans?.name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(client.due_date)}</TableCell>
                  <TableCell>R$ {Number(client.price_value).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(client.asaas_next_billing_date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openPayments(client)}>
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ver cobranças</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => copyLink(client)}>
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copiar link do cartão</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => sendLinkWhatsApp(client)}
                            disabled={sendingLink === client.id || !client.whatsapp_number}
                          >
                            {sendingLink === client.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Send className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Enviar link via WhatsApp</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setCancelTarget(client)}
                            className="hover:text-destructive"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Cancelar recorrência</TooltipContent>
                      </Tooltip>
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
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : clients.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground text-sm">
            Nenhum cliente com pagamento recorrente ativo.
          </p>
        ) : clients.map(client => {
          const st = getSubscriptionStatus(client);
          return (
            <div key={client.id} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{client.name}</span>
                  {client.whatsapp_number && (
                    <p className="text-xs text-muted-foreground">{client.whatsapp_number}</p>
                  )}
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-muted-foreground text-xs">Plano</span><p>{client.plans?.name || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Valor</span><p>R$ {Number(client.price_value).toFixed(2)}</p></div>
                <div><span className="text-muted-foreground text-xs">Vencimento</span><p>{formatDate(client.due_date)}</p></div>
                <div><span className="text-muted-foreground text-xs">Próx. Cobrança</span><p>{formatDate(client.asaas_next_billing_date)}</p></div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border/30">
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => copyLink(client)}>
                  <Link2 className="h-3.5 w-3.5" /> Copiar link
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => sendLinkWhatsApp(client)} disabled={sendingLink === client.id || !client.whatsapp_number}>
                  {sendingLink === client.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCancelTarget(client)} className="text-destructive hover:bg-destructive/10">
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>


      {/* Payments Modal */}
      <Dialog open={!!paymentsModal} onOpenChange={() => setPaymentsModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Cobranças — {paymentsModal?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {loadingPayments ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : asaasPayments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma cobrança encontrada.</p>
            ) : asaasPayments.map((p: any) => {
              const statusMap: Record<string, { label: string; icon: any; color: string }> = {
                CONFIRMED: { label: "Confirmado", icon: CheckCircle2, color: "text-green-500" },
                RECEIVED:  { label: "Recebido",   icon: CheckCircle2, color: "text-green-500" },
                PENDING:   { label: "Pendente",   icon: Clock,        color: "text-yellow-500" },
                OVERDUE:   { label: "Vencido",    icon: AlertCircle,  color: "text-red-500" },
                REFUNDED:  { label: "Estornado",  icon: AlertCircle,  color: "text-muted-foreground" },
              };
              const st = statusMap[p.status] || { label: p.status, icon: Clock, color: "text-muted-foreground" };
              const Icon = st.icon;
              const [y, m, d] = (p.dueDate || "").split("-");
              const dateFormatted = p.dueDate ? `${d}/${m}/${y}` : "—";
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${st.color}`} />
                    <div>
                      <p className="text-sm font-medium">{dateFormatted}</p>
                      {p.creditCard && (
                        <p className="text-xs text-muted-foreground">
                          {p.creditCard.creditCardBrand} •••• {p.creditCard.creditCardNumber}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">R$ {Number(p.value).toFixed(2)}</p>
                    <span className={`text-xs ${st.color}`}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recorrência?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>O cliente <strong>{cancelTarget?.name}</strong> terá a cobrança automática cancelada.</p>
                {cancelTarget?.asaas_subscription_id && (
                  <p className="text-xs text-muted-foreground">A assinatura será cancelada no Asaas automaticamente.</p>
                )}
                <p className="text-xs text-muted-foreground">O cliente voltará a receber os lembretes normais de cobrança.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelRecurrence}
              disabled={canceling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {canceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar recorrência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RecurrentPayments;
