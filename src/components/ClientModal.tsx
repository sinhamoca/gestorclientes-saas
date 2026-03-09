import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { encryptSingle, decryptSingle } from "@/lib/crypto";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, RefreshCw, ShieldOff } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  code: number | null;
  panel_credential_id?: string | null;
  plan_options?: PlanOptionItem[];
}

interface PlanOptionItem {
  id: string;
  label: string;
  duration_months: number;
  num_screens: number;
  price: number;
}

interface PanelCred { id: string; provider: string; }

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  client: any | null;
  onSaved: () => void;
}

const SEARCHABLE_PROVIDERS = ["cloudnation", "koffice"];

export function ClientModal({ open, onClose, client, onSaved }: ClientModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [panelCreds, setPanelCreds] = useState<PanelCred[]>([]);
  const [searchingId, setSearchingId] = useState(false);

  const [form, setForm] = useState({
    name: "", whatsapp_number: "", plan_id: "", plan_option_id: "",
    price_value: "", due_date: "", notes: "", username: "", suffix: "",
    is_active: true, payment_type: "pix", recurrent_payment: false,
    skip_iptv_renewal_until: "",
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("plans")
      .select("id, name, code, panel_credential_id, plan_options(id, label, duration_months, num_screens, price)")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => setPlans(data || []));
    supabase
      .from("panel_credentials")
      .select("id, provider")
      .eq("user_id", user.id)
      .then(({ data }) => setPanelCreds(data || []));
  }, [user]);

  useEffect(() => {
    if (client) {
      const loadClient = async () => {
        const decryptedWhatsapp = await decryptSingle(client.whatsapp_number);
        setForm({
          name: client.name || "",
          whatsapp_number: decryptedWhatsapp || "",
          plan_id: client.plan_id || "",
          plan_option_id: client.plan_option_id || "",
          price_value: String(client.price_value || ""),
          due_date: client.due_date || "",
          notes: client.notes || "",
          username: client.username || "",
          suffix: client.suffix || "",
          is_active: client.is_active ?? true,
          payment_type: client.payment_type || "pix",
          recurrent_payment: client.recurrent_payment ?? false,
          skip_iptv_renewal_until: client.skip_iptv_renewal_until || "",
        });
      };
      loadClient();
    } else {
      setForm({
        name: "", whatsapp_number: "", plan_id: "", plan_option_id: "",
        price_value: "", due_date: "", notes: "", username: "", suffix: "",
        is_active: true, payment_type: "pix", recurrent_payment: false,
        skip_iptv_renewal_until: "",
      });
    }
  }, [client, open]);

  const selectedPlan = plans.find(p => p.id === form.plan_id);
  const panelCred = panelCreds.find(pc => pc.id === selectedPlan?.panel_credential_id);
  const providerRequiresClientId = panelCred?.provider === "koffice" || panelCred?.provider === "club";
  const providerSupportsSearch = panelCred && SEARCHABLE_PROVIDERS.includes(panelCred.provider);
  const planOptions = selectedPlan?.plan_options || [];

  // skip_iptv ativo = data preenchida E >= hoje
  const today = new Date().toISOString().split("T")[0];
  const skipIptvActive = !!form.skip_iptv_renewal_until && form.skip_iptv_renewal_until >= today;

  const handleOptionChange = (optionId: string) => {
    set("plan_option_id", optionId);
    const option = planOptions.find(o => o.id === optionId);
    if (option && option.price > 0) set("price_value", String(option.price));
  };

  const handlePlanChange = (planId: string) => {
    set("plan_id", planId);
    set("plan_option_id", "");
    const newPlan = plans.find(p => p.id === planId);
    const opts = newPlan?.plan_options || [];
    if (opts.length === 1) {
      set("plan_option_id", opts[0].id);
      if (opts[0].price > 0) set("price_value", String(opts[0].price));
    }
  };

  const handleSearchId = async () => {
    if (!form.name.trim()) {
      toast({ title: "Preencha o nome do cliente primeiro", variant: "destructive" });
      return;
    }
    if (!selectedPlan?.panel_credential_id) {
      toast({ title: "Plano sem credencial de painel vinculada", variant: "destructive" });
      return;
    }
    setSearchingId(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-client", {
        body: {
          client_name: form.name.trim(),
          panel_credential_id: selectedPlan.panel_credential_id,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.success && data?.client?.id) {
        set("username", String(data.client.id));
        toast({ title: "ID capturado!", description: `Cliente "${data.client.name}" → ID ${data.client.id}` });
      } else {
        toast({
          title: "Cliente não encontrado",
          description: data?.error || `"${form.name}" não foi encontrado no painel ${panelCred?.provider}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Erro ao buscar ID", description: e.message || "Falha na comunicação com o painel", variant: "destructive" });
    }
    setSearchingId(false);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    if (providerRequiresClientId && !form.username.trim()) {
      toast({
        title: "ID do cliente no painel é obrigatório",
        description: `O provider ${panelCred?.provider} exige o campo ID/Username.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);

    const encryptedWhatsapp = await encryptSingle(form.whatsapp_number || null);

    const payload: any = {
      user_id: user.id,
      name: form.name.trim(),
      whatsapp_number: encryptedWhatsapp,
      plan_id: form.plan_id || null,
      plan_option_id: form.plan_option_id || null,
      price_value: parseFloat(form.price_value) || 0,
      due_date: form.due_date || null,
      notes: form.notes || null,
      username: form.username || null,
      suffix: form.suffix || null,
      is_active: form.is_active,
      payment_type: form.payment_type,
      recurrent_payment: form.recurrent_payment,
      skip_iptv_renewal_until: form.skip_iptv_renewal_until || null,
    };

    const { error } = client
      ? await supabase.from("clients").update(payload).eq("id", client.id)
      : await supabase.from("clients").insert(payload);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: client ? "Cliente atualizado" : "Cliente criado" });
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* Nome */}
          <div className="col-span-2 space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome do cliente" />
          </div>

          {/* WhatsApp */}
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value.replace(/\D/g, ""))} placeholder="5511999999999" type="tel" inputMode="numeric" />
          </div>

          {/* Plano */}
          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={form.plan_id} onValueChange={handlePlanChange}>
              <SelectTrigger><SelectValue placeholder="Selecionar plano" /></SelectTrigger>
              <SelectContent>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ` : ""}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opção do Plano */}
          {planOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Opção do Plano</Label>
              <Select value={form.plan_option_id} onValueChange={handleOptionChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar opção" /></SelectTrigger>
                <SelectContent>
                  {planOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label} — {o.duration_months}m {o.num_screens}t R${Number(o.price).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Valor */}
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={form.price_value} onChange={e => set("price_value", e.target.value)} />
          </div>

          {/* Vencimento */}
          <div className="space-y-2">
            <Label>Vencimento</Label>
            <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </div>

          {/* Tipo Pagamento */}
          <div className="space-y-2">
            <Label>Tipo Pagamento</Label>
            <Select value={form.payment_type} onValueChange={v => set("payment_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Switches: Ativo + Recorrente */}
          <div className="col-span-2 flex flex-wrap items-center gap-6 pt-2">
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
              <Label>Ativo</Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.recurrent_payment}
                onCheckedChange={v => set("recurrent_payment", v)}
              />
              <div className="flex items-center gap-2">
                <Label>Pagamento Recorrente</Label>
                {form.recurrent_payment && (
                  <Badge variant="outline" className="text-xs text-primary border-primary/40 flex items-center gap-1">
                    <RefreshCw className="h-2.5 w-2.5" />
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Aviso recorrente */}
          {form.recurrent_payment && (
            <div className="col-span-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
              Cliente com pagamento recorrente ativo. Use a aba <span className="font-medium text-primary">Pag. Recorrente</span> para enviar o link de cadastro do cartão.
            </div>
          )}

          {/* ── Pular Renovação IPTV ── */}
          <div className="col-span-2 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Switch
                checked={skipIptvActive}
                onCheckedChange={v => {
                  if (v) {
                    // Ao ativar, pré-preenche com 1 mês à frente
                    const d = new Date();
                    d.setMonth(d.getMonth() + 1);
                    set("skip_iptv_renewal_until", d.toISOString().split("T")[0]);
                  } else {
                    set("skip_iptv_renewal_until", "");
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Label>Pular renovação IPTV</Label>
                {skipIptvActive && (
                  <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500/40 bg-yellow-500/10 flex items-center gap-1">
                    <ShieldOff className="h-2.5 w-2.5" />
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Campo de data — só aparece quando o toggle está ativo */}
          {skipIptvActive && (
            <div className="col-span-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                O pagamento renova normalmente no GestãoPro mas <strong>não aciona</strong> o painel IPTV até a data abaixo. Um alerta aparecerá nos Logs de Renovação se o cliente ficar inadimplente.
              </p>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground shrink-0">Pular IPTV até:</Label>
                <Input
                  type="date"
                  value={form.skip_iptv_renewal_until}
                  onChange={e => set("skip_iptv_renewal_until", e.target.value)}
                  className="max-w-[180px] h-8 text-sm"
                  min={today}
                />
              </div>
            </div>
          )}

          {/* Username + Capturar ID */}
          <div className="space-y-2">
            <Label>{providerRequiresClientId ? "ID no Painel *" : "Username (painel)"}</Label>
            <div className="flex gap-2">
              <Input
                value={form.username}
                onChange={e => set("username", e.target.value)}
                placeholder="ID ou username do cliente"
                className="flex-1"
              />
            </div>
            {providerSupportsSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={handleSearchId}
                disabled={searchingId || !form.name.trim()}
              >
                {searchingId ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Buscando no painel...</>
                ) : (
                  <><Search className="mr-2 h-3.5 w-3.5" />Capturar ID</>
                )}
              </Button>
            )}
          </div>

          {/* Suffix */}
          <div className="space-y-2">
            <Label>Sufixo</Label>
            <Input value={form.suffix} onChange={e => set("suffix", e.target.value)} placeholder="Sufixo (opcional)" />
          </div>

          {/* Notas */}
          <div className="col-span-2 space-y-2">
            <Label>Observações</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Notas sobre o cliente" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {client ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
