import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingUp, TrendingDown,
  Clock, CalendarClock, CalendarX2, DollarSign, PiggyBank, CheckCircle2,
} from "lucide-react";

interface Stats {
  total: number;
  active: number;
  inactive: number;
  expiring: number;
  expired: number;
  expired30: number;
  expired60: number;
  expired90: number;
}

interface FinancialSummary {
  monthlyProjection: number;
  monthlyCost: number;
  monthlyProfit: number;
  yearlyProjection: number;
  yearlyCost: number;
  yearlyProfit: number;
  receivedMonth: number;
  receivedCostMonth: number;
  receivedProfitMonth: number;
  receivedYear: number;
  receivedCostYear: number;
  receivedProfitYear: number;
}

interface Profile {
  email: string;
  subscription_end: string | null;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, expiring: 0, expired: 0, expired30: 0, expired60: 0, expired90: 0 });
  const [financial, setFinancial] = useState<FinancialSummary>({
    monthlyProjection: 0, monthlyCost: 0, monthlyProfit: 0,
    yearlyProjection: 0, yearlyCost: 0, yearlyProfit: 0,
    receivedMonth: 0, receivedCostMonth: 0, receivedProfitMonth: 0,
    receivedYear: 0, receivedCostYear: 0, receivedProfitYear: 0,
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;

      const [{ data: clients }, { data: prof }, { data: paymentsMonth }, { data: paymentsYear }] = await Promise.all([
        supabase.from("clients")
          .select("id, is_active, due_date, price_value, plan_id, plan_option_id, plan_options(duration_months, cost)")
          .eq("user_id", user.id),
        supabase.from("profiles").select("email, subscription_end").eq("user_id", user.id).single(),
        supabase.from("payments")
          .select("amount, client_id")
          .eq("user_id", user.id)
          .gte("created_at", startOfMonth)
          .in("status", ["paid", "approved"]),
        supabase.from("payments")
          .select("amount, client_id")
          .eq("user_id", user.id)
          .gte("created_at", startOfYear)
          .in("status", ["paid", "approved"]),
      ]);

      if (prof) setProfile(prof);

      if (clients) {
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const in7Days = new Date(nowDate.getTime() + 7 * 86400000);
        const ago30 = new Date(nowDate.getTime() - 30 * 86400000);
        const ago60 = new Date(nowDate.getTime() - 60 * 86400000);
        const ago90 = new Date(nowDate.getTime() - 90 * 86400000);

        const withDue = clients.map(c => ({
          ...c,
          dueDate: c.due_date ? new Date(c.due_date) : null,
        }));

        setStats({
          total: clients.length,
          active: clients.filter(c => c.is_active).length,
          inactive: clients.filter(c => !c.is_active).length,
          expired: withDue.filter(c => c.dueDate && c.dueDate < nowDate).length,
          expiring: withDue.filter(c => c.dueDate && c.dueDate >= nowDate && c.dueDate <= in7Days).length,
          expired30: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago30).length,
          expired60: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago60).length,
          expired90: withDue.filter(c => c.dueDate && c.dueDate < nowDate && c.dueDate <= ago90).length,
        });

        const activeClients = (clients as any[]).filter(c => c.is_active);

        // Projeção Mensal: clientes cujo due_date cai no mês atual
        const monthlyProjection = activeClients.reduce((sum, c) => {
          if (!c.due_date) return sum;
          const [y, m] = c.due_date.split("-").map(Number);
          if (y === now.getFullYear() && m === now.getMonth() + 1) {
            return sum + Number(c.price_value || 0);
          }
          return sum;
        }, 0);

        const monthlyCost = activeClients.reduce((sum, c) => {
          if (!c.due_date) return sum;
          const [y, m] = c.due_date.split("-").map(Number);
          if (y === now.getFullYear() && m === now.getMonth() + 1) {
            return sum + Number(c.plan_options?.cost || 0);
          }
          return sum;
        }, 0);

        // Projeção Anual: price_value × (12 / duration_months)
        const yearlyProjection = activeClients.reduce((sum, c) => {
          const duration = c.plan_options?.duration_months || 1;
          return sum + (Number(c.price_value || 0) * (12 / duration));
        }, 0);

        const yearlyCost = activeClients.reduce((sum, c) => {
          const duration = c.plan_options?.duration_months || 1;
          return sum + (Number(c.plan_options?.cost || 0) * (12 / duration));
        }, 0);

        // Mapa de custo por client_id (para cruzar com pagamentos)
        const clientCostMap = new Map<string, number>();
        (clients as any[]).forEach(c => {
          clientCostMap.set(c.id, Number(c.plan_options?.cost || 0));
        });

        // Valores reais recebidos com custos
        const calcReceived = (payments: any[]) => {
          let total = 0, cost = 0;
          for (const p of payments) {
            total += Number(p.amount || 0);
            cost += clientCostMap.get(p.client_id) || 0;
          }
          return { total, cost, profit: total - cost };
        };

        const monthR = calcReceived(paymentsMonth || []);
        const yearR = calcReceived(paymentsYear || []);

        setFinancial({
          monthlyProjection,
          monthlyCost,
          monthlyProfit: monthlyProjection - monthlyCost,
          yearlyProjection,
          yearlyCost,
          yearlyProfit: yearlyProjection - yearlyCost,
          receivedMonth: monthR.total,
          receivedCostMonth: monthR.cost,
          receivedProfitMonth: monthR.profit,
          receivedYear: yearR.total,
          receivedCostYear: yearR.cost,
          receivedProfitYear: yearR.profit,
        });
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const statCards = [
    { label: "Total Clientes", value: stats.total, icon: Users, color: "text-primary" },
    { label: "Renovação Ativa", value: stats.total - stats.expired, icon: CheckCircle2, color: "text-success" },
    { label: "Vencidos", value: stats.expired, icon: TrendingUp, color: "text-destructive" },
    { label: "Ativos", value: stats.active, icon: UserCheck, color: "text-success" },
    { label: "Inativos", value: stats.inactive, icon: UserX, color: "text-muted-foreground" },
  ];

  const expiredCards = [
    { label: "Vencidos +30d", value: stats.expired30, icon: Clock, color: "text-warning" },
    { label: "Vencidos +60d", value: stats.expired60, icon: CalendarClock, color: "text-destructive" },
    { label: "Vencidos +90d", value: stats.expired90, icon: CalendarX2, color: "text-destructive" },
  ];

  const val = (n: number) => loading ? "—" : `R$ ${n.toFixed(2)}`;

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const currentMonthName = monthNames[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">{profile?.email || "Carregando..."}</p>
        {profile?.subscription_end && (
          <p className="text-sm text-muted-foreground">
            Plano expira em{" "}
            <span className="font-medium text-foreground">
              {new Date(profile.subscription_end).toLocaleDateString("pt-BR")}
            </span>
          </p>
        )}
      </div>

      {/* Client Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold">{loading ? "—" : card.value}</p>
          </div>
        ))}
      </div>

      {/* Expired Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {expiredCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold">{loading ? "—" : card.value}</p>
          </div>
        ))}
      </div>

      {/* Recebido Real - Mês e Ano */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Recebido em {currentMonthName}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Faturamento Bruto</span>
              <span className="font-semibold text-success">{val(financial.receivedMonth)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.receivedCostMonth)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Real</span>
              <span className={`font-bold text-lg ${financial.receivedProfitMonth >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.receivedProfitMonth)}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Recebido em {currentYear}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Faturamento Bruto</span>
              <span className="font-semibold text-success">{val(financial.receivedYear)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.receivedCostYear)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Real</span>
              <span className={`font-bold text-lg ${financial.receivedProfitYear >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.receivedProfitYear)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Projeções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Projeção {currentMonthName}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita Projetada</span>
              <span className="font-semibold text-success">{val(financial.monthlyProjection)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.monthlyCost)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Projetado</span>
              <span className={`font-bold text-lg ${financial.monthlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.monthlyProfit)}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            Projeção Anual {currentYear}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita Projetada</span>
              <span className="font-semibold text-success">{val(financial.yearlyProjection)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">{val(financial.yearlyCost)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Projetado</span>
              <span className={`font-bold text-lg ${financial.yearlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {val(financial.yearlyProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Bem-vindo ao Super Gestor Pro</h2>
        <p className="text-muted-foreground">
          Comece adicionando seus <strong>painéis IPTV</strong> e <strong>planos</strong>, 
          depois cadastre seus <strong>clientes</strong>. Configure templates e lembretes 
          para automatizar suas cobranças via WhatsApp.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
