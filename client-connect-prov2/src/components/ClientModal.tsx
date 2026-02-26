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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

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

export function ClientModal({ open, onClose, client, onSaved }: ClientModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [panelCreds, setPanelCreds] = useState<PanelCred[]>([]);

  const [form, setForm] = useState({
    name: "", whatsapp_number: "", plan_id: "", plan_option_id: "",
    price_value: "", due_date: "", notes: "", username: "", suffix: "",
    is_active: true, payment_type: "pix",
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
        });
      };
      loadClient();
    } else {
      setForm({
        name: "", whatsapp_number: "", plan_id: "", plan_option_id: "",
        price_value: "", due_date: "", notes: "", username: "", suffix: "",
        is_active: true, payment_type: "pix",
      });
    }
  }, [client, open]);

  // Derived state
  const selectedPlan = plans.find(p => p.id === form.plan_id);
  const panelCred = panelCreds.find(pc => pc.id === selectedPlan?.panel_credential_id);
  const providerRequiresClientId = panelCred?.provider === "koffice" || panelCred?.provider === "club";
  const planOptions = selectedPlan?.plan_options || [];

  // Auto-fill price when option changes
  const handleOptionChange = (optionId: string) => {
    set("plan_option_id", optionId);
    const option = planOptions.find(o => o.id === optionId);
    if (option && option.price > 0) {
      set("price_value", String(option.price));
    }
  };

  // Reset option when plan changes
  const handlePlanChange = (planId: string) => {
    set("plan_id", planId);
    set("plan_option_id", "");
    // If new plan has only 1 option, auto-select it
    const newPlan = plans.find(p => p.id === planId);
    const opts = newPlan?.plan_options || [];
    if (opts.length === 1) {
      set("plan_option_id", opts[0].id);
      if (opts[0].price > 0) set("price_value", String(opts[0].price));
    }
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
            <Input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)} placeholder="5511999999999" />
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

          {/* Ativo */}
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
            <Label>Ativo</Label>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label>{providerRequiresClientId ? "ID no Painel *" : "Username (painel)"}</Label>
            <Input value={form.username} onChange={e => set("username", e.target.value)} placeholder="ID ou username do cliente" />
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
