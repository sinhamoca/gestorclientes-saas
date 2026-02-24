import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Clock, FileText } from "lucide-react";

interface ActivityLog {
  id: string;
  client_id: string | null;
  type: string;
  status: string;
  details: any;
  created_at: string;
  client_name?: string;
}

export default function RenewalLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("activity_logs")
        .select("*, clients(name)")
        .eq("user_id", user.id)
        .eq("type", "renewal")
        .order("created_at", { ascending: false })
        .limit(100);

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

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Logs de Renovação</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Renovações IPTV</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum log de renovação encontrado.</p>
          ) : (
            <>
              {/* DESKTOP: Table */}
              <ScrollArea className="max-h-[600px] hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">{log.client_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status === "success" ? "default" : "destructive"}
                            className="flex items-center gap-1 w-fit"
                          >
                            {statusIcon(log.status)}
                            {log.status === "success" ? "Sucesso" : "Erro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {log.status === "error" && log.details
                            ? log.details.error || log.details.message || JSON.stringify(log.details)
                            : log.details?.message || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* MOBILE: Cards */}
              <div className="space-y-3 md:hidden max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{log.client_name}</span>
                      <Badge
                        variant={log.status === "success" ? "default" : "destructive"}
                        className="flex items-center gap-1 text-xs shrink-0"
                      >
                        {statusIcon(log.status)}
                        {log.status === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      {log.status === "error" && log.details && (
                        <p className="mt-1 truncate">
                          {log.details.error || log.details.message || JSON.stringify(log.details)}
                        </p>
                      )}
                      {log.status === "success" && log.details?.message && (
                        <p className="mt-1 truncate">{log.details.message}</p>
                      )}
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