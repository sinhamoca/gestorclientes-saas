import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Loader2, CheckCircle2, CalendarDays, Calendar } from "lucide-react";

interface FinancialData {
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
  activeClients: number;
  clientsRenewingThisMonth: number;
  avgTicket: number;
  clientsByPanel: { name: string; count: number }[];
}

const Financial = () => {
  const { user } = useAuth();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchFinancial = async () => {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;

      const [clientsRes, paymentsMonthRes, paymentsYearRes] = await Promise.all([
        supabase.from("clients")
          .select("id, is_active, due_date, price_value, plan_id, plan_option_id, plan_options(duration_months, cost), plans(name, panel_credential_id, panel_credentials(label, provider))")
          .eq("user_id", user.id),
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

      const clients = (clientsRes.data as any[]) || [];
      const activeClients = clients.filter(c => c.is_active);

      // Projeção Mensal: clientes cujo due_date cai no mês atual
      let clientsRenewingThisMonth = 0;
      const monthlyProjection = activeClients.reduce((sum, c) => {
        if (!c.due_date) return sum;
        const [y, m] = c.due_date.split("-").map(Number);
        if (y === now.getFullYear() && m === now.getMonth() + 1) {
          clientsRenewingThisMonth++;
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

      // Mapa de custo por client_id
      const clientCostMap = new Map<string, number>();
      clients.forEach(c => {
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

      const monthR = calcReceived(paymentsMonthRes.data || []);
      const yearR = calcReceived(paymentsYearRes.data || []);

      // Clientes por Painel
      const panelMap = new Map<string, { name: string; count: number }>();
      activeClients.forEach(c => {
        const panelName = c.plans?.panel_credentials?.label || c.plans?.panel_credentials?.provider || "Sem painel";
        const existing = panelMap.get(panelName) || { name: panelName, count: 0 };
        existing.count++;
        panelMap.set(panelName, existing);
      });

      setData({
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
        activeClients: activeClients.length,
        clientsRenewingThisMonth,
        avgTicket: clientsRenewingThisMonth > 0 ? monthlyProjection / clientsRenewingThisMonth : 0,
        clientsByPanel: Array.from(panelMap.values()).sort((a, b) => b.count - a.count),
      });
      setLoading(false);
    };
    fetchFinancial();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const currentMonthName = monthNames[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Financeiro</h1>
        <p className="text-muted-foreground">
          {data.activeClients} clientes ativos · {data.clientsRenewingThisMonth} renovando em {currentMonthName}
        </p>
      </div>

      {/* Recebido real */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Recebido em {currentMonthName}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Faturamento Bruto</span>
              <span className="font-semibold text-success">R$ {data.receivedMonth.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">R$ {data.receivedCostMonth.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Real</span>
              <span className={`font-bold text-lg ${data.receivedProfitMonth >= 0 ? "text-success" : "text-destructive"}`}>
                R$ {data.receivedProfitMonth.toFixed(2)}
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
              <span className="font-semibold text-success">R$ {data.receivedYear.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-semibold text-destructive">R$ {data.receivedCostYear.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Real</span>
              <span className={`font-bold text-lg ${data.receivedProfitYear >= 0 ? "text-success" : "text-destructive"}`}>
                R$ {data.receivedProfitYear.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Projeções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Projeção {currentMonthName}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{data.clientsRenewingThisMonth} clientes com vencimento este mês</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita Projetada</span>
              <span className="font-semibold text-success">R$ {data.monthlyProjection.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos Projetados</span>
              <span className="font-semibold text-destructive">R$ {data.monthlyCost.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Projetado</span>
              <span className={`font-bold text-lg ${data.monthlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                R$ {data.monthlyProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Ticket Médio</span>
              <span className="font-semibold">R$ {data.avgTicket.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Projeção Anual {currentYear}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Baseado em {data.activeClients} clientes ativos e suas frequências de renovação</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Receita Projetada</span>
              <span className="font-semibold text-success">R$ {data.yearlyProjection.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="text-sm text-muted-foreground">Custos Projetados</span>
              <span className="font-semibold text-destructive">R$ {data.yearlyCost.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Lucro Projetado</span>
              <span className={`font-bold text-lg ${data.yearlyProfit >= 0 ? "text-success" : "text-destructive"}`}>
                R$ {data.yearlyProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Margem de Lucro */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Margem de Lucro Projetada</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-success to-primary transition-all"
              style={{ width: `${data.yearlyProjection > 0 ? Math.min((data.yearlyProfit / data.yearlyProjection) * 100, 100) : 0}%` }}
            />
          </div>
          <span className="font-bold text-lg">
            {data.yearlyProjection > 0 ? ((data.yearlyProfit / data.yearlyProjection) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>

      {/* Clientes por Painel */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Clientes por Painel</h2>
        {data.clientsByPanel.length === 0 ? (
          <p className="text-muted-foreground">Nenhum cliente ativo.</p>
        ) : (
          <div className="space-y-3">
            {data.clientsByPanel.map(panel => (
              <div key={panel.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div>
                  <p className="font-medium">{panel.name}</p>
                  <p className="text-sm text-muted-foreground">{panel.count} clientes</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {data.activeClients > 0 ? ((panel.count / data.activeClients) * 100).toFixed(0) : 0}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Financial;
