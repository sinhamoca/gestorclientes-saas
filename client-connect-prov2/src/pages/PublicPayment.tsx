import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, CreditCard, Calendar, User, FileText, Copy, CheckCircle2,
  QrCode, Package, History, XCircle, Clock, AlertCircle, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window { MercadoPago: any; }
}

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
  mercadopago_public_key: string | null;
  card_fee_percent: number;
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
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // PIX state
  const [pixData, setPixData] = useState<any>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [generatingPixCheckout, setGeneratingPixCheckout] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card state
  const [cardFormMounted, setCardFormMounted] = useState(false);
  const [processingCard, setProcessingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardFormInstanceRef = useRef<any>(null);
  const mpInstanceRef = useRef<any>(null);
  const sdkLoadedRef = useRef(false);
  const formInitializedRef = useRef(false);

  // Plan option selection
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  // Payment history
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const paymentStatus = searchParams.get("status");
  const cardFeePercent = client?.card_fee_percent || 10;

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
  const cardPrice = Math.round(basePrice * (1 + cardFeePercent / 100) * 100) / 100;
  const effectivePrice = tab === "card" ? cardPrice : basePrice;

  // ─── Load MP SDK and init card form ───
  const initCardForm = useCallback(() => {
    if (!client?.mercadopago_public_key || formInitializedRef.current) return;

    const checkContainers = () => {
      const container = document.getElementById("form-checkout__cardNumber");
      return !!container;
    };

    if (!checkContainers()) {
      setTimeout(initCardForm, 200);
      return;
    }

    try {
      const mp = new window.MercadoPago(client.mercadopago_public_key, { locale: "pt-BR" });
      mpInstanceRef.current = mp;

      const cardForm = mp.cardForm({
        amount: String(cardPrice),
        iframe: true,
        form: {
          id: "form-checkout",
          cardNumber: {
            id: "form-checkout__cardNumber",
            placeholder: "0000 0000 0000 0000",
            style: { fontSize: "16px", fontFamily: "inherit" },
          },
          expirationDate: {
            id: "form-checkout__expirationDate",
            placeholder: "MM/AA",
            style: { fontSize: "16px", fontFamily: "inherit" },
          },
          securityCode: {
            id: "form-checkout__securityCode",
            placeholder: "CVV",
            style: { fontSize: "16px", fontFamily: "inherit" },
          },
          cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome impresso no cartão" },
          issuer: { id: "form-checkout__issuer" },
          installments: { id: "form-checkout__installments" },
          identificationType: { id: "form-checkout__identificationType" },
          identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "CPF" },
        },
        callbacks: {
          onFormMounted: (error: any) => {
            if (error) {
              console.warn("[card-form] Mount error:", error);
              return;
            }
            setCardFormMounted(true);
            console.log("[card-form] Mounted successfully");
          },
          onSubmit: async (event: Event) => {
            event.preventDefault();
            setProcessingCard(true);
            setCardError(null);

            try {
              const formData = cardForm.getCardFormData();
              console.log("[card-form] Token received, processing payment...");

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
                  card_token: formData.token,
                  card_payment_method_id: formData.paymentMethodId,
                  card_issuer_id: formData.issuerId,
                  card_installments: Number(formData.installments) || 1,
                  payer_email: formData.cardholderEmail || undefined,
                  payer_doc_type: formData.identificationType,
                  payer_doc_number: formData.identificationNumber,
                }),
              });

              const result = await res.json();

              if (result.status === "approved") {
                setPaymentConfirmed(true);
                toast({ title: "Pagamento confirmado!", description: "Seu plano foi renovado com sucesso." });
                // Trigger check-payment to process renewal
                if (result.payment_id) {
                  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-payment`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    },
                    body: JSON.stringify({ payment_id: result.payment_id, payment_token: token }),
                  }).catch(() => {});
                }
              } else if (result.status === "in_process" || result.status === "pending") {
                toast({ title: "Pagamento em processamento", description: "Aguarde a confirmação." });
                if (result.payment_id) {
                  pollPaymentStatus(result.payment_id);
                }
              } else {
                setCardError(result.error_message || "Pagamento recusado. Tente outro cartão ou use PIX.");
              }
            } catch (e: any) {
              setCardError(e.message || "Erro ao processar pagamento.");
            }
            setProcessingCard(false);
          },
          onFetchMoreCards: () => {},
          onCardTokenReceived: (error: any) => {
            if (error) {
              setCardError("Erro ao processar dados do cartão. Verifique e tente novamente.");
              setProcessingCard(false);
            }
          },
          onValidityChange: () => {},
          onError: (error: any) => {
            console.warn("[card-form] Error:", error);
          },
        },
      });

      cardFormInstanceRef.current = cardForm;
      formInitializedRef.current = true;
    } catch (e) {
      console.error("[card-form] Init error:", e);
    }
  }, [client?.mercadopago_public_key, cardPrice, token, selectedOptionId]);

  useEffect(() => {
    if (tab !== "card" || !client?.mercadopago_public_key || pixData || paymentConfirmed) return;
    if (formInitializedRef.current) return;

    if (sdkLoadedRef.current) {
      initCardForm();
      return;
    }

    // Check if already loaded
    if (window.MercadoPago) {
      sdkLoadedRef.current = true;
      initCardForm();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      sdkLoadedRef.current = true;
      initCardForm();
    };
    document.head.appendChild(script);
  }, [tab, client?.mercadopago_public_key, initCardForm]);

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
        if (data.payment_id) pollPaymentStatus(data.payment_id);
      } else {
        toast({ title: "Erro", description: data.error || "Erro ao gerar PIX", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingPix(false);
  };

  const generatePixCheckout = async () => {
    if (!token) return;
    setGeneratingPixCheckout(true);
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
          payment_method: "pix_checkout",
        }),
      });
      const data = await res.json();
      if (res.ok && data.init_point) {
        window.location.href = data.init_point;
      } else {
        toast({ title: "Erro", description: data.error || "Erro ao abrir checkout", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingPixCheckout(false);
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
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground" />
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
  const hasPublicKey = !!client.mercadopago_public_key;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="glass-card rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <CreditCard className="h-10 w-10 mx-auto text-primary" />
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
        {hasOptions && !pixData && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Escolha seu plano</p>
            </div>
            <div className="space-y-2">
              {client.plan_options.map(opt => {
                const isSelected = selectedOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      isSelected ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? "border-primary" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDuration(opt.duration_months)} · {opt.num_screens} {opt.num_screens === 1 ? "tela" : "telas"}
                          </p>
                        </div>
                      </div>
                      <p className={`text-lg font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                        R$ {Number(opt.price).toFixed(2)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment method tabs */}
        {!pixData && client.is_active && (
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setTab("pix")}
              className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-colors ${
                tab === "pix" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <QrCode className="h-4 w-4 inline mr-1.5" />PIX
            </button>
            <button
              onClick={() => setTab("card")}
              className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-colors ${
                tab === "card" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <CreditCard className="h-4 w-4 inline mr-1.5" />Cartão
              {hasPublicKey && (
                <span className="text-xs opacity-70 ml-1">+{cardFeePercent}%</span>
              )}
            </button>
          </div>
        )}

        {/* Price display */}
        <div className="text-center p-5 rounded-xl bg-primary/10 border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">
            {tab === "card" && !pixData ? "Valor com cartão" : "Valor"}
          </p>
          <p className="text-3xl font-bold text-primary">R$ {Number(effectivePrice).toFixed(2)}</p>
          {tab === "card" && !pixData && (
            <p className="text-xs text-muted-foreground mt-1">
              PIX: R$ {Number(basePrice).toFixed(2)} · Cartão: +{cardFeePercent}%
            </p>
          )}
          {selectedOption && <p className="text-xs text-muted-foreground mt-1">{selectedOption.label}</p>}
        </div>

        {/* Inactive account */}
        {!client.is_active ? (
          <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">Esta conta está inativa.</p>
          </div>
        ) : (
          <>
            {/* ═══ PIX TAB ═══ */}
            {tab === "pix" && !pixData && (
              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={generatePix} disabled={generatingPix || generatingPixCheckout}>
                  {generatingPix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                  Gerar PIX
                </Button>

                <Button
                  className="w-full"
                  size="lg"
                  variant="outline"
                  onClick={generatePixCheckout}
                  disabled={generatingPix || generatingPixCheckout}
                >
                  {generatingPixCheckout ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  PIX via Mercado Pago
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Se o QR Code não aparecer, use o botão acima para pagar pelo site do Mercado Pago
                </p>
              </div>
            )}

            {tab === "pix" && pixData && (
              <div className="space-y-4">
                {pixData.pix?.qr_code_base64 && (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img src={`data:image/png;base64,${pixData.pix.qr_code_base64}`} alt="QR Code PIX" className="w-48 h-48" />
                  </div>
                )}
                {polling && (
                  <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm text-primary font-medium">Aguardando pagamento...</p>
                  </div>
                )}
                {pixData.pix?.qr_code && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center">Código PIX (copia e cola)</p>
                    <div className="flex gap-2">
                      <input readOnly value={pixData.pix.qr_code} className="flex-1 text-xs p-2 rounded-lg bg-muted border border-border font-mono truncate text-foreground" />
                      <Button size="sm" variant="outline" onClick={copyPixCode}>
                        {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fallback: if QR code didn't render, show checkout pro option */}
                {!pixData.pix?.qr_code_base64 && !pixData.pix?.qr_code && (
                  <div className="space-y-3 text-center">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-700">Não foi possível gerar o QR Code. Use o botão abaixo para pagar pelo Mercado Pago.</p>
                    </div>
                    <Button className="w-full" size="lg" variant="outline" onClick={generatePixCheckout} disabled={generatingPixCheckout}>
                      {generatingPixCheckout ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      PIX via Mercado Pago
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ═══ CARD TAB ═══ */}
            {tab === "card" && !pixData && (
              <div className="space-y-4">
                {!hasPublicKey ? (
                  <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
                    <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Pagamento com cartão não disponível.</p>
                    <p className="text-xs text-muted-foreground mt-1">Use PIX para pagar.</p>
                  </div>
                ) : (
                  <>
                    {/* MP Card Form */}
                    <form id="form-checkout" className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Número do cartão</Label>
                        <div id="form-checkout__cardNumber" className="h-11 rounded-lg border border-border bg-white px-3 flex items-center overflow-hidden" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Validade</Label>
                          <div id="form-checkout__expirationDate" className="h-11 rounded-lg border border-border bg-white px-3 flex items-center overflow-hidden" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">CVV</Label>
                          <div id="form-checkout__securityCode" className="h-11 rounded-lg border border-border bg-white px-3 flex items-center overflow-hidden" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Nome no cartão</Label>
                        <input
                          id="form-checkout__cardholderName"
                          type="text"
                          className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="Nome impresso no cartão"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Documento</Label>
                          <select
                            id="form-checkout__identificationType"
                            className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Número</Label>
                          <input
                            id="form-checkout__identificationNumber"
                            type="text"
                            className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="CPF"
                          />
                        </div>
                      </div>

                      {/* Hidden fields managed by SDK */}
                      <select id="form-checkout__issuer" className="hidden" />
                      <select id="form-checkout__installments" className="hidden" />

                      {cardError && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-sm text-destructive">{cardError}</p>
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={processingCard || !cardFormMounted}
                      >
                        {processingCard ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="mr-2 h-4 w-4" />
                        )}
                        {processingCard ? "Processando..." : `Pagar R$ ${Number(cardPrice).toFixed(2)}`}
                      </Button>

                      {!cardFormMounted && (
                        <div className="flex items-center justify-center gap-2 py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Carregando formulário seguro...</p>
                        </div>
                      )}
                    </form>

                    <p className="text-xs text-muted-foreground text-center">
                      Pagamento processado com segurança pelo Mercado Pago
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* History button */}
        <Button variant="ghost" className="w-full text-muted-foreground" size="sm" onClick={fetchHistory}>
          <History className="mr-2 h-4 w-4" />
          Histórico de pagamentos
        </Button>
      </div>

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
                <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
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