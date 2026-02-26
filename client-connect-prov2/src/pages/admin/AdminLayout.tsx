import { useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2, Users, Settings, LogOut, Shield, Package, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout() {
  const { user, isAdmin, loading, signOut } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      isActive
        ? "bg-primary/10 text-primary font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const sidebarContent = (
    <>
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-destructive/10">
            <Shield className="h-5 w-5 text-destructive" />
          </div>
          <span className="font-bold text-lg">Admin Panel</span>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <NavLink to="/admin/users" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Users className="h-4 w-4" />
          <span>Usuários</span>
        </NavLink>
        <NavLink to="/admin/platform-plans" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Package className="h-4 w-4" />
          <span>Planos da Plataforma</span>
        </NavLink>
        <NavLink to="/admin/settings" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Settings className="h-4 w-4" />
          <span>Configurações</span>
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
    </>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border flex flex-col
        transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="h-14 flex items-center gap-4 border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Admin Panel</span>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}