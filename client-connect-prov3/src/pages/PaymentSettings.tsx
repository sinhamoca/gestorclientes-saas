import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Wifi, WifiOff, QrCode, LogOut, CheckCircle2, RefreshCw, Save, Key,
  Timer, Package,
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

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key, msg_delay_seconds, msg_batch_size, msg_batch_pause_seconds")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setConfigured(!!(data.wuzapi_url && data.wuzapi_token));
        setPixKey(data.pix_key || "");
        setMsgDelay(data.msg_delay_seconds ?? 10);
        setMsgBatchSize(data.msg_batch_size ?? 5);
        setMsgBatchPause(data.msg_batch_pause_seconds ?? 60);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

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

  const handleSaveBatchConfig = async () => {
    if (!user) return;

    // Validações
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

  // Preview do ritmo de envio
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

  const { msgsPerHour, cycleTime } = calcPreview();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conexão WhatsApp e pagamentos</p>
      </div>

      {/* PIX Key Card */}
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
              id="pix-key"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
            />
          </div>
          <Button onClick={handleSavePixKey} disabled={savingPix}>
            {savingPix ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Batch Sending Config Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Envio em Lotes</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure o ritmo de envio de mensagens automáticas para evitar bloqueio do WhatsApp.
          As mensagens são enviadas em lotes com pausas entre eles.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="msg-delay" className="text-sm font-medium">
                Delay entre msgs
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="msg-delay"
                  type="number"
                  min={3}
                  max={60}
                  value={msgDelay}
                  onChange={(e) => setMsgDelay(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">seg</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">3–60 segundos</p>
            </div>

            <div>
              <Label htmlFor="msg-batch" className="text-sm font-medium">
                Msgs por lote
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="msg-batch"
                  type="number"
                  min={1}
                  max={20}
                  value={msgBatchSize}
                  onChange={(e) => setMsgBatchSize(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">msgs</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">1–20 mensagens</p>
            </div>

            <div>
              <Label htmlFor="msg-pause" className="text-sm font-medium">
                Pausa entre lotes
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="msg-pause"
                  type="number"
                  min={10}
                  max={300}
                  value={msgBatchPause}
                  onChange={(e) => setMsgBatchPause(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">seg</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">10–300 segundos</p>
            </div>
          </div>

          {/* Preview do ritmo */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Ritmo: <strong className="text-foreground">{msgBatchSize} msgs</strong> a cada{" "}
              <strong className="text-foreground">{msgDelay}s</strong>, pausa de{" "}
              <strong className="text-foreground">{msgBatchPause}s</strong> entre lotes
              {" "}→{" "}
              <strong className="text-foreground">~{msgsPerHour} msgs/hora</strong>
            </p>
          </div>

          <Button onClick={handleSaveBatchConfig} disabled={savingBatch}>
            {savingBatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar configuração
          </Button>
        </div>
      </div>

      {/* WhatsApp Session Card */}
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
                alt="QR Code WhatsApp"
                className="w-64 h-64"
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
            O administrador do sistema precisa configurar as credenciais WuzAPI para sua conta.
            Entre em contato com o administrador para habilitar o envio de mensagens via WhatsApp.
          </p>
        </div>
      )}

      {/* Help Card */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Como funciona?</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>1. O administrador configura as credenciais WuzAPI para sua conta</li>
          <li>2. Clique em <strong>Conectar WhatsApp</strong> e escaneie o QR Code</li>
          <li>3. Os lembretes automáticos usarão esta conexão para enviar mensagens</li>
          <li>4. Configure a <strong>Chave PIX</strong> para clientes que pagam via PIX sem automação</li>
          <li>5. Ajuste o <strong>Envio em Lotes</strong> para controlar o ritmo de envio e evitar bloqueios</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSettings;