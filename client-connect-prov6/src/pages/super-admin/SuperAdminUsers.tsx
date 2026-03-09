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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, UserCheck, UserX,
  Users, ArrowRightLeft, Search,
} from "lucide-react";
import { format } from "date-fns";

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────
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

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_by: string | null;
  subscription_end: string | null;
  _admin_name?: string;
}

type ModalMode = "create" | "edit" | null;

// ──────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────
export default function SuperAdminUsers() {
  const { toast } = useToast();

  // ── Admins tab ─────────────────────────────────────────────
  const [admins, setAdmins]           = useState<AdminProfile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalMode, setModalMode]     = useState<ModalMode>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminProfile | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", password: "",
    max_clients: 10000, max_users: 1000, subscription_days: 365,
  });

  // ── Migration tab ───────────────────────────────────────────
  const [users, setUsers]                 = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading]   = useState(false);
  const [filterAdmin, setFilterAdmin]     = useState<string>("all");
  const [searchUser, setSearchUser]       = useState("");
  const [migrateUser, setMigrateUser]     = useState<UserProfile | null>(null);
  const [targetAdmin, setTargetAdmin]     = useState("");
  const [migrating, setMigrating]         = useState(false);

  // ── Fetch admins ───────────────────────────────────────────
  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin");

    if (rolesError || !adminRoles?.length) { setAdmins([]); setLoading(false); return; }

    const adminIds = adminRoles.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles").select("*").in("user_id", adminIds)
      .order("created_at", { ascending: false });

    const adminsWithCount: AdminProfile[] = [];
    for (const p of (profiles || [])) {
      const { count } = await supabase.from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("created_by", p.user_id);
      adminsWithCount.push({ ...p, max_instances: p.max_instances || 1000, user_count: count || 0 });
    }
    setAdmins(adminsWithCount);
    setLoading(false);
  }, []);

  // ── Fetch users (for migration) ────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);

    const { data: userRoles } = await supabase
      .from("user_roles").select("user_id").eq("role", "user");
    const userIds = (userRoles || []).map(r => r.user_id);

    if (!userIds.length) { setUsers([]); setUsersLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, is_active, created_by, subscription_end")
      .in("user_id", userIds)
      .order("created_at", { ascending: false });

    // Enrich with admin name
    const adminMap: Record<string, string> = {};
    admins.forEach(a => { adminMap[a.user_id] = a.name || a.email; });

    setUsers((profiles || []).map(p => ({
      ...p,
      _admin_name: p.created_by ? (adminMap[p.created_by] || "Admin desconhecido") : "Sem admin",
    })));
    setUsersLoading(false);
  }, [admins]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  // ── Admin CRUD ─────────────────────────────────────────────
  const openCreate = () => {
    setForm({ name: "", email: "", password: "", max_clients: 10000, max_users: 1000, subscription_days: 365 });
    setSelectedAdmin(null);
    setModalMode("create");
  };

  const openEdit = (admin: AdminProfile) => {
    setSelectedAdmin(admin);
    setForm({ name: admin.name, email: admin.email, password: "", max_clients: admin.max_clients, max_users: admin.max_instances || 1000, subscription_days: 365 });
    setModalMode("edit");
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "create_admin", email: form.email, password: form.password, name: form.name, max_clients_per_user: form.max_clients, max_users: form.max_users, subscription_days: form.subscription_days },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Administrador criado com sucesso!" });
      setModalMode(null);
      fetchAdmins();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedAdmin) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "update_admin", user_id: selectedAdmin.user_id, max_clients_per_user: form.max_clients, max_users: form.max_users, password: form.password || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.from("profiles").update({ name: form.name }).eq("user_id", selectedAdmin.user_id);
      toast({ title: "Administrador atualizado!" });
      setModalMode(null);
      fetchAdmins();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const toggleActive = async (admin: AdminProfile) => {
    const { error } = await supabase.from("profiles").update({ is_active: !admin.is_active }).eq("user_id", admin.user_id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: admin.is_active ? "Admin desativado" : "Admin ativado" }); fetchAdmins(); }
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
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    setDeleting(null);
  };

  const extendSubscription = async (admin: AdminProfile, days: number) => {
    const current = admin.subscription_end ? new Date(admin.subscription_end) : new Date();
    const base = current > new Date() ? current : new Date();
    base.setDate(base.getDate() + days);
    const { error } = await supabase.from("profiles").update({ subscription_end: base.toISOString(), is_active: true }).eq("user_id", admin.user_id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: `Assinatura estendida em ${days} dias` }); fetchAdmins(); }
  };

  // ── Migration ──────────────────────────────────────────────
  const openMigrateTab = () => {
    if (!users.length) fetchUsers();
  };

  const openMigrate = (u: UserProfile) => {
    setMigrateUser(u);
    setTargetAdmin("");
  };

  const handleMigrate = async () => {
    if (!migrateUser || !targetAdmin) return;
    setMigrating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ created_by: targetAdmin })
        .eq("user_id", migrateUser.user_id);

      if (error) throw error;

      const adminName = admins.find(a => a.user_id === targetAdmin)?.name || targetAdmin;
      toast({ title: `Usuário migrado para ${adminName}` });
      setMigrateUser(null);
      // Refresh list
      fetchUsers();
      fetchAdmins();
    } catch (e: any) {
      toast({ title: "Erro ao migrar", description: e.message, variant: "destructive" });
    }
    setMigrating(false);
  };

  const filteredUsers = users.filter(u => {
    const matchAdmin = filterAdmin === "all" || u.created_by === filterAdmin;
    const matchSearch = !searchUser ||
      u.name?.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchUser.toLowerCase());
    return matchAdmin && matchSearch;
  });

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="admins">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Administradores</h1>
            <p className="text-muted-foreground">Gerencie os donos de servidor e seus usuários</p>
          </div>
          <TabsList>
            <TabsTrigger value="admins">
              <Users className="h-4 w-4 mr-1.5" /> Admins
            </TabsTrigger>
            <TabsTrigger value="migrate" onClick={openMigrateTab}>
              <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Migrar Usuários
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── ABA ADMINS ── */}
        <TabsContent value="admins" className="mt-6">
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={fetchAdmins}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Novo Admin
            </Button>
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
                          {admin.subscription_end ? format(new Date(admin.subscription_end), "dd/MM/yyyy") : "—"}
                          {isExpired && <Badge variant="destructive" className="ml-2 text-xs">Vencido</Badge>}
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
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(admin)} disabled={deleting === admin.user_id}>
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
        </TabsContent>

        {/* ── ABA MIGRAR USUÁRIOS ── */}
        <TabsContent value="migrate" className="mt-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {/* Filtro por admin */}
              <Select value={filterAdmin} onValueChange={setFilterAdmin}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filtrar por admin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os admins</SelectItem>
                  {admins.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.name || a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Busca por nome/email */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar usuário..."
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                />
              </div>

              <Button variant="outline" size="sm" onClick={fetchUsers} disabled={usersLoading}>
                {usersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>

              <span className="text-sm text-muted-foreground ml-auto">
                {filteredUsers.length} usuário(s)
              </span>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                Nenhum usuário encontrado
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Admin atual</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assinatura</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                        <TableCell>
                          <span className="text-sm">{u._admin_name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? "default" : "secondary"}>
                            {u.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.subscription_end ? format(new Date(u.subscription_end), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMigrate(u)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                            Migrar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Modal Criar / Editar Admin ── */}
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
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={modalMode === "edit"} placeholder="admin@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Senha {modalMode === "edit" && "(deixe vazio para manter)"}</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required={modalMode === "create"} />
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

      {/* ── Modal Confirmar Migração ── */}
      <Dialog open={!!migrateUser} onOpenChange={() => setMigrateUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Migrar Usuário</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Usuário:</span> <strong>{migrateUser?.name || migrateUser?.email}</strong></p>
              <p><span className="text-muted-foreground">Admin atual:</span> <strong>{migrateUser?._admin_name}</strong></p>
            </div>

            <div className="space-y-2">
              <Label>Novo admin de destino</Label>
              <Select value={targetAdmin} onValueChange={setTargetAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o admin de destino" />
                </SelectTrigger>
                <SelectContent>
                  {admins
                    .filter(a => a.user_id !== migrateUser?.created_by)
                    .map(a => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.name || a.email}
                        <span className="text-muted-foreground ml-1 text-xs">· {a.user_count}/{a.max_instances} users</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              O usuário passará a usar as configurações (planos, painel IPTV, WhatsApp) do novo admin. Seus clientes e dados permanecem intactos.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrateUser(null)}>Cancelar</Button>
            <Button onClick={handleMigrate} disabled={!targetAdmin || migrating}>
              {migrating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar migração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}