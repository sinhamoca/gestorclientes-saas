import {
  Users, LayoutDashboard, Package, LogOut,
  MessageSquare, Bell, CreditCard, BarChart3, Settings, Zap, KeyRound, Crown, Monitor, Megaphone, FileUp, FileText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes", url: "/dashboard/clients", icon: Users },
  { title: "Planos", url: "/dashboard/plans", icon: Package },
  { title: "Painéis IPTV", url: "/dashboard/panels", icon: Monitor },
  { title: "Logs Renovação", url: "/dashboard/renewal-logs", icon: FileText },
];

const automationItems = [
  { title: "Templates", url: "/dashboard/templates", icon: MessageSquare },
  { title: "Lembretes", url: "/dashboard/reminders", icon: Bell },
  { title: "Logs WhatsApp", url: "/dashboard/message-logs", icon: FileText },
  { title: "Campanhas", url: "/dashboard/campaigns", icon: Megaphone }
];

const financeItems = [
  { title: "Financeiro", url: "/dashboard/financial", icon: BarChart3 },
  { title: "Gateway Pagamento", url: "/dashboard/payment-config", icon: CreditCard },
  { title: "Configurações", url: "/dashboard/payments", icon: Settings },
  { title: "Alterar Senha", url: "/dashboard/change-password", icon: KeyRound },
  { title: "Renovar Plano", url: "/dashboard/renew-plan", icon: Crown },
  { title: "Importador", url: "/dashboard/client-importer", icon: FileUp },
];

export function AppSidebar() {
  const { signOut } = useAuth();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <span className="font-bold text-sidebar-accent-foreground text-lg">Super Gestor Pro</span>
      </div>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-1">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-1">
            Automação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {automationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-1">
            Financeiro
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financeItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-3 text-sidebar-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </Button>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
