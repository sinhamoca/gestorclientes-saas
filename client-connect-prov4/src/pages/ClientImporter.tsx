import { useState, useRef, useMemo } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2, Info,
  FileUp, FileDown, FileText, ArrowRight, HelpCircle, Zap, Link2, X, Check,
  AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════

interface ImportResult {
  total_enviados: number;
  importados: number;
  erros: number;
  detalhes_erros: { linha: number; motivo: string }[];
}

interface PlanOptionRef {
  id: string;
  opcao: number;
  label: string;
  duration_months: number;
  num_screens: number;
  price: number;
}

interface PlanRef {
  id: string;
  code: number;
  name: string;
  num_screens: number;
  duration_months: number;
  options?: PlanOptionRef[];
}

// Auto-mapping types
interface MappingGroup {
  key: string;           // "painel|valor"
  painel: string;
  valor: number;
  count: number;
  rows: any[];           // original rows
  // Match result
  status: "matched" | "near" | "no_match";
  matchedPlan?: PlanRef;
  matchedOption?: PlanOptionRef;
  nearOptions?: PlanOptionRef[];  // close price matches
  nearPlan?: PlanRef;             // plan matched but price didn't
  // User selection (for manual assignment)
  selectedPlanId?: string;
  selectedOptionId?: string;
  skipped?: boolean;
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function parseValor(raw: any): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace("R$", "").replace(",", ".").replace(/[^\d.]/g, "").trim();
  return parseFloat(cleaned) || 0;
}

function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Check if plan name contains painel name (or vice-versa) */
function fuzzyMatch(planName: string, painelName: string): boolean {
  const np = normalize(planName);
  const ns = normalize(painelName);
  if (!np || !ns) return false;
  // Check contains in both directions
  return np.includes(ns) || ns.includes(np);
}

// ═══════════════════════════════════════════
//  PAGE COMPONENT
// ═══════════════════════════════════════════

