import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, RefreshCw, CheckCircle2, CreditCard, User, Calendar, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ClientInfo {
  name: string;
  price_value: number;
  due_date: string | null;
  plans: { name: string } | null;
}

const PublicRecurrent = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    // Dados do titular
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  });

  // Fetch client info via public-payment
  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    const fetchClient = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-payment?token=${token}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!res.ok) { setNotFound(true); }
        else setClient(await res.json());
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    };
    fetchClient();
  }, [token]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const formatCard = (value: string) =>
    value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19);

  const handleSubmit = async () => {
    // Validações básicas
    const cardNum = form.number.replace(/\s/g, "");
    if (!form.holderName.trim() || cardNum.length < 13 || !form.expiryMonth || !form.expiryYear || !form.ccv || !form.cpfCnpj || !form.postalCode || !form.addressNumber || !form.phone) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-create-subscription`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          payment_token: token,
          creditCard: {
            holderName: form.holderName.trim(),
            number: cardNum,
            expiryMonth: form.expiryMonth,
            expiryYear: form.expiryYear,
            ccv: form.ccv,
          },
          creditCardHolderInfo: {
            name: form.holderName.trim(),
            cpfCnpj: form.cpfCnpj.replace(/\D/g, ""),
            postalCode: form.postalCode.replace(/\D/g, ""),
            addressNumber: form.addressNumber,
            phone: form.phone.replace(/\D/g, ""),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao cadastrar cartão");
      setSuccess(true);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const formatDate = (d: string | null) => {
    if (!d) return null;
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Not found ──
  if (notFound || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">Link não encontrado</h1>
          <p className="text-muted-foreground text-sm">Este link é inválido ou foi removido.</p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
          <h1 className="text-xl font-bold">Cartão cadastrado!</h1>
          <p className="text-muted-foreground text-sm">
            Seu pagamento recorrente foi ativado. Você será cobrado automaticamente todo mês e seu serviço renovado sem interrupções.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="glass-card rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Pagamento Automático</h1>
          <p className="text-muted-foreground text-sm">
            Cadastre seu cartão para cobrança mensal automática
          </p>
        </div>

        {/* Client info */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium">{client.name}</p>
            </div>
          </div>
          {client.plans?.name && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="font-medium">{client.plans.name}</p>
              </div>
            </div>
          )}
          {client.due_date && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Próximo vencimento</p>
                <p className="font-medium">{formatDate(client.due_date)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="text-center p-4 rounded-xl bg-primary/10 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Valor mensal</p>
          <p className="text-3xl font-bold text-primary">R$ {Number(client.price_value).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">cobrado automaticamente todo mês</p>
        </div>

        {/* Card form */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Dados do Cartão
          </p>

          <div className="space-y-2">
            <Label>Número do cartão *</Label>
            <Input
              value={form.number}
              onChange={e => set("number", formatCard(e.target.value))}
              placeholder="0000 0000 0000 0000"
              inputMode="numeric"
              maxLength={19}
            />
          </div>

          <div className="space-y-2">
            <Label>Nome no cartão *</Label>
            <Input
              value={form.holderName}
              onChange={e => set("holderName", e.target.value.toUpperCase())}
              placeholder="NOME COMO ESTÁ NO CARTÃO"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Mês *</Label>
              <Input
                value={form.expiryMonth}
                onChange={e => set("expiryMonth", e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="MM"
                inputMode="numeric"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Ano *</Label>
              <Input
                value={form.expiryYear}
                onChange={e => set("expiryYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="AAAA"
                inputMode="numeric"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>CVV *</Label>
              <Input
                value={form.ccv}
                onChange={e => set("ccv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="CVV"
                inputMode="numeric"
                maxLength={4}
              />
            </div>
          </div>

          <p className="text-sm font-medium text-foreground pt-2">Dados do titular</p>

          <div className="space-y-2">
            <Label>CPF/CNPJ *</Label>
            <Input
              value={form.cpfCnpj}
              onChange={e => set("cpfCnpj", e.target.value.replace(/\D/g, "").slice(0, 14))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label>CEP *</Label>
              <Input
                value={form.postalCode}
                onChange={e => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="00000-000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Número *</Label>
              <Input
                value={form.addressNumber}
                onChange={e => set("addressNumber", e.target.value)}
                placeholder="123"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              value={form.phone}
              onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Dados transmitidos com segurança. Seu cartão é tokenizado pelo Asaas — não armazenamos os dados completos.</span>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cadastrando...</>
              : <><CreditCard className="mr-2 h-4 w-4" />Ativar cobrança automática</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublicRecurrent;
