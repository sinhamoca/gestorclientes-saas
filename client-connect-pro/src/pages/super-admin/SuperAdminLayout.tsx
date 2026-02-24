import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Loader2, Users, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SuperAdminLayout() {
  const { user, isSuperAdmin, loading, signOut } = useSuperAdmin();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return <Navigate to="/super-admin/login" replace />;
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      isActive
        ? "bg-destructive/10 text-destructive font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 border-r border-border flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="p-1.5 rounded-lg bg-destructive/10">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <span className="font-bold text-lg">Super Admin</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/super-admin/admins" className={linkClass}>
            <Users className="h-4 w-4" />
            <span>Administradores</span>
          </NavLink>
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground px-3 truncate">{user.email}</p>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
