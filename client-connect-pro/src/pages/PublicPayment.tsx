import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, CreditCard, Calendar, User, FileText, Copy, CheckCircle2, QrCode, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

interface PaymentData {
  pix: { qr_code: string | null; qr_code_base64: string | null; ticket_url: string | null };
  card: { checkout_url: string | null };
  payment_id: number | null;
}

const PublicPayment = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [client, setClient] = useState<ClientPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Plan option selection ───
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const paymentStatus = searchParams.get("status");

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
        // Pre-select current option or first option
        if (data.plan_option_id) {
          setSelectedOptionId(data.plan_option_id);
        } else if (data.plan_options?.length > 0) {
          setSelectedOptionId(data.plan_options[0].id);
        }
      }
      setLoading(false);
    };
    fetchClient();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [token]);

  // Derived: selected option and effective price
  const selectedOption = client?.plan_options?.find(o => o.id === selectedOptionId) || null;
  const effectivePrice = selectedOption?.price || client?.price_value || 0;

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
      } catch { /* ignore polling errors */ }
    }, 5000);
  };

  const generatePayment = async () => {
    if (!token) return;
    setGeneratingPayment(true);
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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPaymentData(data);
        if (data.payment_id) {
          pollPaymentStatus(data.payment_id);
        }
      } else {
        toast({ title: "Erro", description: data.error || "Erro ao gerar pagamento", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingPayment(false);
  };

  const copyPixCode = () => {
    if (paymentData?.pix?.qr_code) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(paymentData.pix.qr_code);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = paymentData.pix.qr_code;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const formatDuration = (months: number) => {
    if (months === 1) return "1 mês";
    if (months === 12) return "1 ano";
    return `${months} meses`;
  };

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

  if (paymentStatus === "success" || paymentConfirmed) {
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
      <div className="glass-card rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <CreditCard className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-bold text-foreground">Fatura de Pagamento</h1>
        </div>

        <div className="space-y-4">
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

          {/* ═══ PLAN OPTIONS SELECTOR ═══ */}
          {hasOptions && !paymentData && (
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
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/50 bg-muted/30 hover:border-border"
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
                            <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {opt.label}
                            </p>
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

          {/* ═══ PRICE DISPLAY ═══ */}
          <div className="text-center p-6 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">Valor</p>
            <p className="text-3xl font-bold text-primary">R$ {Number(effectivePrice).toFixed(2)}</p>
            {selectedOption && (
              <p className="text-xs text-muted-foreground mt-1">{selectedOption.label}</p>
            )}
          </div>
        </div>

        {!client.is_active ? (
          <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">Esta conta está inativa.</p>
          </div>
        ) : !paymentData ? (
          <Button className="w-full" size="lg" onClick={generatePayment} disabled={generatingPayment}>
            {generatingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            Pagar Agora
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setTab("pix")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === "pix" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <QrCode className="h-4 w-4 inline mr-1.5" />PIX
              </button>
              <button
                onClick={() => setTab("card")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === "card" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <CreditCard className="h-4 w-4 inline mr-1.5" />Cartão
              </button>
            </div>

            {tab === "pix" && (
              <div className="space-y-4">
                {paymentData.pix.qr_code_base64 && (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img
                      src={`data:image/png;base64,${paymentData.pix.qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-48 h-48"
                    />
                  </div>
                )}

                {polling && (
                  <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm text-primary font-medium">Aguardando pagamento...</p>
                  </div>
                )}

                {paymentData.pix.qr_code && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center">Código PIX (copia e cola)</p>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={paymentData.pix.qr_code}
                        className="flex-1 text-xs p-2 rounded-lg bg-muted border border-border font-mono truncate text-foreground"
                      />
                      <Button size="sm" variant="outline" onClick={copyPixCode}>
                        {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "card" && paymentData.card.checkout_url && (
              <div className="text-center">
                <Button asChild className="w-full" size="lg">
                  <a href={paymentData.card.checkout_url} target="_blank" rel="noopener noreferrer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pagar com Cartão
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Você será redirecionado para o Mercado Pago</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicPayment;
