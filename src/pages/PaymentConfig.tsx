import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, Eye, EyeOff, CheckCircle2, XCircle, QrCode, CreditCard, ExternalLink,
} from "lucide-react";

interface InvoiceMethods {
  pix: boolean;
  pix_page: boolean;
  card: boolean;
}

const PaymentConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);
  const [testing, setTesting] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  const [invoiceMethods, setInvoiceMethods] = useState<InvoiceMethods>({
    pix: true,
    pix_page: true,
    card: true,
  });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("orchestrator_api_key, invoice_methods")
        .eq("user_id", user.id)
        .single();
      if (data) {
        if (data.orchestrator_api_key) setApiKey(data.orchestrator_api_key);
        if (data.invoice_methods) {
          setInvoiceMethods({
            pix: data.invoice_methods.pix !== false,
            pix_page: data.invoice_methods.pix_page !== false,
            card: data.invoice_methods.card !== false,
          });
        }
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ orchestrator_api_key: apiKey.trim() || null })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas com sucesso!" });
    }
    setSaving(false);
  };

  const handleSaveMethods = async () => {
    if (!user) return;
    // Garante que ao menos 1 método está ativo
    if (!invoiceMethods.pix && !invoiceMethods.pix_page && !invoiceMethods.card) {
      toast({ title: "Atenção", description: "Pelo menos um método de pagamento deve estar ativo.", variant: "destructive" });
      return;
    }
    setSavingMethods(true);
    const { error } = await supabase
      .from("profiles")
      .update({ invoice_methods: invoiceMethods })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Métodos de pagamento salvos!" });
    }
    setSavingMethods(false);
  };

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-gateway", {
        body: { api_key: apiKey.trim() },
      });
      if (error) {
        setTestResult({ status: "error", message: "Erro ao testar conexão. Tente novamente." });
      } else if (data?.success) {
        setTestResult({ status: "success", message: data.message || "Conectado! Gateway respondendo corretamente." });
      } else {
        setTestResult({ status: "error", message: data?.message || "Falha na conexão. Verifique a API Key." });
      }
    } catch {
      setTestResult({ status: "error", message: "Não foi possível testar a conexão. Tente novamente." });
    }
    setTesting(false);
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`} />
    </button>
  );

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
        <h1 className="text-2xl font-bold">Configuração de Pagamentos</h1>
        <p className="text-muted-foreground">Configure o gateway e os métodos de pagamento dos seus clientes</p>
      </div>

      {/* Gateway Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">Gateway de Pagamento</h2>
            <p className="text-sm text-muted-foreground">Conecte ao Gateway de Pagamentos</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
              placeholder="orch_..."
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Chave de acesso gerada no painel do Gateway (seção API Keys)
          </p>
        </div>

        {testResult && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            testResult.status === "success"
              ? "bg-success/10 text-success border border-success/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>
            {testResult.status === "success"
              ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !apiKey.trim()}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar Conexão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Invoice Methods Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">Métodos na Fatura</h2>
            <p className="text-sm text-muted-foreground">Escolha quais opções de pagamento aparecem para seus clientes</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* PIX direto */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <QrCode className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">PIX na tela</p>
                <p className="text-xs text-muted-foreground">QR Code gerado diretamente na página de pagamento</p>
              </div>
            </div>
            <Toggle
              checked={invoiceMethods.pix}
              onChange={v => setInvoiceMethods(prev => ({ ...prev, pix: v }))}
            />
          </div>

          {/* PIX nova aba */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ExternalLink className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">PIX em nova aba</p>
                <p className="text-xs text-muted-foreground">Abre uma página dedicada com o QR Code PIX</p>
              </div>
            </div>
            <Toggle
              checked={invoiceMethods.pix_page}
              onChange={v => setInvoiceMethods(prev => ({ ...prev, pix_page: v }))}
            />
          </div>

          {/* Cartão */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Cartão de crédito</p>
                <p className="text-xs text-muted-foreground">Redireciona para checkout seguro de cartão</p>
              </div>
            </div>
            <Toggle
              checked={invoiceMethods.card}
              onChange={v => setInvoiceMethods(prev => ({ ...prev, card: v }))}
            />
          </div>
        </div>

        {!invoiceMethods.pix && !invoiceMethods.pix_page && !invoiceMethods.card && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>Pelo menos um método deve estar ativo.</span>
          </div>
        )}

        <Button onClick={handleSaveMethods} disabled={savingMethods}>
          {savingMethods && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Métodos
        </Button>
      </div>

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Insira a <strong>API Key</strong> do Gateway de Pagamentos</li>
          <li>2. Teste a conexão para verificar se está tudo certo</li>
          <li>3. Escolha quais métodos de pagamento aparecem na fatura dos seus clientes</li>
          <li>4. Ao confirmar o pagamento, o vencimento é <strong>renovado automaticamente</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentConfig;