export default function ClientImporter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Basic states
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");

  // Auto-mapping states
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [mappingGroups, setMappingGroups] = useState<MappingGroup[]>([]);
  const [plans, setPlans] = useState<PlanRef[]>([]);
  const [mappingProcessing, setMappingProcessing] = useState(false);

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
      const plansData: PlanRef[] = data.plans || [];

      if (clients.length === 0) {
        toast({ title: "Nenhum cliente para exportar", variant: "destructive" });
        setExporting(false);
        return;
      }

      const wb = XLSX.utils.book_new();

      const clientHeaders = [
        "nome", "whatsapp", "plano", "plano_nome", "opcao", "opcao_nome",
        "vencimento", "valor", "username", "suffix", "password",
        "metodo_pagamento", "ativo", "notas",
      ];
      const clientRows = clients.map((c: any) => [
        c.nome, c.whatsapp, c.plano, c.plano_nome, c.opcao, c.opcao_nome,
        c.vencimento ? formatDateBR(c.vencimento) : "",
        c.valor, c.username, c.suffix, c.password,
        c.metodo_pagamento, c.ativo, c.notas,
      ]);

      const wsClients = XLSX.utils.aoa_to_sheet([clientHeaders, ...clientRows]);
      wsClients["!cols"] = [
        { wch: 25 }, { wch: 15 }, { wch: 8 }, { wch: 25 },
        { wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
        { wch: 15 }, { wch: 10 }, { wch: 15 },
        { wch: 18 }, { wch: 6 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, wsClients, "Clientes");

      const planHeaders = ["Código", "Nome do Plano", "Telas", "Duração (meses)"];
      const planRows = plansData.map((p: PlanRef) => [p.code, p.name, p.num_screens, p.duration_months]);
      const wsPlans = XLSX.utils.aoa_to_sheet([planHeaders, ...planRows]);
      wsPlans["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsPlans, "Planos Disponíveis");

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
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "plans" },
      });

      const plansData: PlanRef[] = data?.plans || [];
      const wb = XLSX.utils.book_new();

      // Aba 1: Template
      const headers = [
        "nome", "whatsapp", "plano", "opcao", "painel", "vencimento", "valor",
        "username", "suffix", "password", "metodo_pagamento", "notas",
      ];
      const exampleRow = [
        "João Silva", "5585999999999",
        plansData.length > 0 ? plansData[0].code : 1,
        1, "", "15/03/2026", "50.00", "joao123", "silva",
        "senha123", "link", "",
      ];

      const wsTemplate = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
      wsTemplate["!cols"] = [
        { wch: 25 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 20 },
        { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 },
        { wch: 15 }, { wch: 18 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, wsTemplate, "Importar Clientes");

      // Aba 2: Planos + Opções
      const planOptHeaders = ["Código Plano", "Nome do Plano", "Opção", "Descrição", "Duração", "Telas", "Preço"];
      const planOptRows: any[] = [];
      for (const p of plansData) {
        if (p.options && p.options.length > 0) {
          for (const opt of p.options) {
            planOptRows.push([
              p.code, p.name, opt.opcao, opt.label,
              `${opt.duration_months}m`, opt.num_screens, `R$${Number(opt.price).toFixed(2)}`,
            ]);
          }
        } else {
          planOptRows.push([p.code, p.name, 1, "(opção única)", `${p.duration_months}m`, p.num_screens, ""]);
        }
      }

      const wsPlans = XLSX.utils.aoa_to_sheet([planOptHeaders, ...planOptRows]);
      wsPlans["!cols"] = [
        { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 30 },
        { wch: 10 }, { wch: 8 }, { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, wsPlans, "Planos e Opções");

      // Aba 3: Instruções
      const instructions = [
        ["Instruções de Importação"],
        [""],
        ["═══ MODO COMPLETO (recomendado para importações precisas) ═══"],
        [""],
        ["Preencha as colunas: nome, plano (código), opcao (1,2,3...)"],
        ["Consulte a aba 'Planos e Opções' para os códigos."],
        [""],
        ["═══ MODO AUTOMÁTICO (para migração rápida de planilhas externas) ═══"],
        [""],
        ["Se não preencher 'plano' e 'opcao', preencha ao menos:"],
        ["  - painel: Nome do painel/provedor (ex: 'Zeus', 'SigmaPlay')"],
        ["  - valor: Valor cobrado do cliente"],
        [""],
        ["O sistema cruza o nome do painel com seus planos cadastrados"],
        ["e o valor com as opções de preço para mapeamento automático."],
        ["Você confirma os agrupamentos antes de importar."],
        [""],
        ["═══ CAMPOS ═══"],
        [""],
        ["- nome: Nome do cliente (OBRIGATÓRIO)"],
        ["- whatsapp: Número com DDI+DDD. Ex: 5585999999999"],
        ["- plano: Código numérico do plano"],
        ["- opcao: Número da opção (1, 2, 3...). Se vazio, usa a primeira"],
        ["- painel: Nome do painel/provedor (para mapeamento automático)"],
        ["- vencimento: Data dd/mm/aaaa ou aaaa-mm-dd"],
        ["- valor: Valor numérico. Ex: 50.00 ou 50,00"],
        ["- username: Login do cliente no painel IPTV"],
        ["- suffix: Sufixo do cliente"],
        ["- password: Senha do cliente"],
        ["- metodo_pagamento: 'pix' ou 'link' (padrão: link)"],
        ["- notas: Observações"],
        [""],
        ["Limite: 5000 clientes por importação"],
      ];

      const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
      wsInstructions["!cols"] = [{ wch: 80 }];
      XLSX.utils.book_append_sheet(wb, wsInstructions, "Instruções");

      XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
      toast({ title: "Modelo baixado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  // ═══════════════════════════════════════════
  //  FILE SELECT → decide flow
  // ═══════════════════════════════════════════

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", codepage: 65001 });
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

      // Detect if we need auto-mapping:
      // If most rows have 'painel' filled but 'plano' empty → auto-mapping mode
      const hasPainel = rows.filter(r => String(r.painel || "").trim()).length;
      const hasPlano = rows.filter(r => String(r.plano || "").trim()).length;
      const needsAutoMapping = hasPainel > rows.length * 0.5 && hasPlano < rows.length * 0.3;

      setPreviewData(rows);

      if (needsAutoMapping) {
        // Fetch plans for matching
        await startAutoMapping(rows);
      } else {
        // Normal flow
        setShowImportDialog(true);
      }
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ═══════════════════════════════════════════
  //  AUTO-MAPPING LOGIC
  // ═══════════════════════════════════════════

  const startAutoMapping = async (rows: any[]) => {
    try {
      // Fetch plans with options from backend
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "plans" },
      });
      if (error) throw error;

      const fetchedPlans: PlanRef[] = data?.plans || [];
      setPlans(fetchedPlans);

      // Group rows by (painel, valor)
      const groupMap = new Map<string, MappingGroup>();

      for (const row of rows) {
        const painel = String(row.painel || "").trim();
        const valor = parseValor(row.valor);
        const key = `${normalize(painel)}|${valor}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            painel,
            valor,
            count: 0,
            rows: [],
            status: "no_match",
          });
        }

        const g = groupMap.get(key)!;
        g.count++;
        g.rows.push(row);
      }

      // Try to match each group
      const groups = Array.from(groupMap.values());

      for (const group of groups) {
        if (!group.painel) {
          group.status = "no_match";
          continue;
        }

        // Find plans whose name matches painel
        const matchingPlans = fetchedPlans.filter(p => fuzzyMatch(p.name, group.painel));

        if (matchingPlans.length === 0) {
          group.status = "no_match";
          continue;
        }

        // Try to match by exact price
        let foundExact = false;
        for (const plan of matchingPlans) {
          const opts = plan.options || [];
          const exactOpt = opts.find(o => o.price === group.valor);
          if (exactOpt) {
            group.status = "matched";
            group.matchedPlan = plan;
            group.matchedOption = exactOpt;
            foundExact = true;
            break;
          }
        }

        if (!foundExact) {
          // Near match: plan found but price didn't match exactly
          const bestPlan = matchingPlans[0];
          group.status = "near";
          group.nearPlan = bestPlan;
          group.nearOptions = bestPlan.options || [];
        }
      }

      // Sort: matched first, then near, then no_match
      groups.sort((a, b) => {
        const order = { matched: 0, near: 1, no_match: 2 };
        return order[a.status] - order[b.status];
      });

      setMappingGroups(groups);
      setShowMappingDialog(true);
    } catch (e: any) {
      toast({ title: "Erro ao carregar planos", description: e.message, variant: "destructive" });
    }
  };

  // Update a group's manual selection
  const updateGroupSelection = (key: string, field: string, value: string) => {
    setMappingGroups(prev => prev.map(g => {
      if (g.key !== key) return g;
      const updated = { ...g, [field]: value };

      // If selecting a plan, auto-try price match
      if (field === "selectedPlanId") {
        const plan = plans.find(p => p.id === value);
        if (plan) {
          const exactOpt = (plan.options || []).find(o => o.price === g.valor);
          if (exactOpt) {
            updated.selectedOptionId = exactOpt.id;
          } else {
            updated.selectedOptionId = "";
          }
        }
      }

      return updated;
    }));
  };

  const toggleGroupSkip = (key: string) => {
    setMappingGroups(prev => prev.map(g =>
      g.key === key ? { ...g, skipped: !g.skipped } : g
    ));
  };

  // Summary counts
  const mappingSummary = useMemo(() => {
    const matched = mappingGroups.filter(g => g.status === "matched" && !g.skipped);
    const near = mappingGroups.filter(g => g.status === "near" && !g.skipped);
    const noMatch = mappingGroups.filter(g => g.status === "no_match" && !g.skipped);
    const skipped = mappingGroups.filter(g => g.skipped);

    const matchedClients = matched.reduce((sum, g) => sum + g.count, 0);
    const nearClients = near.reduce((sum, g) => sum + g.count, 0);
    const noMatchClients = noMatch.reduce((sum, g) => sum + g.count, 0);
    const skippedClients = skipped.reduce((sum, g) => sum + g.count, 0);

    return { matched, near, noMatch, skipped, matchedClients, nearClients, noMatchClients, skippedClients };
  }, [mappingGroups]);

  // Check if a near/no_match group is ready (user selected plan+option)
  const isGroupReady = (g: MappingGroup): boolean => {
    if (g.skipped) return true;
    if (g.status === "matched") return true;
    return !!(g.selectedPlanId && g.selectedOptionId);
  };

  const allGroupsReady = mappingGroups.every(isGroupReady);

  // ═══════════════════════════════════════════
  //  CONFIRM AUTO-MAPPING → send to import
  // ═══════════════════════════════════════════

  const handleConfirmMapping = async () => {
    setMappingProcessing(true);

    const finalRows: any[] = [];

    for (const group of mappingGroups) {
      if (group.skipped) continue;

      let planId: string | null = null;
      let optionId: string | null = null;

      if (group.status === "matched" && group.matchedPlan && group.matchedOption) {
        planId = group.matchedPlan.id;
        optionId = group.matchedOption.id;
      } else if (group.selectedPlanId && group.selectedOptionId) {
        planId = group.selectedPlanId;
        optionId = group.selectedOptionId;
      } else {
        // Not resolved, skip
        continue;
      }

      for (const row of group.rows) {
        finalRows.push({
          ...row,
          plano: planId,       // UUID - backend accepts this
          opcao: optionId,     // UUID - backend accepts this
        });
      }
    }

    if (finalRows.length === 0) {
      toast({ title: "Nenhum cliente para importar", variant: "destructive" });
      setMappingProcessing(false);
      return;
    }

    // Send to backend
    try {
      const { data, error } = await supabase.functions.invoke("import-export-clients", {
        body: { action: "import", clients: finalRows },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data as ImportResult);
      setShowMappingDialog(false);
      setShowResultDialog(true);
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }

    setMappingProcessing(false);
  };

  // ═══════════════════════════════════════════
  //  NORMAL IMPORT (plano preenchido)
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
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }

    setImporting(false);
  };

  // ═══════════════════════════════════════════
  //  GET OPTIONS FOR A PLAN (helper)
  // ═══════════════════════════════════════════

  const getOptionsForPlan = (planId: string): PlanOptionRef[] => {
    return plans.find(p => p.id === planId)?.options || [];
  };

  // ═══════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Importador de Clientes</h1>
        <p className="text-muted-foreground">Importe, exporte e gerencie seus clientes em massa via planilha</p>
      </div>

      {/* Cards de ações */}
      <div className="grid gap-4 md:grid-cols-3">

        {/* Card: Baixar Modelo */}
        <Card className="group hover:border-blue-500/50 transition-colors cursor-pointer" onClick={handleDownloadTemplate}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Baixar Modelo</CardTitle>
                <CardDescription className="text-xs">Planilha com instruções e opções</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Template .xlsx com cabeçalhos, exemplo, lista de planos/opções e instruções. Suporta importação completa e automática.
            </p>
            <div className="mt-3 flex items-center text-sm text-blue-500 font-medium gap-1">
              <FileSpreadsheet className="h-4 w-4" />
              Baixar template
              <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>

        {/* Card: Importar */}
        <Card
          className="group hover:border-green-500/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500/20 transition-colors">
                <FileUp className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Importar Clientes</CardTitle>
                <CardDescription className="text-xs">.xlsx, .xls ou .csv</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Suba a planilha preenchida. Se tiver coluna <strong>plano</strong>, importa direto. Se tiver coluna <strong>painel</strong> + <strong>valor</strong>, mapeia automaticamente.
            </p>
            <div className="mt-3 flex items-center text-sm text-green-500 font-medium gap-1">
              <Upload className="h-4 w-4" />
              Selecionar arquivo
              <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>

        {/* Card: Exportar */}
        <Card
          className={`group hover:border-orange-500/50 transition-colors cursor-pointer ${exporting ? "pointer-events-none opacity-60" : ""}`}
          onClick={handleExport}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20 transition-colors">
                <FileDown className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Exportar Clientes</CardTitle>
                <CardDescription className="text-xs">Backup completo em .xlsx</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Exporte todos os clientes com dados completos, planos, opções, vencimentos e informações do painel IPTV.
            </p>
            <div className="mt-3 flex items-center text-sm text-orange-500 font-medium gap-1">
              {exporting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Exportando...</>
              ) : (
                <><Download className="h-4 w-4" /> Exportar tudo <ArrowRight className="h-3 w-3" /></>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guia rápido */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-500" />
              Modo Completo
            </p>
            <p>Preencha <code className="px-1.5 py-0.5 bg-muted rounded text-xs">plano</code> (código) e <code className="px-1.5 py-0.5 bg-muted rounded text-xs">opcao</code> (1, 2, 3...) para importação direta sem perguntas.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Modo Automático
            </p>
            <p>Preencha <code className="px-1.5 py-0.5 bg-muted rounded text-xs">painel</code> (nome do provedor) e <code className="px-1.5 py-0.5 bg-muted rounded text-xs">valor</code>. O sistema cruza com seus planos e agrupa os clientes para confirmação rápida.</p>
          </div>
        </CardContent>
      </Card>

      {/* Input hidden */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* ═══════════════════════════════════════════ */}
      {/*  Dialog: Preview Normal                     */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Clientes
            </DialogTitle>
            <DialogDescription>Arquivo: {fileName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-500">
                {previewData.length} clientes encontrados. Confira a prévia antes de importar.
              </p>
            </div>

            <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">WhatsApp</TableHead>
                    <TableHead className="text-xs">Plano</TableHead>
                    <TableHead className="text-xs">Opção</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{row.nome || "-"}</TableCell>
                      <TableCell className="text-xs">{row.whatsapp || "-"}</TableCell>
                      <TableCell className="text-xs">{row.plano || "-"}</TableCell>
                      <TableCell className="text-xs">{row.opcao || "1"}</TableCell>
                      <TableCell className="text-xs">{row.vencimento || "-"}</TableCell>
                      <TableCell className="text-xs">{row.valor || "-"}</TableCell>
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
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancelar</Button>
            <Button onClick={handleConfirmImport} disabled={importing}>
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Importar {previewData.length} clientes</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════ */}
      {/*  Dialog: AUTO-MAPPING                       */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Mapeamento Automático
            </DialogTitle>
            <DialogDescription>
              {previewData.length} clientes agrupados em {mappingGroups.length} grupos por painel + valor
            </DialogDescription>
          </DialogHeader>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            {mappingSummary.matchedClients > 0 && (
              <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {mappingSummary.matchedClients} mapeados ({mappingSummary.matched.length} grupos)
              </Badge>
            )}
            {mappingSummary.nearClients > 0 && (
              <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {mappingSummary.nearClients} valor aproximado ({mappingSummary.near.length} grupos)
              </Badge>
            )}
            {mappingSummary.noMatchClients > 0 && (
              <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
                <AlertCircle className="h-3 w-3 mr-1" />
                {mappingSummary.noMatchClients} sem match ({mappingSummary.noMatch.length} grupos)
              </Badge>
            )}
            {mappingSummary.skippedClients > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                <X className="h-3 w-3 mr-1" />
                {mappingSummary.skippedClients} pulados
              </Badge>
            )}
          </div>

          {/* Groups list */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3 pr-4">
              {mappingGroups.map((group) => (
                <div
                  key={group.key}
                  className={`rounded-lg border p-4 space-y-3 transition-colors ${
                    group.skipped
                      ? "opacity-50 bg-muted/20"
                      : group.status === "matched"
                      ? "border-green-500/30 bg-green-500/5"
                      : group.status === "near"
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  {/* Group header */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {group.status === "matched" && !group.skipped && (
                        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      )}
                      {group.status === "near" && !group.skipped && (
                        <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                      )}
                      {group.status === "no_match" && !group.skipped && (
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {group.painel || "(sem painel)"}
                          <span className="text-muted-foreground font-normal"> — </span>
                          R${group.valor.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.count} {group.count === 1 ? "cliente" : "clientes"}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleGroupSkip(group.key)}
                      className="shrink-0"
                    >
                      {group.skipped ? (
                        <><Check className="h-3 w-3 mr-1" /> Incluir</>
                      ) : (
                        <><X className="h-3 w-3 mr-1" /> Pular</>
                      )}
                    </Button>
                  </div>

                  {!group.skipped && (
                    <>
                      {/* MATCHED: show auto-mapped result */}
                      {group.status === "matched" && group.matchedPlan && group.matchedOption && (
                        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 text-sm">
                          <Link2 className="h-4 w-4 text-green-500 shrink-0" />
                          <span>
                            <strong>{group.matchedPlan.name}</strong>
                            <span className="text-muted-foreground"> → </span>
                            {group.matchedOption.label}
                            <span className="text-green-500 ml-1">(R${group.matchedOption.price.toFixed(2)})</span>
                          </span>
                        </div>
                      )}

                      {/* NEAR: plan found but price didn't match */}
                      {group.status === "near" && group.nearPlan && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 p-2 rounded bg-yellow-500/10 text-sm">
                            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                            <span>
                              Plano <strong>{group.nearPlan.name}</strong> encontrado, mas valor R${group.valor.toFixed(2)} não bate com nenhuma opção.
                              Selecione a opção correta:
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Select
                              value={group.selectedOptionId || ""}
                              onValueChange={(v) => {
                                updateGroupSelection(group.key, "selectedPlanId", group.nearPlan!.id);
                                updateGroupSelection(group.key, "selectedOptionId", v);
                              }}
                            >
                              <SelectTrigger className="text-sm h-9">
                                <SelectValue placeholder="Selecione a opção..." />
                              </SelectTrigger>
                              <SelectContent>
                                {(group.nearOptions || []).map(opt => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.label} — R${opt.price.toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* NO MATCH: manual selection */}
                      {group.status === "no_match" && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 text-sm">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                            <span>
                              Nenhum plano encontrado para "{group.painel || "(vazio)"}".
                              Selecione manualmente ou pule este grupo.
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Select
                              value={group.selectedPlanId || ""}
                              onValueChange={(v) => updateGroupSelection(group.key, "selectedPlanId", v)}
                            >
                              <SelectTrigger className="text-sm h-9 flex-1">
                                <SelectValue placeholder="Selecione o plano..." />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    [{p.code}] {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {group.selectedPlanId && (
                              <Select
                                value={group.selectedOptionId || ""}
                                onValueChange={(v) => updateGroupSelection(group.key, "selectedOptionId", v)}
                              >
                                <SelectTrigger className="text-sm h-9 flex-1">
                                  <SelectValue placeholder="Opção..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {getOptionsForPlan(group.selectedPlanId).map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.label} — R${opt.price.toFixed(2)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmMapping}
              disabled={mappingProcessing || !allGroupsReady}
            >
              {mappingProcessing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />
                  Importar {previewData.length - mappingSummary.skippedClients} clientes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════ */}
      {/*  Dialog: Resultado                          */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult && importResult.erros === 0 ? (
                <><CheckCircle2 className="h-5 w-5 text-green-500" /> Importação Concluída</>
              ) : (
                <><AlertCircle className="h-5 w-5 text-yellow-500" /> Importação Parcial</>
              )}
            </DialogTitle>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{importResult.total_enviados}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-500">{importResult.importados}</p>
                  <p className="text-xs text-green-600">Importados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <p className="text-2xl font-bold text-red-500">{importResult.erros}</p>
                  <p className="text-xs text-red-600">Erros</p>
                </div>
              </div>

              {importResult.detalhes_erros && importResult.detalhes_erros.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Detalhes dos erros:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {importResult.detalhes_erros.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/10 text-xs">
                        <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>Linha {err.linha}:</strong> {err.motivo}
                        </span>
                      </div>
                    ))}
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
    </div>
  );
}
