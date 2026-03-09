import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, CreditCard, Globe, Key } from "lucide-react";

export default function AdminSettings() {
  const { user } = useAdmin();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trialDays, setTrialDays] = useState("30");
  const [mpToken, setMpToken] = useState("");
  const [savingMp, setSavingMp] = useState(false);
  const [renewalKey, setRenewalKey] = useState("");
  const [savingRenewal, setSavingRenewal] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .eq("user_id", user.id)
        .in("key", ["default_trial_days", "admin_mp_access_token", "renewal_api_key"]);

      if (data) {
        const trial = data.find(s => s.key === "default_trial_days");
        const mp = data.find(s => s.key === "admin_mp_access_token");
        const rKey = data.find(s => s.key === "renewal_api_key");
        if (trial) setTrialDays(trial.value);
        if (mp) setMpToken(mp.value);
        if (rKey) setRenewalKey(rKey.value);
      }
      setLoading(false);
    };
    fetchSettings();
  }, [user]);

  const upsertSetting = async (key: string, value: string) => {
    if (!user) return { error: new Error("Not authenticated") };
    return supabase
      .from("system_settings")
      .upsert(
        { user_id: user.id, key, value },
        { onConflict: "user_id,key" }
      );
  };

  const handleSaveTrial = async () => {
    setSaving(true);
    const { error } = await upsertSetting("default_trial_days", trialDays);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Configuração salva!" });
    setSaving(false);
  };

  const handleSaveMp = async () => {
    setSavingMp(true);
    const { error } = await upsertSetting("admin_mp_access_token", mpToken.trim());
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Token do Mercado Pago salvo!" });
    setSavingMp(false);
  };

  const handleSaveRenewal = async () => {
    setSavingRenewal(true);
    const { error } = await upsertSetting("renewal_api_key", renewalKey.trim());
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "API Key de Renovação salva!" });
    setSavingRenewal(false);
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
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configure os parâmetros do seu sistema</p>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <h2 className="font-semibold mb-4">Período de Teste</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Quantos dias um novo usuário terá para usar o sistema após ser criado.
        </p>
        <div className="space-y-2">
          <Label>Dias padrão de teste</Label>
          <Input type="number" min="1" max="365" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
        </div>
        <Button className="mt-4" onClick={handleSaveTrial} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Mercado Pago</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure seu Access Token do Mercado Pago para receber pagamentos de renovação dos planos.
          Os seus usuários pagarão usando estas credenciais.
        </p>
        <div className="space-y-2">
          <Label>Access Token</Label>
          <Input type="password" value={mpToken} onChange={(e) => setMpToken(e.target.value)} placeholder="APP_USR-..." />
        </div>
        <Button className="mt-4" onClick={handleSaveMp} disabled={savingMp}>
          {savingMp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar Token
        </Button>
      </div>

      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">API de Renovação IPTV</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure a chave da API de renovação. Seus revendedores usarão esta credencial para renovar clientes automaticamente.
        </p>
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input type="password" value={renewalKey} onChange={(e) => setRenewalKey(e.target.value)} placeholder="irapi_live_xxxxx" />
        </div>
        <Button className="mt-4" onClick={handleSaveRenewal} disabled={savingRenewal}>
          {savingRenewal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar API Key
        </Button>
      </div>
    </div>
  );
}