import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2, Info,
} from "lucide-react";
import * as XLSX from "xlsx";

interface ImportResult {
  total_enviados: number;
  importados: number;
  erros: number;
  detalhes_erros: { linha: number; motivo: string }[];
}

interface PlanRef {
  code: number;
  name: string;
  num_screens: number;
  duration_months: number;
}

interface ImportExportClientsProps {
  onImported?: () => void;
}

export function ImportExportClients({ onImported }: ImportExportClientsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");

  // ═══════════════════════════════════════════
  //  EXPORTAR
  // ═══════════════════════════════════════════
  const handleExport = async () => {
    if (!user) return;
    setExporting(true);

    try {
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "export" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const clients = data.clients || [];
      const plans: PlanRef[] = data.plans || [];

      if (clients.length === 0) {
        toast({ title: "Nenhum cliente para exportar", variant: "destructive" });
        setExporting(false);
        return;
      }

      // Criar workbook com 2 abas
      const wb = XLSX.utils.book_new();

      // Aba 1: Clientes
      const clientHeaders = [
        "nome", "whatsapp", "plano", "plano_nome", "vencimento",
        "valor", "username", "suffix", "password", "mac_address",
        "device_key", "metodo_pagamento", "ativo", "notas", "servidor",
      ];
      const clientRows = clients.map((c: any) => [
        c.nome, c.whatsapp, c.plano, c.plano_nome,
        c.vencimento ? formatDateBR(c.vencimento) : "",
        c.valor, c.username, c.suffix, c.password,
        c.mac_address, c.device_key, c.metodo_pagamento,
        c.ativo, c.notas, c.servidor,
      ]);

      const wsClients = XLSX.utils.aoa_to_sheet([clientHeaders, ...clientRows]);

      // Ajustar largura das colunas
      wsClients["!cols"] = [
        { wch: 25 }, // nome
        { wch: 15 }, // whatsapp
        { wch: 8 },  // plano
        { wch: 25 }, // plano_nome
        { wch: 12 }, // vencimento
        { wch: 10 }, // valor
        { wch: 15 }, // username
        { wch: 10 }, // suffix
        { wch: 15 }, // password
        { wch: 18 }, // mac_address
        { wch: 15 }, // device_key
        { wch: 18 }, // metodo_pagamento
        { wch: 6 },  // ativo
        { wch: 30 }, // notas
        { wch: 15 }, // servidor
      ];

      XLSX.utils.book_append_sheet(wb, wsClients, "Clientes");

      // Aba 2: Planos Disponíveis (referência)
      const planHeaders = ["Código", "Nome do Plano", "Telas", "Duração (meses)"];
      const planRows = plans.map((p: PlanRef) => [
        p.code, p.name, p.num_screens, p.duration_months,
      ]);

      const wsPlans = XLSX.utils.aoa_to_sheet([planHeaders, ...planRows]);
      wsPlans["!cols"] = [
        { wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 16 },
      ];

      XLSX.utils.book_append_sheet(wb, wsPlans, "Planos Disponíveis");

      // Download
      const today = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `clientes_backup_${today}.xlsx`);

      toast({ title: `${clients.length} clientes exportados com sucesso!` });
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    }

    setExporting(false);
  };

  // ═══════════════════════════════════════════
  //  BAIXAR MODELO
  // ═══════════════════════════════════════════
  const handleDownloadTemplate = async () => {
    if (!user) return;

    try {
      // Buscar planos para aba de referência
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "plans" },
      });

      const plans: PlanRef[] = data?.plans || [];

      const wb = XLSX.utils.book_new();

      // Aba 1: Template vazio
      const headers = [
        "nome", "whatsapp", "plano", "vencimento", "valor",
        "username", "suffix", "password", "mac_address",
        "device_key", "metodo_pagamento", "notas",
      ];

      // Exemplo de linha preenchida
      const exampleRow = [
        "João Silva", "5585999999999", plans.length > 0 ? plans[0].code : 1,
        "15/03/2026", "50.00", "joao123", "silva",
        "senha123", "", "", "pix", "",
      ];

      const wsTemplate = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
      wsTemplate["!cols"] = [
        { wch: 25 }, { wch: 15 }, { wch: 8 }, { wch: 12 },
        { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 15 },
        { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 30 },
      ];

      XLSX.utils.book_append_sheet(wb, wsTemplate, "Importar Clientes");

      // Aba 2: Planos
      const planHeaders = ["Código", "Nome do Plano", "Telas", "Duração (meses)"];
      const planRows = plans.map((p: PlanRef) => [
        p.code, p.name, p.num_screens, p.duration_months,
      ]);

      const wsPlans = XLSX.utils.aoa_to_sheet([planHeaders, ...planRows]);
      wsPlans["!cols"] = [
        { wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 16 },
      ];

      XLSX.utils.book_append_sheet(wb, wsPlans, "Planos Disponíveis");

      // Aba 3: Instruções
      const instructions = [
        ["Instruções de Importação"],
        [""],
        ["Campos obrigatórios: nome"],
        [""],
        ["Campos opcionais: todos os demais"],
        [""],
        ["Regras:"],
        ["- nome: Nome do cliente (obrigatório)"],
        ["- whatsapp: Número com DDD e DDI. Ex: 5585999999999"],
        ["- plano: Código numérico do plano (veja aba 'Planos Disponíveis')"],
        ["- vencimento: Data no formato dd/mm/aaaa ou aaaa-mm-dd"],
        ["- valor: Valor numérico. Ex: 50.00 ou 50,00"],
        ["- username: Login do cliente no painel IPTV"],
        ["- suffix: Sufixo do cliente (se aplicável)"],
        ["- password: Senha do cliente no painel IPTV"],
        ["- mac_address: Endereço MAC do dispositivo"],
        ["- device_key: Chave do dispositivo"],
        ["- metodo_pagamento: 'pix' ou 'link' (padrão: pix)"],
        ["- notas: Observações sobre o cliente"],
        [""],
        ["Limite: 5000 clientes por importação"],
        [""],
        ["Dica: A linha de exemplo na aba 'Importar Clientes' pode ser removida ou substituída."],
      ];

      const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
      wsInstructions["!cols"] = [{ wch: 70 }];

      XLSX.utils.book_append_sheet(wb, wsInstructions, "Instruções");

      XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
      toast({ title: "Modelo baixado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  // ═══════════════════════════════════════════
  //  IMPORTAR - Selecionar arquivo
  // ═══════════════════════════════════════════
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", codepage: 65001 });

      // Pegar primeira aba
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        toast({ title: "Planilha vazia", variant: "destructive" });
        return;
      }

      if (rows.length > 5000) {
        toast({ title: "Máximo 5000 clientes por importação", variant: "destructive" });
        return;
      }

      setPreviewData(rows);
      setShowImportDialog(true);
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ═══════════════════════════════════════════
  //  IMPORTAR - Confirmar envio
  // ═══════════════════════════════════════════
  const handleConfirmImport = async () => {
    if (!user || previewData.length === 0) return;
    setImporting(true);

    try {
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "import", clients: previewData },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data as ImportResult);
      setShowImportDialog(false);
      setShowResultDialog(true);

      if (data.importados > 0) {
        onImported?.();
      }
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }

    setImporting(false);
  };

  return (
    <>
      {/* Botões */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Modelo
        </Button>

        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Exportar
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Dialog de Preview / Confirmação */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Clientes
            </DialogTitle>
            <DialogDescription>
              Arquivo: {fileName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-500">
                {previewData.length} clientes encontrados na planilha. Confira a prévia abaixo antes de importar.
              </p>
            </div>

            {/* Preview table */}
            <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">WhatsApp</TableHead>
                    <TableHead className="text-xs">Plano</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Username</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{row.nome || "-"}</TableCell>
                      <TableCell className="text-xs">{row.whatsapp || "-"}</TableCell>
                      <TableCell className="text-xs">{row.plano || "-"}</TableCell>
                      <TableCell className="text-xs">{row.vencimento || "-"}</TableCell>
                      <TableCell className="text-xs">{row.valor || "-"}</TableCell>
                      <TableCell className="text-xs">{row.username || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {previewData.length > 20 && (
              <p className="text-xs text-muted-foreground text-center">
                Mostrando 20 de {previewData.length} clientes...
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {previewData.length} clientes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Resultado */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult && importResult.erros === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              Resultado da Importação
            </DialogTitle>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{importResult.total_enviados}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-500">{importResult.importados}</p>
                  <p className="text-xs text-muted-foreground">Importados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <p className="text-2xl font-bold text-red-500">{importResult.erros}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </div>
              </div>

              {/* Barra de progresso */}
              <Progress
                value={importResult.total_enviados > 0
                  ? (importResult.importados / importResult.total_enviados) * 100
                  : 0
                }
                className="h-2"
              />

              {/* Detalhes dos erros */}
              {importResult.detalhes_erros.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">Erros encontrados:</p>
                  <div className="border rounded-lg overflow-y-auto max-h-[200px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-20">Linha</TableHead>
                          <TableHead className="text-xs">Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.detalhes_erros.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{err.linha || "-"}</TableCell>
                            <TableCell className="text-xs text-destructive">{err.motivo}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper
function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
