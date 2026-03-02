import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, Calendar, User, FileText, Copy, CheckCircle2,
  QrCode, Package, History, XCircle, Clock, AlertCircle, CreditCard,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface PlanOption {
  id: string;
  label: string;
  duration_months: number;
  num_screens: number;
  price: number;
}

interface ClientPayment {
  name: string;
  price_value: number;
  due_date: string | null;
  is_active: boolean;
  payment_type: string | null;
  plan_option_id: string | null;
  plans: { name: string } | null;
  plan_options: PlanOption[];
}

interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  mp_payment_id: string | null;
}

const PublicPayment = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [client, setClient] = useState<ClientPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // PIX state
  const [pixData, setPixData] = useState<any>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card checkout state
  const [generatingCheckout, setGeneratingCheckout] = useState(false);

  // Plan option selection
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  // Payment history
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const paymentStatus = searchParams.get("status");

  // ─── Fetch client data ───
  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    const fetchClient = async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-payment?token=${token}`;
      const res = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      if (!res.ok) { setNotFound(true); } else {
        const data = await res.json();
        setClient(data);
        if (data.plan_option_id) {
          setSelectedOptionId(data.plan_option_id);
        } else if (data.plan_options?.length > 0) {
          setSelectedOptionId(data.plan_options[0].id);
        }
      }
      setLoading(false);
    };
    fetchClient();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [token]);

  // Derived prices
  const selectedOption = client?.plan_options?.find(o => o.id === selectedOptionId) || null;
  const basePrice = selectedOption?.price || client?.price_value || 0;

  // Trava de telas: cliente só pode selecionar opções com mesma quantidade de telas
  const clientOption = client?.plan_options?.find(o => o.id === client?.plan_option_id) || null;
  const lockedScreens = clientOption?.num_screens || null;

  // ─── PIX flow ───
  const pollPaymentStatus = (paymentId: number) => {
    setPolling(true);
    let attempts = 0;
    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPolling(false);
        return;
      }
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-payment`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ payment_id: paymentId, payment_token: token }),
        });
        const data = await res.json();
        if (data.status === "approved") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPolling(false);
          setPaymentConfirmed(true);
          toast({ title: "Pagamento confirmado!", description: "Seu plano foi renovado com sucesso." });
        }
      } catch { /* ignore */ }
    }, 5000);
  };

  const generatePix = async () => {
    if (!token) return;
    setGeneratingPix(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          payment_token: token,
          plan_option_id: selectedOptionId,
          payment_method: "pix",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPixData(data);
        setPixModalOpen(true);
        if (data.payment_id) pollPaymentStatus(data.payment_id);
      } else {
        toast({ title: "Erro", description: data.error || "Erro ao gerar PIX", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingPix(false);
  };

  const copyPixCode = () => {
    if (pixData?.pix?.qr_code) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(pixData.pix.qr_code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = pixData.pix.qr_code;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // ─── Card checkout (redirect) ───
  const generateCheckout = async () => {
    if (!token) return;
    setGeneratingCheckout(true);
    try {
      const backUrl = window.location.href.split("?")[0]; // URL atual sem query params
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          payment_token: token,
          plan_option_id: selectedOptionId,
          payment_method: "card",
          back_url: backUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.checkout_url) {
        // Redirecionar para a página de checkout do gateway
        window.location.href = data.checkout_url;
      } else {
        toast({ title: "Erro", description: data.error || "Erro ao gerar checkout", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingCheckout(false);
  };

  // ─── History ───
  const fetchHistory = async () => {
    if (!token) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-payment?token=${token}&history=true`;
      const res = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar o histórico.", variant: "destructive" });
    }
    setHistoryLoading(false);
  };

  // ─── Helpers ───
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (months: number) => {
    if (months === 1) return "1 mês";
    if (months === 12) return "1 ano";
    return `${months} meses`;
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

  const statusIcon = (s: string) => {
    if (s === "paid" || s === "approved") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (s === "pending") return <Clock className="h-3.5 w-3.5" />;
    return <XCircle className="h-3.5 w-3.5" />;
  };

  const methodLabel = (m: string | null) => {
    if (!m) return "—";
    const map: Record<string, string> = { pix: "PIX", credit_card: "Cartão de Crédito", debit_card: "Cartão de Débito", boleto: "Boleto" };
    return map[m] || m;
  };

  // ─── Render states ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <QrCode className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Link não encontrado</h1>
          <p className="text-muted-foreground text-sm">Este link de pagamento é inválido ou foi removido.</p>
        </div>
      </div>
    );
  }

  if (paymentConfirmed || paymentStatus === "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
          <h1 className="text-xl font-bold text-foreground">Pagamento Confirmado!</h1>
          <p className="text-muted-foreground text-sm">Seu pagamento foi processado com sucesso. Seu plano será renovado automaticamente.</p>
        </div>
      </div>
    );
  }

  const isExpired = client.due_date
    ? (() => { const [y, m, d] = client.due_date!.split("-").map(Number); return new Date(y, m - 1, d) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()); })()
    : false;

  const hasOptions = client.plan_options && client.plan_options.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="glass-card rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <QrCode className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-bold text-foreground">Fatura de Pagamento</h1>
        </div>

        {/* Client info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium text-foreground">{client.name}</p>
            </div>
          </div>

          {client.plans?.name && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="font-medium text-foreground">{client.plans.name}</p>
              </div>
            </div>
          )}

          {client.due_date && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className="font-medium text-foreground">{formatDate(client.due_date)}</p>
                </div>
                {isExpired && <Badge variant="destructive" className="text-xs">Vencido</Badge>}
              </div>
            </div>
          )}
        </div>

        {/* Plan options */}
        {hasOptions && !pixModalOpen && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Escolha seu plano</p>
            </div>
            <div className="space-y-2">
              {client.plan_options.map(opt => {
                const isSelected = selectedOptionId === opt.id;
                const isLocked = lockedScreens !== null && opt.num_screens !== lockedScreens;
                return (
                  <button
                    key={opt.id}
                    onClick={() => !isLocked && setSelectedOptionId(opt.id)}
                    disabled={isLocked}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      isLocked
                        ? "border-border/20 bg-muted/10 opacity-40 cursor-not-allowed"
                        : isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/50 bg-muted/30 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isLocked ? "border-muted-foreground/20" : isSelected ? "border-primary" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && !isLocked && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${isLocked ? "text-muted-foreground/50" : isSelected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDuration(opt.duration_months)} · {opt.num_screens} {opt.num_screens === 1 ? "tela" : "telas"}
                          </p>
                        </div>
                      </div>
                      <p className={`text-lg font-bold ${isLocked ? "text-muted-foreground/50" : isSelected ? "text-primary" : "text-foreground"}`}>
                        R$ {Number(opt.price).toFixed(2)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Price display */}
        <div className="text-center p-5 rounded-xl bg-primary/10 border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Valor</p>
          <p className="text-3xl font-bold text-primary">R$ {Number(basePrice).toFixed(2)}</p>
          {selectedOption && <p className="text-xs text-muted-foreground mt-1">{selectedOption.label}</p>}
        </div>

        {/* Inactive account */}
        {!client.is_active ? (
          <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">Esta conta está inativa.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Botão principal: abre pix-page (mais estável) */}
            <a
              href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pix-page?token=${token}${selectedOptionId ? `&plan_option_id=${selectedOptionId}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block"
            >
              <Button type="button" className="w-full" size="lg">
                <QrCode className="mr-2 h-4 w-4" />
                Gerar PIX
              </Button>
            </a>
            <p className="text-xs text-muted-foreground text-center">
              Um QR Code será gerado para pagamento instantâneo via PIX
            </p>

            {/* Botão secundário: gera PIX inline (fallback) */}
            <Button className="w-full bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80" size="lg" onClick={generatePix} disabled={generatingPix}>
              {generatingPix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              {pixData ? "Gerar novo PIX" : "Gerar PIX"}
            </Button>
            {pixData && (
              <Button className="w-full" size="lg" variant="outline" onClick={() => setPixModalOpen(true)}>
                <QrCode className="mr-2 h-4 w-4" />
                Ver QR Code
              </Button>
            )}

            {/* Separador */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">ou</span></div>
            </div>

            {/* Botão Cartão (Checkout redirect) */}
            <Button className="w-full" size="lg" variant="outline" onClick={generateCheckout} disabled={generatingCheckout}>
              {generatingCheckout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Pagar com Cartão
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Você será redirecionado para uma página segura de pagamento
            </p>
          </div>
        )}

        {/* History button */}
        <Button variant="ghost" className="w-full text-muted-foreground" size="sm" onClick={fetchHistory}>
          <History className="mr-2 h-4 w-4" />
          Histórico de pagamentos
        </Button>
      </div>

      {/* ═══ PIX MODAL ═══ */}
      <Dialog open={pixModalOpen} onOpenChange={setPixModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-center">
              <QrCode className="h-5 w-5 text-primary" />
              Pagamento PIX
            </DialogTitle>
          </DialogHeader>
          {pixData && (
            <div className="space-y-4 mt-2">
              {/* Valor */}
              <div className="text-center p-3 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-2xl font-bold text-primary">R$ {Number(basePrice).toFixed(2)}</p>
              </div>

              {/* QR Code */}
              {pixData.pix?.qr_code_base64 && (
                <div className="flex justify-center p-4 bg-white rounded-xl border border-border">
                  <img
                    src={`data:image/png;base64,${pixData.pix.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-52 h-52"
                  />
                </div>
              )}

              {/* Copia e Cola */}
              {pixData.pix?.qr_code && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-medium">Código PIX (copia e cola)</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={pixData.pix.qr_code}
                      className="flex-1 text-xs p-2.5 rounded-lg bg-muted border border-border font-mono truncate text-foreground"
                    />
                    <Button size="sm" variant="outline" onClick={copyPixCode} className="shrink-0">
                      {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={copyPixCode}>
                    {copied ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar código PIX
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Sem QR Code */}
              {!pixData.pix?.qr_code_base64 && !pixData.pix?.qr_code && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700">Não foi possível gerar o QR Code. Tente novamente.</p>
                </div>
              )}

              {/* Aguardando */}
              {polling && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-sm text-primary font-medium">Aguardando pagamento...</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Abra o app do seu banco, escaneie o QR Code ou cole o código PIX
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ PAYMENT HISTORY DIALOG ═══ */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Pagamentos
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <QrCode className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Nenhum pagamento encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => {
                  const st = statusLabel(p.status);
                  return (
                    <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{formatDateTime(p.created_at)}</span>
                        <Badge variant={st.variant} className="flex items-center gap-1 text-xs">
                          {statusIcon(p.status)}
                          {st.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{methodLabel(p.payment_method)}</span>
                        <span className="text-lg font-bold text-foreground">R$ {Number(p.amount).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicPayment;