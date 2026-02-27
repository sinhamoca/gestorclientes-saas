import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, UserCheck, UserX, Users,
} from "lucide-react";
import { format } from "date-fns";

interface AdminProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  subscription_start: string | null;
  subscription_end: string | null;
  max_clients: number;
  max_instances: number;
  user_count?: number;
}

type ModalMode = "create" | "edit" | null;

export default function SuperAdminUsers() {
  const { toast } = useToast();
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", password: "",
    max_clients: 10000, max_users: 1000,
    subscription_days: 365,
  });

  const fetchAdmins = useCallback(async () => {
    setLoading(true);

    // Get all admin role user_ids
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      setAdmins([]);
      setLoading(false);
      return;
    }

    const adminIds = (adminRoles || []).map(r => r.user_id);

    if (adminIds.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }

    // Get profiles for those admins
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", adminIds)
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      setAdmins([]);
      setLoading(false);
      return;
    }

    // Count users per admin (using owner_id column)
    const adminsWithCount: AdminProfile[] = [];
    for (const p of (profiles || [])) {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("created_by", p.user_id);

      adminsWithCount.push({
        ...p,
        max_instances: p.max_instances || 1000,
        user_count: count || 0,
      });
    }

    setAdmins(adminsWithCount);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const openCreate = () => {
    setForm({ name: "", email: "", password: "", max_clients: 10000, max_users: 1000, subscription_days: 365 });
    setSelectedAdmin(null);
    setModalMode("create");
  };

  const openEdit = (admin: AdminProfile) => {
    setSelectedAdmin(admin);
    setForm({
      name: admin.name,
      email: admin.email,
      password: "",
      max_clients: admin.max_clients,
      max_users: admin.max_instances || 1000,
      subscription_days: 365,
    });
    setModalMode("edit");
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_admin",
          email: form.email,
          password: form.password,
          name: form.name,
          max_clients_per_user: form.max_clients,
          max_users: form.max_users,
          subscription_days: form.subscription_days,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Administrador criado com sucesso!" });
      setModalMode(null);
      fetchAdmins();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedAdmin) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "update_admin",
          user_id: selectedAdmin.user_id,
          max_clients_per_user: form.max_clients,
          max_users: form.max_users,
          password: form.password || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update name directly (edge function doesn't handle it)
      await supabase.from("profiles").update({
        name: form.name,
      }).eq("user_id", selectedAdmin.user_id);

      toast({ title: "Administrador atualizado!" });
      setModalMode(null);
      fetchAdmins();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleActive = async (admin: AdminProfile) => {
    const { error } = await supabase.from("profiles")
      .update({ is_active: !admin.is_active })
      .eq("user_id", admin.user_id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: admin.is_active ? "Admin desativado" : "Admin ativado" });
      fetchAdmins();
    }
  };

  const handleDelete = async (admin: AdminProfile) => {
    if (!confirm(`Excluir admin "${admin.name}" e TODOS os seus usuários? Esta ação não pode ser desfeita.`)) return;
    setDeleting(admin.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete_admin", user_id: admin.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Admin excluído" });
      fetchAdmins();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setDeleting(null);
  };

  const extendSubscription = async (admin: AdminProfile, days: number) => {
    const current = admin.subscription_end ? new Date(admin.subscription_end) : new Date();
    const base = current > new Date() ? current : new Date();
    base.setDate(base.getDate() + days);

    const { error } = await supabase.from("profiles")
      .update({ subscription_end: base.toISOString(), is_active: true })
      .eq("user_id", admin.user_id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Assinatura estendida em ${days} dias` });
      fetchAdmins();
    }
  };

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
          <h1 className="text-2xl font-bold">Administradores</h1>
          <p className="text-muted-foreground">Gerencie os donos de servidor que usam o sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAdmins}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo Admin
          </Button>
        </div>
      </div>

      {admins.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          Nenhum administrador cadastrado. Clique em "Novo Admin" para começar.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Max Clientes</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map(admin => {
                const isExpired = admin.subscription_end && new Date(admin.subscription_end) < new Date();
                return (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.name}</TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {admin.user_count || 0}/{admin.max_instances || 1000}
                      </div>
                    </TableCell>
                    <TableCell>{admin.max_clients}</TableCell>
                    <TableCell>
                      {admin.subscription_end
                        ? format(new Date(admin.subscription_end), "dd/MM/yyyy")
                        : "—"}
                      {isExpired && (
                        <Badge variant="destructive" className="ml-2 text-xs">Vencido</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.is_active ? "default" : "secondary"}>
                        {admin.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => extendSubscription(admin, 30)} title="+30 dias">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => toggleActive(admin)}>
                        {admin.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(admin)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleDelete(admin)}
                        disabled={deleting === admin.user_id}
                      >
                        {deleting === admin.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={!!modalMode} onOpenChange={() => setModalMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalMode === "create" ? "Novo Administrador" : "Editar Administrador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome do admin" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                disabled={modalMode === "edit"}
                placeholder="admin@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha {modalMode === "edit" && "(deixe vazio para manter)"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required={modalMode === "create"}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Máx. Clientes (por user)</Label>
                <Input type="number" value={form.max_clients} onChange={e => setForm({ ...form, max_clients: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Máx. Usuários</Label>
                <Input type="number" value={form.max_users} onChange={e => setForm({ ...form, max_users: +e.target.value })} />
              </div>
            </div>
            {modalMode === "create" && (
              <div className="space-y-2">
                <Label>Dias de assinatura</Label>
                <Input type="number" value={form.subscription_days} onChange={e => setForm({ ...form, subscription_days: +e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
            <Button onClick={modalMode === "create" ? handleCreate : handleEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {modalMode === "create" ? "Criar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
