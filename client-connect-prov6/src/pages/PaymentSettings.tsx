import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Wifi, WifiOff, QrCode, LogOut, CheckCircle2, RefreshCw, Save, Key,
  Timer, Package, ShieldCheck, ShieldOff, Smartphone, X, CreditCard, Eye, EyeOff,
} from "lucide-react";

type SessionStatus = "disconnected" | "connecting" | "connected" | "unknown";

const PaymentSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  // PIX key
  const [pixKey, setPixKey] = useState("");
  const [savingPix, setSavingPix] = useState(false);

  // Asaas credentials
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasSandbox, setAsaasSandbox] = useState(false);
  const [savingAsaas, setSavingAsaas] = useState(false);
  const [showAsaasKey, setShowAsaasKey] = useState(false);
  const [testingAsaas, setTestingAsaas] = useState(false);

  // Batch sending config
  const [msgDelay, setMsgDelay] = useState(10);
  const [msgBatchSize, setMsgBatchSize] = useState(5);
  const [msgBatchPause, setMsgBatchPause] = useState(60);
  const [savingBatch, setSavingBatch] = useState(false);

  // Session / QR state
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("unknown");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // 2FA TOTP state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpSetupMode, setTotpSetupMode] = useState(false);
  const [totpQrUrl, setTotpQrUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpVerifying, setTotpVerifying] = useState(false);
  const [totpDisableMode, setTotpDisableMode] = useState(false);
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisabling, setTotpDisabling] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key, msg_delay_seconds, msg_batch_size, msg_batch_pause_seconds, totp_enabled, asaas_api_key, asaas_sandbox")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setConfigured(!!(data.wuzapi_url && data.wuzapi_token));
        setPixKey(data.pix_key || "");
        setMsgDelay(data.msg_delay_seconds ?? 10);
        setMsgBatchSize(data.msg_batch_size ?? 5);
        setMsgBatchPause(data.msg_batch_pause_seconds ?? 60);
        setTotpEnabled(data.totp_enabled || false);
        setAsaasApiKey(data.asaas_api_key || "");
        setAsaasSandbox(data.asaas_sandbox ?? false);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  // ── PIX Key ──
  const handleSavePixKey = async () => {
    if (!user) return;
    setSavingPix(true);
    const { error } = await supabase
      .from("profiles")
      .update({ pix_key: pixKey.trim() || null })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Chave PIX salva!" });
    }
    setSavingPix(false);
  };

  // ── Asaas ──
  const handleSaveAsaas = async () => {
    if (!user) return;
    if (!asaasApiKey.trim()) {
      toast({ title: "Informe a API Key do Asaas", variant: "destructive" });
      return;
    }
    setSavingAsaas(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        asaas_api_key: asaasApiKey.trim(),
        asaas_sandbox: asaasSandbox,
      })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Credenciais Asaas salvas!" });
    }
    setSavingAsaas(false);
  };

  const handleTestAsaas = async () => {
    if (!asaasApiKey.trim()) {
      toast({ title: "Informe a API Key primeiro", variant: "destructive" });
      return;
    }
    setTestingAsaas(true);
    try {
      // Salva primeiro para a edge function usar as credenciais atuais
      await supabase.from("profiles").update({
        asaas_api_key: asaasApiKey.trim(),
        asaas_sandbox: asaasSandbox,
      }).eq("user_id", user!.id);

      const { data, error } = await supabase.functions.invoke("asaas-create-subscription", {
        body: { action: "test_connection" },
      });

      if (error) throw new Error(error.message);

      if (data?.success) {
        toast({
          title: "Asaas conectado!",
          description: `Saldo: R$ ${Number(data.balance ?? 0).toFixed(2)} ${asaasSandbox ? "(Sandbox)" : "(Produção)"}`,
        });
      } else {
        toast({ title: "API Key inválida", description: data?.error || "Verifique a chave", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao testar", description: e.message, variant: "destructive" });
    }
    setTestingAsaas(false);
  };

  // ── Batch Config ──
  const handleSaveBatchConfig = async () => {
    if (!user) return;
    if (msgDelay < 3 || msgDelay > 60) {
      toast({ title: "Delay deve ser entre 3 e 60 segundos", variant: "destructive" });
      return;
    }
    if (msgBatchSize < 1 || msgBatchSize > 20) {
      toast({ title: "Tamanho do lote deve ser entre 1 e 20", variant: "destructive" });
      return;
    }
    if (msgBatchPause < 10 || msgBatchPause > 300) {
      toast({ title: "Pausa entre lotes deve ser entre 10 e 300 segundos", variant: "destructive" });
      return;
    }
    setSavingBatch(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        msg_delay_seconds: msgDelay,
        msg_batch_size: msgBatchSize,
        msg_batch_pause_seconds: msgBatchPause,
      })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração de envio salva!" });
    }
    setSavingBatch(false);
  };

  // ── 2FA TOTP ──
  const handleTotpGenerate = async () => {
    setTotpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "generate" },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        setTotpQrUrl(data.qr_code_url);
        setTotpSecret(data.secret);
        setTotpSetupMode(true);
        setTotpCode("");
      } else {
        throw new Error(data?.error || "Erro ao gerar QR code");
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setTotpLoading(false);
  };

  const handleTotpVerifyEnable = async () => {
    if (totpCode.length !== 6) {
      toast({ title: "Digite os 6 dígitos", variant: "destructive" });
      return;
    }
    setTotpVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "verify-enable", code: totpCode },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        setTotpEnabled(true);
        setTotpSetupMode(false);
        setTotpQrUrl(null);
        setTotpSecret(null);
        setTotpCode("");
        toast({ title: "2FA ativado com sucesso!", description: "Agora o código será pedido a cada login" });
      } else {
        throw new Error(data?.error || "Código inválido");
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setTotpCode("");
    }
    setTotpVerifying(false);
  };

  const handleTotpDisable = async () => {
    if (totpDisableCode.length !== 6) {
      toast({ title: "Digite os 6 dígitos para desativar", variant: "destructive" });
      return;
    }
    setTotpDisabling(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "disable", code: totpDisableCode },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        setTotpEnabled(false);
        setTotpDisableMode(false);
        setTotpDisableCode("");
        toast({ title: "2FA desativado" });
      } else {
        throw new Error(data?.error || "Código inválido");
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setTotpDisableCode("");
    }
    setTotpDisabling(false);
  };

  const handleCancelSetup = () => {
    setTotpSetupMode(false);
    setTotpQrUrl(null);
    setTotpSecret(null);
    setTotpCode("");
  };

  // ── WhatsApp Session ──
  const callProxy = useCallback(async (endpoint: string, method = "GET", body?: any) => {
    const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
      body: { endpoint, method, body },
    });
    if (error) throw new Error(error.message);
    const parsed = typeof data?.wuzapi_response === "string"
      ? JSON.parse(data.wuzapi_response)
      : data?.wuzapi_response;
    return { status: data?.wuzapi_status, data: parsed };
  }, []);

  const checkStatus = useCallback(async () => {
    if (!configured) return;
    setCheckingStatus(true);
    try {
      const res = await callProxy("/session/status", "GET");
      if (res.status === 200 && (res.data?.data?.connected || res.data?.data?.Connected) && res.data?.data?.loggedIn) {
        setSessionStatus("connected");
        setQrCode(null);
      } else {
        setSessionStatus("disconnected");
      }
    } catch {
      setSessionStatus("unknown");
    }
    setCheckingStatus(false);
  }, [configured, callProxy]);

  useEffect(() => {
    if (configured && !loading) checkStatus();
  }, [configured, loading, checkStatus]);

  const connectSession = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      await callProxy("/session/connect", "POST", {
        Subscribe: ["Message", "ReadReceipt", "Presence"],
        Immediate: true,
      });
      await new Promise(r => setTimeout(r, 2000));
      const status = await callProxy("/session/status", "GET");
      const d = status.data?.data;
      if (d?.loggedIn) {
        setSessionStatus("connected");
        toast({ title: "WhatsApp já está conectado!" });
      } else if (d?.qrcode || d?.QRCode) {
        setQrCode(d.qrcode || d.QRCode);
        setSessionStatus("connecting");
        pollForConnection();
      } else {
        const qrRes = await callProxy("/session/qr", "GET");
        const qr = qrRes.data?.data?.QRCode || qrRes.data?.data?.qrcode;
        if (qr) {
          setQrCode(qr);
          setSessionStatus("connecting");
          pollForConnection();
        } else {
          toast({ title: "Não foi possível obter QR code", variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Erro ao conectar", description: e.message, variant: "destructive" });
    }
    setConnecting(false);
  };

  const pollForConnection = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 24) { clearInterval(interval); return; }
      try {
        const res = await callProxy("/session/status", "GET");
        if (res.status === 200 && (res.data?.data?.connected || res.data?.data?.Connected) && res.data?.data?.loggedIn) {
          setSessionStatus("connected");
          setQrCode(null);
          clearInterval(interval);
          toast({ title: "WhatsApp conectado com sucesso!" });
        }
      } catch { /* ignore */ }
    }, 5000);
  };

  const disconnectSession = async () => {
    setDisconnecting(true);
    try {
      await callProxy("/session/disconnect", "POST");
      setSessionStatus("disconnected");
      setQrCode(null);
      toast({ title: "WhatsApp desconectado" });
    } catch (e: any) {
      toast({ title: "Erro ao desconectar", description: e.message, variant: "destructive" });
    }
    setDisconnecting(false);
  };

  const calcPreview = () => {
    const msgsPerCycle = msgBatchSize;
    const cycleTime = (msgDelay * msgBatchSize) + msgBatchPause;
    const msgsPerHour = Math.round((msgsPerCycle / cycleTime) * 3600);
    return { msgsPerHour, cycleTime };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { msgsPerHour } = calcPreview();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conexão WhatsApp, pagamentos e segurança</p>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* 2FA TOTP Card */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Autenticação 2FA</h2>
              <p className="text-xs text-muted-foreground">Google Authenticator</p>
            </div>
          </div>
          {totpEnabled && !totpSetupMode && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
              <CheckCircle2 className="h-3 w-3" /> Ativo
            </span>
          )}
        </div>

        {!totpEnabled && !totpSetupMode && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione uma camada extra de segurança ao seu login. Ao ativar, será necessário digitar um código
              do Google Authenticator toda vez que fizer login.
            </p>
            <Button onClick={handleTotpGenerate} disabled={totpLoading}>
              {totpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
              Ativar 2FA
            </Button>
          </div>
        )}

        {totpSetupMode && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Smartphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Passo 1: Escaneie o QR Code</p>
                <p>Abra o <strong>Google Authenticator</strong> no celular, toque em <strong>+</strong> e escaneie o código abaixo.</p>
              </div>
            </div>
            {totpQrUrl && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg">
                <img src={totpQrUrl} alt="QR Code 2FA" className="w-48 h-48" />
              </div>
            )}
            {totpSecret && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Não consegue escanear? Digite esta chave manualmente:</p>
                <p className="font-mono text-sm tracking-wider text-foreground break-all select-all">{totpSecret}</p>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Passo 2: Confirme o código</p>
                <p>Digite o código de 6 dígitos que aparece no autenticador para confirmar.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-setup-code">Código do Autenticador</Label>
              <Input
                id="totp-setup-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" className="text-center text-xl tracking-[0.5em] font-mono max-w-[200px]"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleTotpVerifyEnable} disabled={totpVerifying || totpCode.length !== 6}>
                {totpVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Ativar
              </Button>
              <Button variant="ghost" onClick={handleCancelSetup}><X className="mr-2 h-4 w-4" />Cancelar</Button>
            </div>
          </div>
        )}

        {totpEnabled && !totpSetupMode && !totpDisableMode && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              A autenticação em 2 fatores está ativa. Um código do Google Authenticator será pedido em cada login.
            </p>
            <Button variant="outline" onClick={() => { setTotpDisableMode(true); setTotpDisableCode(""); }}>
              <ShieldOff className="mr-2 h-4 w-4" /> Desativar 2FA
            </Button>
          </div>
        )}

        {totpDisableMode && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <ShieldOff className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">Para desativar, digite o código atual do seu autenticador.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-disable-code">Código do Autenticador</Label>
              <Input
                id="totp-disable-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={totpDisableCode} onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" autoFocus className="text-center text-xl tracking-[0.5em] font-mono max-w-[200px]"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="destructive" onClick={handleTotpDisable} disabled={totpDisabling || totpDisableCode.length !== 6}>
                {totpDisabling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                Confirmar desativação
              </Button>
              <Button variant="ghost" onClick={() => { setTotpDisableMode(false); setTotpDisableCode(""); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Asaas Credentials Card */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Asaas — Pagamento Recorrente</h2>
            <p className="text-xs text-muted-foreground">Credenciais para cobrança automática com cartão</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Configure sua API Key do Asaas para ativar cobranças recorrentes via cartão de crédito.
          A chave pode ser obtida em <strong>Asaas → Integrações → API</strong>.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showAsaasKey ? "text" : "password"}
                  value={asaasApiKey}
                  onChange={e => setAsaasApiKey(e.target.value)}
                  placeholder="$aact_prod_xxxxxxxxxxxx"
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowAsaasKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAsaasKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={asaasSandbox}
              onCheckedChange={setAsaasSandbox}
            />
            <div>
              <Label>Ambiente Sandbox</Label>
              <p className="text-xs text-muted-foreground">Ative apenas para testes. Desative em produção.</p>
            </div>
          </div>

          {asaasSandbox && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600">
              ⚠️ Modo Sandbox ativo — cobranças não são reais.
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSaveAsaas} disabled={savingAsaas}>
              {savingAsaas ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={handleTestAsaas} disabled={testingAsaas || !asaasApiKey.trim()}>
              {testingAsaas ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Testar conexão
            </Button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* PIX Key Card */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <Key className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Chave PIX</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Cadastre sua chave PIX para pagamentos sem automação. Quando o cliente estiver configurado como "PIX",
          a variável <code className="bg-muted px-1 rounded">{"{link_pagamento}"}</code> enviará esta chave ao invés do link.
        </p>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="pix-key" className="sr-only">Chave PIX</Label>
            <Input
              id="pix-key" value={pixKey} onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
            />
          </div>
          <Button onClick={handleSavePixKey} disabled={savingPix}>
            {savingPix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Batch Sending Config Card */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Envio em Lotes</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure o ritmo de envio de mensagens automáticas para evitar bloqueio do WhatsApp.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="msg-delay" className="text-sm font-medium">Delay entre msgs</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="msg-delay" type="number" min={3} max={60} value={msgDelay} onChange={(e) => setMsgDelay(Number(e.target.value))} className="w-full" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">seg</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">3–60 segundos</p>
            </div>
            <div>
              <Label htmlFor="msg-batch" className="text-sm font-medium">Msgs por lote</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="msg-batch" type="number" min={1} max={20} value={msgBatchSize} onChange={(e) => setMsgBatchSize(Number(e.target.value))} className="w-full" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">msgs</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">1–20 mensagens</p>
            </div>
            <div>
              <Label htmlFor="msg-pause" className="text-sm font-medium">Pausa entre lotes</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input id="msg-pause" type="number" min={10} max={300} value={msgBatchPause} onChange={(e) => setMsgBatchPause(Number(e.target.value))} className="w-full" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">seg</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">10–300 segundos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Ritmo: <strong className="text-foreground">{msgBatchSize} msgs</strong> a cada{" "}
              <strong className="text-foreground">{msgDelay}s</strong>, pausa de{" "}
              <strong className="text-foreground">{msgBatchPause}s</strong> → <strong className="text-foreground">~{msgsPerHour} msgs/hora</strong>
            </p>
          </div>
          <Button onClick={handleSaveBatchConfig} disabled={savingBatch}>
            {savingBatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar configuração
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* WhatsApp Session Card */}
      {/* ══════════════════════════════════════════════════════ */}
      {configured ? (
        <div className="glass-card rounded-xl p-6 max-w-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {sessionStatus === "connected" ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : sessionStatus === "connecting" ? (
                <Loader2 className="h-5 w-5 animate-spin text-warning" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <h2 className="font-semibold">Sessão WhatsApp</h2>
                <p className="text-sm text-muted-foreground">
                  {sessionStatus === "connected" && "Conectado"}
                  {sessionStatus === "connecting" && "Aguardando leitura do QR Code..."}
                  {sessionStatus === "disconnected" && "Desconectado"}
                  {sessionStatus === "unknown" && "Verificando..."}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={checkStatus} disabled={checkingStatus}>
              <RefreshCw className={`h-4 w-4 ${checkingStatus ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {qrCode && sessionStatus === "connecting" && (
            <div className="flex flex-col items-center gap-4 mb-6 p-4 bg-white rounded-lg">
              <img
                src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code WhatsApp" className="w-64 h-64"
              />
              <p className="text-sm text-gray-600 text-center">
                Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho
              </p>
            </div>
          )}
          <div className="flex gap-3">
            {sessionStatus !== "connected" && (
              <Button onClick={connectSession} disabled={connecting}>
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                {qrCode ? "Gerar novo QR Code" : "Conectar WhatsApp"}
              </Button>
            )}
            {sessionStatus === "connected" && (
              <Button variant="destructive" onClick={disconnectSession} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Desconectar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">WhatsApp não configurado</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            O administrador do sistema precisa configurar as credenciais WhatsApp para sua conta.
          </p>
        </div>
      )}

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. Configure a <strong>API Key do Asaas</strong> para ativar cobranças recorrentes com cartão</li>
          <li>2. O administrador configura as credenciais WhatsApp para sua conta</li>
          <li>3. Clique em <strong>Conectar WhatsApp</strong> e escaneie o QR Code</li>
          <li>4. Configure a <strong>Chave PIX</strong> para clientes que pagam via PIX sem automação</li>
          <li>5. Ajuste o <strong>Envio em Lotes</strong> para controlar o ritmo de envio</li>
          <li>6. Ative o <strong>2FA</strong> para proteger sua conta com Google Authenticator</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSettings;
