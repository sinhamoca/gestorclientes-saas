import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, UserCheck, UserX, CalendarPlus,
} from "lucide-react";
import { format } from "date-fns";

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
  max_clients: number;
  max_instances: number;
  wuzapi_url: string | null;
  wuzapi_token: string | null;
}

interface PlatformPlan {
  id: string;
  name: string;
  duration_days: number;
  max_clients: number;
  price: number;
}

type ModalMode = "create" | "edit" | null;

export default function AdminUsers() {
  const { user } = useAdmin();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Renewal dialog
  const [renewUser, setRenewUser] = useState<UserProfile | null>(null);
  const [renewDays, setRenewDays] = useState(30);
  const [renewCustom, setRenewCustom] = useState(false);
  const [renewSaving, setRenewSaving] = useState(false);
  const [platformPlans, setPlatformPlans] = useState<PlatformPlan[]>([]);

  const [form, setForm] = useState({
    name: "", email: "", password: "",
    wuzapi_url: "", wuzapi_token: "",
    max_clients: 100, max_instances: 1,
    subscription_days: 30,
  });

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    setUsers(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Fetch platform plans for renewal dialog
  useEffect(() => {
    if (!user) return;
    supabase
      .from("platform_plans")
      .select("id, name, duration_days, max_clients, price")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("duration_days", { ascending: true })
      .then(({ data }) => setPlatformPlans(data || []));
  }, [user]);

  const openCreate = () => {
    setForm({
      name: "", email: "", password: "",
      wuzapi_url: "", wuzapi_token: "",
      max_clients: 100, max_instances: 1, subscription_days: 30,
    });
    setSelectedUser(null);
    setModalMode("create");
  };

  const openEdit = (u: UserProfile) => {
    setSelectedUser(u);
    setForm({
      name: u.name, email: u.email, password: "",
      wuzapi_url: u.wuzapi_url || "",
      wuzapi_token: u.wuzapi_token || "",
      max_clients: u.max_clients,
      max_instances: u.max_instances,
      subscription_days: 30,
    });
    setModalMode("edit");
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_user",
          email: form.email,
          password: form.password,
          name: form.name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const userId = data.user.id;
      await new Promise(r => setTimeout(r, 1500));

      await supabase.from("profiles").update({
        wuzapi_url: form.wuzapi_url || null,
        wuzapi_token: form.wuzapi_token || null,
        max_clients: form.max_clients,
        max_instances: form.max_instances,
        subscription_end: new Date(Date.now() + form.subscription_days * 86400000).toISOString(),
      }).eq("user_id", userId);

      toast({ title: "Usuário criado com sucesso!" });
      setModalMode(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        name: form.name,
        wuzapi_url: form.wuzapi_url || null,
        wuzapi_token: form.wuzapi_token || null,
        max_clients: form.max_clients,
        max_instances: form.max_instances,
      }).eq("user_id", selectedUser.user_id);

      if (error) throw error;

      if (form.password) {
        const { data, error: pwError } = await supabase.functions.invoke("admin-users", {
          body: { action: "update_password", user_id: selectedUser.user_id, password: form.password },
        });
        if (pwError) throw pwError;
        if (data?.error) throw new Error(data.error);
      }

      toast({ title: "Usuário atualizado!" });
      setModalMode(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleActive = async (u: UserProfile) => {
    const { error } = await supabase.from("profiles")
      .update({ is_active: !u.is_active })
      .eq("user_id", u.user_id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: u.is_active ? "Usuário desativado" : "Usuário ativado" });
      fetchUsers();
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`Excluir "${u.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(u.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete_user", user_id: u.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário excluído" });
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setDeleting(null);
  };

  // ═══════════════════════════════════════════
  //  RENOVAÇÃO MANUAL
  // ═══════════════════════════════════════════

  const openRenewDialog = (u: UserProfile) => {
    setRenewUser(u);
    setRenewDays(30);
    setRenewCustom(false);
  };

  const handleRenew = async () => {
    if (!renewUser || renewDays <= 0) return;
    setRenewSaving(true);

    try {
      const current = renewUser.subscription_end
        ? new Date(renewUser.subscription_end)
        : new Date();
      const base = current > new Date() ? current : new Date();
      base.setDate(base.getDate() + renewDays);

      const { error } = await supabase.from("profiles")
        .update({
          subscription_end: base.toISOString(),
          is_active: true,
        })
        .eq("user_id", renewUser.user_id);

      if (error) throw error;

      toast({
        title: "Assinatura renovada!",
        description: `${renewUser.name} — +${renewDays} dias (até ${format(base, "dd/MM/yyyy")})`,
      });
      setRenewUser(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setRenewSaving(false);
  };

  const handleRenewByPlan = async (plan: PlatformPlan) => {
    if (!renewUser) return;
    setRenewSaving(true);

    try {
      const current = renewUser.subscription_end
        ? new Date(renewUser.subscription_end)
        : new Date();
      const base = current > new Date() ? current : new Date();
      base.setDate(base.getDate() + plan.duration_days);

      const { error } = await supabase.from("profiles")
        .update({
          subscription_end: base.toISOString(),
          is_active: true,
          max_clients: plan.max_clients,
        })
        .eq("user_id", renewUser.user_id);

      if (error) throw error;

      toast({
        title: "Assinatura renovada pelo plano!",
        description: `${renewUser.name} — ${plan.name} (+${plan.duration_days} dias, até ${format(base, "dd/MM/yyyy")})`,
      });
      setRenewUser(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setRenewSaving(false);
  };

  // ═══════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do seu sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo Usuário
          </Button>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          Nenhum usuário cadastrado. Clique em "Novo Usuário" para começar.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Max Clientes</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => {
                const isExpired = u.subscription_end && new Date(u.subscription_end) < new Date();
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.max_clients}</TableCell>
                    <TableCell>
                      {u.subscription_end
                        ? format(new Date(u.subscription_end), "dd/MM/yyyy")
                        : "—"}
                      {isExpired && <Badge variant="destructive" className="ml-2 text-xs">Vencido</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.wuzapi_url ? "default" : "secondary"}>
                        {u.wuzapi_url ? "Configurado" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "default" : "secondary"}>
                        {u.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openRenewDialog(u)}>
                            <CalendarPlus className="h-4 w-4 text-green-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Renovar assinatura</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => toggleActive(u)}>
                            {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{u.is_active ? "Desativar" : "Ativar"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(u)} disabled={deleting === u.user_id}>
                            {deleting === u.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/*  RENEWAL DIALOG                             */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={!!renewUser} onOpenChange={() => setRenewUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-green-500" />
              Renovar Assinatura
            </DialogTitle>
            <DialogDescription>
              {renewUser?.name} — {renewUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current subscription info */}
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <p className="text-muted-foreground">
                Assinatura atual:
                <strong className="text-foreground ml-1">
                  {renewUser?.subscription_end
                    ? format(new Date(renewUser.subscription_end), "dd/MM/yyyy")
                    : "Sem data"}
                </strong>
                {renewUser?.subscription_end && new Date(renewUser.subscription_end) < new Date() && (
                  <Badge variant="destructive" className="ml-2 text-xs">Vencido</Badge>
                )}
              </p>
            </div>

            {/* Quick days buttons */}
            <div className="space-y-2">
              <Label>Estender por dias:</Label>
              <div className="flex flex-wrap gap-2">
                {[7, 15, 30, 60, 90].map(d => (
                  <Button
                    key={d}
                    size="sm"
                    variant={renewDays === d && !renewCustom ? "default" : "outline"}
                    onClick={() => { setRenewDays(d); setRenewCustom(false); }}
                  >
                    {d} dias
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={renewCustom ? "default" : "outline"}
                  onClick={() => setRenewCustom(true)}
                >
                  Outro
                </Button>
              </div>
              {renewCustom && (
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={renewDays}
                  onChange={e => setRenewDays(parseInt(e.target.value) || 30)}
                  placeholder="Número de dias"
                  className="w-32 mt-2"
                />
              )}
            </div>

            {/* Platform plans shortcut */}
            {platformPlans.length > 0 && (
              <div className="space-y-2">
                <Label>Ou aplicar um plano:</Label>
                <div className="space-y-1.5">
                  {platformPlans.map(plan => (
                    <button
                      key={plan.id}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/50 transition-colors text-sm text-left"
                      onClick={() => handleRenewByPlan(plan)}
                      disabled={renewSaving}
                    >
                      <div>
                        <span className="font-medium">{plan.name}</span>
                        <span className="text-muted-foreground ml-2">{plan.duration_days} dias</span>
                      </div>
                      <div className="text-muted-foreground">
                        {plan.max_clients} clientes · R${Number(plan.price).toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewUser(null)}>Cancelar</Button>
            <Button onClick={handleRenew} disabled={renewSaving || renewDays <= 0}>
              {renewSaving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Renovando...</>
              ) : (
                <><CalendarPlus className="h-4 w-4 mr-2" /> +{renewDays} dias</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════ */}
      {/*  CREATE / EDIT MODAL                        */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={!!modalMode} onOpenChange={() => setModalMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalMode === "create" ? "Novo Usuário" : "Editar Usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                disabled={modalMode === "edit"}
              />
            </div>

            <div className="space-y-2">
              <Label>{modalMode === "edit" ? "Nova senha (deixe vazio para manter)" : "Senha"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Clientes</Label>
                <Input
                  type="number"
                  value={form.max_clients}
                  onChange={e => setForm(f => ({ ...f, max_clients: parseInt(e.target.value) || 100 }))}
                />
              </div>
              {modalMode === "create" && (
                <div className="space-y-2">
                  <Label>Dias de assinatura</Label>
                  <Input
                    type="number"
                    value={form.subscription_days}
                    onChange={e => setForm(f => ({ ...f, subscription_days: parseInt(e.target.value) || 30 }))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>WuzAPI URL</Label>
              <Input
                value={form.wuzapi_url}
                onChange={e => setForm(f => ({ ...f, wuzapi_url: e.target.value }))}
                placeholder="http://ip:porta"
              />
            </div>

            <div className="space-y-2">
              <Label>WuzAPI Token</Label>
              <Input
                value={form.wuzapi_token}
                onChange={e => setForm(f => ({ ...f, wuzapi_token: e.target.value }))}
                placeholder="Token de autenticação"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
            <Button
              onClick={modalMode === "create" ? handleCreate : handleEdit}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
              ) : (
                modalMode === "create" ? "Criar Usuário" : "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
