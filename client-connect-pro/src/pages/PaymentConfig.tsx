import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

const PaymentConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("mercadopago_access_token")
        .eq("user_id", user.id)
        .single();
      if (data?.mercadopago_access_token) {
        setToken(data.mercadopago_access_token);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ mercadopago_access_token: token.trim() || null })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Token salvo com sucesso!" });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!token.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("https://api.mercadopago.com/v1/payment_methods", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Pagamentos</h1>
        <p className="text-muted-foreground">Configure seus meios de pagamento para cobrança automática</p>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Mercado Pago</h2>
        </div>

        <div className="space-y-2">
          <Label>Access Token</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={e => { setToken(e.target.value); setTestResult(null); }}
                placeholder="APP_USR-..."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Encontre em: Mercado Pago → Seu negócio → Configurações → Gestão e Administração → Credenciais → Access Token de produção
          </p>
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            testResult === "success"
              ? "bg-success/10 text-success border border-success/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>
            {testResult === "success"
              ? <><CheckCircle2 className="h-4 w-4" /> Token válido! Conexão estabelecida.</>
              : <><XCircle className="h-4 w-4" /> Token inválido. Verifique e tente novamente.</>
            }
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !token.trim()}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar Conexão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Insira seu <strong>Access Token de produção</strong> do Mercado Pago</li>
          <li>2. Teste a conexão para garantir que está funcionando</li>
          <li>3. Seus clientes poderão pagar via <strong>PIX</strong> (QR Code e copia e cola) ou <strong>Cartão de crédito</strong></li>
          <li>4. Ao confirmar o pagamento, o vencimento do cliente é <strong>renovado automaticamente</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentConfig;
