import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, FileText, ShieldOff } from "lucide-react";

interface ActivityLog {
  id: string;
  client_id: string | null;
  type: string;
  status: string;
  details: any;
  created_at: string;
  client_name?: string;
}

type FilterType = "all" | "renewal" | "iptv_skip" | "iptv_overdue_alert";

const TYPE_LABELS: Record<string, string> = {
  renewal: "Renovação IPTV",
  iptv_skip: "IPTV Pulado",
  iptv_overdue_alert: "Alerta IPTV",
};

export default function RenewalLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("activity_logs")
        .select("*, clients(name)")
        .eq("user_id", user.id)
        .in("type", ["renewal", "iptv_skip", "iptv_overdue_alert"])
        .order("created_at", { ascending: false })
        .limit(200);

      if (data) {
        setLogs(
          data.map((log: any) => ({
            ...log,
            client_name: log.clients?.name || "—",
          }))
        );
      }
      setLoading(false);
    };

    fetchLogs();
  }, [user]);

  const filteredLogs = filter === "all" ? logs : logs.filter(l => l.type === filter);

  const counts = {
    all: logs.length,
    renewal: logs.filter(l => l.type === "renewal").length,
    iptv_skip: logs.filter(l => l.type === "iptv_skip").length,
    iptv_overdue_alert: logs.filter(l => l.type === "iptv_overdue_alert").length,
  };

  const alertCount = counts.iptv_overdue_alert;

  const typeBadge = (log: ActivityLog) => {
    if (log.type === "iptv_overdue_alert") {
      return (
        <Badge className="flex items-center gap-1 w-fit bg-orange-500/15 text-orange-600 border-orange-500/30 hover:bg-orange-500/20">
          <AlertTriangle className="h-3 w-3" />
          Alerta IPTV
        </Badge>
      );
    }
    if (log.type === "iptv_skip") {
      return (
        <Badge variant="outline" className="flex items-center gap-1 w-fit text-blue-500 border-blue-500/30">
          <ShieldOff className="h-3 w-3" />
          IPTV Pulado
        </Badge>
      );
    }
    // renewal
    if (log.status === "success") {
      return (
        <Badge variant="default" className="flex items-center gap-1 w-fit">
          <CheckCircle2 className="h-3 w-3" />
          Sucesso
        </Badge>
      );
    }
    if (log.status === "error") {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <AlertCircle className="h-3 w-3" />
          Erro
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
        <Clock className="h-3 w-3" />
        Pendente
      </Badge>
    );
  };

  const detailText = (log: ActivityLog) => {
    if (log.type === "iptv_overdue_alert") {
      const skipUntil = log.details?.iptv_active_until;
      const skipFormatted = skipUntil ? skipUntil.split("-").reverse().join("/") : "?";
      return `IPTV ativo até ${skipFormatted} — bloqueie manualmente se necessário`;
    }
    if (log.type === "iptv_skip") {
      const skipUntil = log.details?.skip_until;
      const skipFormatted = skipUntil ? skipUntil.split("-").reverse().join("/") : "?";
      return `Renovação IPTV pulada (skip até ${skipFormatted})`;
    }
    if (log.status === "error" && log.details) {
      return log.details.error || log.details.message || JSON.stringify(log.details);
    }
    return log.details?.message || "—";
  };

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: counts.all },
    { key: "renewal", label: "Renovações", count: counts.renewal },
    { key: "iptv_skip", label: "IPTV Pulado", count: counts.iptv_skip },
    { key: "iptv_overdue_alert", label: "Alertas", count: counts.iptv_overdue_alert },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Logs de Renovação</h1>
        {alertCount > 0 && (
          <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {alertCount} alerta{alertCount > 1 ? "s" : ""} IPTV
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">Histórico</CardTitle>
            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
              {filterButtons.map(btn => (
                <button
                  key={btn.key}
                  onClick={() => setFilter(btn.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border
                    ${filter === btn.key
                      ? btn.key === "iptv_overdue_alert"
                        ? "bg-orange-500/20 text-orange-600 border-orange-500/40"
                        : "bg-primary/10 text-primary border-primary/30"
                      : "bg-transparent text-muted-foreground border-border/50 hover:border-border"
                    }`}
                >
                  {btn.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold
                    ${filter === btn.key ? "bg-primary/20" : "bg-muted"}`}>
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum log encontrado.</p>
          ) : (
            <>
              {/* DESKTOP: Table */}
              <ScrollArea className="max-h-[600px] hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className={log.type === "iptv_overdue_alert" ? "bg-orange-500/5" : ""}
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">{log.client_name}</TableCell>
                        <TableCell>{typeBadge(log)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {detailText(log)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* MOBILE: Cards */}
              <div className="space-y-3 md:hidden max-h-[600px] overflow-y-auto">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border space-y-2
                      ${log.type === "iptv_overdue_alert"
                        ? "border-orange-500/30 bg-orange-500/5"
                        : "border-border/30"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{log.client_name}</span>
                      {typeBadge(log)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      <p className="mt-1 truncate">{detailText(log)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
