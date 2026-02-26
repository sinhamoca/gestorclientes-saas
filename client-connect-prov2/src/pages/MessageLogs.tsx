import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, CheckCircle2, XCircle, MessageSquare, RefreshCw, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessageLog {
  id: string;
  client_name: string;
  client_id: string | null;
  whatsapp_number: string | null;
  reminder_name: string | null;
  template_name: string | null;
  status: string;
  error_message: string | null;
  message_preview: string | null;
  sent_at: string;
}

const MessageLogs = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 50;

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from("message_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .range((currentPage - 1) * perPage, currentPage * perPage - 1);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (search.trim()) {
      query = query.or(`client_name.ilike.%${search.trim()}%,whatsapp_number.ilike.%${search.trim()}%`);
    }

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [user, statusFilter, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs();
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const statusIcon = (status: string) => {
    if (status === "sent") return <CheckCircle2 className="h-3.5 w-3.5" />;
    return <XCircle className="h-3.5 w-3.5" />;
  };

  const statusBadge = (status: string) => (
    <Badge
      variant={status === "sent" ? "default" : "destructive"}
      className="flex items-center gap-1 w-fit"
    >
      {statusIcon(status)}
      {status === "sent" ? "Enviado" : "Erro"}
    </Badge>
  );

  const formatPhone = (phone: string | null) => {
    if (!phone) return "—";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return phone;
  };

  const sentCount = logs.filter(l => l.status === "sent").length;
  const errorCount = logs.filter(l => l.status === "error").length;

  return (
    <div className="space-y-6 animate-fade-in overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Logs WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm">Histórico de mensagens enviadas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs()} className="shrink-0">
          <RefreshCw className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{logs.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-500">{sentCount}</p>
          <p className="text-xs text-muted-foreground">Enviados</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{errorCount}</p>
          <p className="text-xs text-muted-foreground">Erros</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="sent">Enviados</SelectItem>
            <SelectItem value="error">Erros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DESKTOP: Table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
        <ScrollArea className="max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Lembrete</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Nenhum log encontrado
                  </TableCell>
                </TableRow>
              ) : logs.map((log) => (
                <TableRow key={log.id} className="border-border/30">
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(log.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{log.client_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatPhone(log.whatsapp_number)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{log.reminder_name || "—"}</TableCell>
                  <TableCell>{statusBadge(log.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* MOBILE: Cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Nenhum log encontrado</p>
        ) : logs.map((log) => (
          <div
            key={log.id}
            className="glass-card rounded-xl p-4 space-y-2 cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => setSelectedLog(log)}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium truncate">{log.client_name}</span>
              {statusBadge(log.status)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Data</span>
                <p>{format(new Date(log.sent_at), "dd/MM HH:mm", { locale: ptBR })}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Lembrete</span>
                <p className="truncate">{log.reminder_name || "—"}</p>
              </div>
            </div>
            {log.status === "error" && log.error_message && (
              <p className="text-xs text-destructive truncate">{log.error_message}</p>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {!loading && logs.length > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {currentPage}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={logs.length < perPage}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Envio</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Status:</span>
                  {statusBadge(selectedLog.status)}
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Data:</span>
                  <span className="text-right">{format(new Date(selectedLog.sent_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Cliente:</span>
                  <span className="text-right font-medium">{selectedLog.client_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">WhatsApp:</span>
                  <span className="text-right">{formatPhone(selectedLog.whatsapp_number)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Lembrete:</span>
                  <span className="text-right">{selectedLog.reminder_name || "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Template:</span>
                  <span className="text-right">{selectedLog.template_name || "—"}</span>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                  <p className="text-sm font-medium text-destructive mb-1">Erro:</p>
                  <p className="text-sm text-destructive/90">{selectedLog.error_message}</p>
                </div>
              )}

              {selectedLog.message_preview && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Mensagem enviada:</p>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm whitespace-pre-wrap">{selectedLog.message_preview}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageLogs;
