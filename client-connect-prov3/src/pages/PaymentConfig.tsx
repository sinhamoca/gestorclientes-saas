import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, Eye, EyeOff, CheckCircle2, XCircle,
} from "lucide-react";

const PaymentConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Orchestrator
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("orchestrator_api_url, orchestrator_api_key")
        .eq("user_id", user.id)
        .single();
      if (data) {
        if (data.orchestrator_api_url) setApiUrl(data.orchestrator_api_url);
        if (data.orchestrator_api_key) setApiKey(data.orchestrator_api_key);
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
      .update({
        orchestrator_api_url: apiUrl.trim() || null,
        orchestrator_api_key: apiKey.trim() || null,
      })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas com sucesso!" });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const url = apiUrl.trim().replace(/\/$/, "");

      // 1. Testar health do Orchestrator
      const healthRes = await fetch(`${url.replace("/api/v1", "")}/health`);
      if (!healthRes.ok) {
        setTestResult({ status: "error", message: "Orchestrator não está respondendo. Verifique a URL." });
        setTesting(false);
        return;
      }

      // 2. Testar autenticação com a API Key
      const authRes = await fetch(`${url}/payments?limit=1`, {
        headers: { "X-Api-Key": apiKey.trim() },
      });

      if (authRes.ok) {
        const data = await authRes.json();
        const payments = data.data || [];
        setTestResult({
          status: "success",
          message: `Conectado! API respondendo corretamente. ${payments.length > 0 ? payments.length + " pagamento(s) encontrado(s)." : "Nenhum pagamento ainda."}`,
        });
      } else if (authRes.status === 401 || authRes.status === 403) {
        setTestResult({ status: "error", message: "API Key inválida. Verifique e tente novamente." });
      } else {
        setTestResult({ status: "error", message: `Erro ${authRes.status}. Verifique a URL e a API Key.` });
      }
    } catch (e: any) {
      setTestResult({
        status: "error",
        message: "Não foi possível conectar. Verifique se a URL está correta e o serviço está acessível.",
      });
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
        <h1 className="text-2xl font-bold">Configuração de Pagamentos</h1>
        <p className="text-muted-foreground">Configure o gateway de pagamento para cobrança automática dos seus clientes</p>
      </div>

      {/* Gateway (Orchestrator) Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">Gateway de Pagamento</h2>
            <p className="text-sm text-muted-foreground">Conecte ao Orquestrador de Pagamentos</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>URL da API</Label>
          <Input
            type="text"
            value={apiUrl}
            onChange={e => { setApiUrl(e.target.value); setTestResult(null); }}
            placeholder="http://seu-servidor:3500/api/v1"
          />
          <p className="text-xs text-muted-foreground">
            Endereço do Orquestrador de Pagamentos (fornecido pelo administrador)
          </p>
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
            Chave de acesso gerada no painel do Orquestrador (seção API Keys)
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
              : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            }
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !apiUrl.trim() || !apiKey.trim()}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar Conexão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Insira a <strong>URL</strong> e <strong>API Key</strong> do Orquestrador de Pagamentos</li>
          <li>2. Teste a conexão para verificar se os gateways estão configurados</li>
          <li>3. Seus clientes poderão pagar via <strong>PIX</strong> (QR Code gerado automaticamente)</li>
          <li>4. Ao confirmar o pagamento, o vencimento do cliente é <strong>renovado automaticamente</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentConfig;