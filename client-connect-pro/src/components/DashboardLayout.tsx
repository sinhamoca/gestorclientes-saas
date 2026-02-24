import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";

export function DashboardLayout() {
  const { user, loading } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!user) {
      setCheckingAccess(false);
      return;
    }
    const checkSubscription = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active, subscription_end")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        const expired = profile.subscription_end
          ? new Date(profile.subscription_end) < new Date()
          : false;
        setBlocked(!profile.is_active || expired);
      }
      setCheckingAccess(false);
    };
    checkSubscription();
  }, [user]);

  if (loading || checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso Bloqueado</h1>
          <p className="text-muted-foreground">
            Sua assinatura expirou ou sua conta foi desativada. Entre em contato com o administrador para renovar seu acesso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 flex items-center gap-4 border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </header>
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
