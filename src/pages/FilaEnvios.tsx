import { AppLayout } from "@/layouts/AppLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Clock, CheckCircle2, XCircle, RefreshCcw, CalendarDays, Megaphone, Cake, Send, AlertTriangle, ShieldAlert, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClinica } from "@/contexts/ClinicaContext";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type PeriodoFiltro = "hoje" | "semanal" | "mensal" | "personalizado";

function getDateRange(periodo: PeriodoFiltro, customRange?: DateRange): { start: Date; end: Date } {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

  switch (periodo) {
    case "hoje":
      return { start: inicioHoje, end: fimHoje };
    case "semanal": {
      // Esta semana: de hoje até 6 dias para frente
      const fim = new Date(inicioHoje);
      fim.setDate(fim.getDate() + 6);
      fim.setHours(23, 59, 59, 999);
      return { start: inicioHoje, end: fim };
    }
    case "mensal": {
      // Este mês: do 1o dia até o último dia do mês atual
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: inicioMes, end: fimMes };
    }
    case "personalizado": {
      if (customRange?.from) {
        const from = new Date(customRange.from);
        from.setHours(0, 0, 0, 0);
        const to = customRange.to ? new Date(customRange.to) : new Date(from);
        to.setHours(23, 59, 59, 999);
        return { start: from, end: to };
      }
      return { start: inicioHoje, end: fimHoje };
    }
  }
}

const FilaEnvios = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("hoje");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [filtroProcedimento, setFiltroProcedimento] = useState<string>("todos");
  const [filtroClinica, setFiltroClinica] = useState<string>("todas");
  const pageSize = 20;

  const { data: filterClinicas } = useQuery({
    queryKey: ["filter_clinicas_fila"],
    enabled: isSuperAdmin && !isImpersonating,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinicas")
        .select("id, nome")
        .order("nome", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  useEffect(() => {
    document.title = "Fila de Envios | DentOS";
  }, []);

  const dateRange = useMemo(() => getDateRange(periodo, customRange), [periodo, customRange]);

  const { data: carteira } = useQuery({
    queryKey: ["carteira_envios", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("carteira_envios")
        .select("saldo");
      
      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return { saldo: 0 };
        }
      }

      const { data, error } = await query;
      
      if (error) throw error;
      const totalSaldo = data ? data.reduce((acc, curr) => acc + (curr.saldo ?? 0), 0) : 0;
      return { saldo: totalSaldo };
    },
    enabled: !loading,
  });

  const { data: fila, isLoading, error, refetch } = useQuery({
    queryKey: ["fila_envios", clinica?.id, isSuperAdmin, isImpersonating, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      let query = (supabase as any)
        .from("fila_envios")
        .select("*, clinicas(nome)");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      query = query
        .gte("data_programada", dateRange.start.toISOString())
        .lte("data_programada", dateRange.end.toISOString());

      const { data, error } = await query.order("data_programada", { ascending: false });

      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        clinica_nome: item.clinicas?.nome || "—"
      }));
    },
    enabled: !loading,
    refetchInterval: 30000,
  });

  // Carregar campanhas de procedimento para obter nomes e associar nos filtros/lista
  const { data: campanhas } = useQuery({
    queryKey: ["campanhas_procedimento_fila", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("campanhas_procedimento")
        .select("group_id, procedimentos_nomes, mensagem");
      
      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  // Carregar solicitações de opt-out
  const { data: optOuts, isLoading: optOutsLoading } = useQuery({
    queryKey: ["solicitacoes_optout", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = (supabase as any)
        .from("solicitacoes_optout")
        .select("*");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !loading,
  });

  const procedimentosDisponiveis = useMemo(() => {
    if (!campanhas) return [];
    const nomes = new Set<string>();
    for (const camp of campanhas) {
      const procs: string[] = camp.procedimentos_nomes ?? [];
      for (const p of procs) {
        if (p) nomes.add(p.trim());
      }
    }
    return Array.from(nomes).sort();
  }, [campanhas]);

  // Lógica de filtragem por origem e procedimento (usada tanto para os cards quanto para a tabela)
  const filteredByOriginAndProc = useMemo(() => {
    if (!fila) return [];
    let dados = fila as any[];

    // 1. Filtrar por origem
    if (filtroOrigem !== "todas") {
      dados = dados.filter((item) => (item.origem ?? "").toLowerCase() === filtroOrigem.toLowerCase());
    }

    // 2. Filtrar por procedimento (apenas se origem for procedimento)
    if (filtroOrigem === "procedimento" && filtroProcedimento !== "todos") {
      dados = dados.filter((item) => {
        const campanha = campanhas?.find(c => c.group_id === item.campanha_ref);
        if (!campanha) return false;
        const nomes: string[] = campanha.procedimentos_nomes ?? [];
        return nomes.some(n => n.trim().toLowerCase() === filtroProcedimento.trim().toLowerCase());
      });
    }

    // 3. Filtrar por clínica (para super admin)
    if (isSuperAdmin && !isImpersonating && filtroClinica !== "todas") {
      dados = dados.filter((item) => item.clinica_id === filtroClinica);
    }

    return dados;
  }, [fila, filtroOrigem, filtroProcedimento, campanhas, filtroClinica, isSuperAdmin, isImpersonating]);

  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filteredByOriginAndProc;

    return (filteredByOriginAndProc as any[]).filter((item) => {
      const nome = (item.paciente_nome ?? "").toLowerCase();
      const status = (item.status ?? "").toLowerCase();
      const origem = (item.origem ?? "").toLowerCase();
      const mensagem = (item.mensagem ?? "").toLowerCase();
      const clinicaNome = (item.clinica_nome ?? "").toLowerCase();

      let matchesProcedimento = false;
      if ((item.origem ?? "").toLowerCase() === "procedimento" && campanhas) {
        const campanha = campanhas.find(c => c.group_id === item.campanha_ref);
        if (campanha) {
          const nomes: string[] = campanha.procedimentos_nomes ?? [];
          matchesProcedimento = nomes.some(n => n.toLowerCase().includes(term));
        }
      }

      return nome.includes(term) || status.includes(term) || origem.includes(term) || mensagem.includes(term) || matchesProcedimento || clinicaNome.includes(term);
    });
  }, [filteredByOriginAndProc, searchTerm, campanhas]);

  // Contagens baseadas nos dados filtrados (mas sem considerar o termo de busca textual)
  const contagens = useMemo(() => {
    const dados = filteredByOriginAndProc;
    return {
      pendentes: dados.filter(f => f.status === "pendente").length,
      enviados: dados.filter(f => f.status === "enviado").length,
      falhas: dados.filter(f => f.status === "falha").length,
      total: dados.length,
    };
  }, [filteredByOriginAndProc]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedData = useMemo(() => {
    if (!filteredData) return [];
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredData.slice(start, end);
  }, [filteredData, page, pageSize]);

  const pagesToShow = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const pages: (number | "ellipsis")[] = [1];
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(totalPages - 1, page + 1);
    if (startPage > 2) pages.push("ellipsis");
    for (let p = startPage; p <= endPage; p++) pages.push(p);
    if (endPage < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  const getStatusBadge = (status: string | null | undefined) => {
    const s = (status ?? "").toLowerCase();
    switch (s) {
      case 'pendente':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
      case 'enviado':
        return <Badge className="bg-green-500 hover:bg-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Enviado</Badge>;
      case 'falha':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Falha</Badge>;
      case 'dedup_ignorado':
        return <Badge variant="outline" className="border-slate-400 text-slate-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> Dedup</Badge>;
      case 'cancelado':
        return <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelado (Retornou)</Badge>;
      default:
        return <Badge variant="outline">{s || "—"}</Badge>;
    }
  };

  const getOrigemBadge = (origem: string | null | undefined, campanhaRef?: string | null) => {
    const o = (origem ?? "").toLowerCase();
    switch (o) {
      case 'massa':
        return <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50 flex items-center gap-1 text-[10px]"><Send className="w-3 h-3" /> Disparo Geral</Badge>;
      case 'procedimento': {
        const campanha = campanhas?.find(c => c.group_id === campanhaRef);
        const nomesProc = campanha?.procedimentos_nomes;
        const textoProcedimentos = nomesProc && nomesProc.length > 0 ? nomesProc.join(", ") : "";
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant="outline" className="border-purple-400 text-purple-600 bg-purple-50 flex items-center gap-1 text-[10px] w-fit">
              <Megaphone className="w-3 h-3" /> Procedimento
            </Badge>
            {textoProcedimentos && (
              <span className="text-[9px] text-muted-foreground font-medium pl-1 truncate max-w-[130px]" title={textoProcedimentos}>
                {textoProcedimentos}
              </span>
            )}
          </div>
        );
      }
      case 'aniversario_dia':
        return <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 flex items-center gap-1 text-[10px]"><Cake className="w-3 h-3" /> Aniversário</Badge>;
      case 'aniversario_mes':
        return <Badge variant="outline" className="border-emerald-400 text-emerald-600 bg-emerald-50 flex items-center gap-1 text-[10px]"><Cake className="w-3 h-3" /> Aniv. Mês</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{o || "—"}</Badge>;
    }
  };


  const periodoLabel = (p: PeriodoFiltro) => {
    switch (p) {
      case "hoje": return "Hoje";
      case "semanal": return "Esta Semana";
      case "mensal": return "Este Mês";
      case "personalizado": return "Personalizado";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Fila de Envios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Acompanhe as mensagens programadas para envio via WhatsApp. A fila é gerada automaticamente todos os dias às 7h.
            </p>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
          <Card className="bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Saldo da Carteira</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-primary">
                {carteira?.saldo?.toLocaleString('pt-BR') ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Créditos disponíveis
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-amber-600">
                {contagens.pendentes}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Aguardando envio
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Enviados</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {contagens.enviados}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Entregues com sucesso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Falhas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-destructive">
                {contagens.falhas}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Erro no envio
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros de período */}
        <Card>
          <CardHeader className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Período de envio */}
              <div className="flex flex-wrap items-center gap-2">
                {(["hoje", "semanal", "mensal", "personalizado"] as PeriodoFiltro[]).map((p) => (
                  <Button
                    key={p}
                    variant={periodo === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPeriodo(p);
                      setPage(1);
                    }}
                    className="text-xs"
                  >
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                    {periodoLabel(p)}
                  </Button>
                ))}

                {periodo === "personalizado" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {customRange?.from
                          ? customRange.to
                            ? `${format(customRange.from, "dd/MM/yy", { locale: ptBR })} — ${format(customRange.to, "dd/MM/yy", { locale: ptBR })}`
                            : format(customRange.from, "dd/MM/yyyy", { locale: ptBR })
                          : "Selecionar datas"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={customRange?.from || new Date()}
                        selected={customRange}
                        onSelect={(d) => {
                          setCustomRange(d);
                          setPage(1);
                        }}
                        numberOfMonths={isMobile ? 1 : 2}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                <div className="w-full sm:w-64">
                  <Input
                    placeholder="Buscar por paciente, mensagem..."
                    value={searchTerm}
                    onChange={(e) => {
                      setPage(1);
                      setSearchTerm(e.target.value);
                    }}
                  />
                </div>

                {isSuperAdmin && !isImpersonating && (
                  <div className="w-full sm:w-48">
                    <select
                      value={filtroClinica}
                      onChange={(e) => {
                        setFiltroClinica(e.target.value);
                        setPage(1);
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      <option value="todas">Todas as clínicas</option>
                      {filterClinicas?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="w-full sm:w-48">
                  <select
                    value={filtroOrigem}
                    onChange={(e) => {
                      setFiltroOrigem(e.target.value);
                      setFiltroProcedimento("todos");
                      setPage(1);
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="todas">Todas as origens</option>
                    <option value="massa">📢 Disparo Geral</option>
                    <option value="procedimento">🔊 Disparo por Procedimento</option>
                    <option value="aniversario_dia">🎂 Aniversário (Dia)</option>
                    <option value="aniversario_mes">🎂 Aniversário (Mês)</option>
                  </select>
                </div>

                {filtroOrigem === "procedimento" && (
                  <div className="w-full sm:w-48 animate-in fade-in-50 duration-200">
                    <select
                      value={filtroProcedimento}
                      onChange={(e) => {
                        setFiltroProcedimento(e.target.value);
                        setPage(1);
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      <option value="todos">Todos os procedimentos</option>
                      {procedimentosDisponiveis.map((procName) => (
                        <option key={procName} value={procName}>
                          {procName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Carregando fila…</p>}
            {error && (
              <p className="text-sm text-destructive">
                Ocorreu um erro ao carregar a fila. Detalhes: {(error as Error).message}
              </p>
            )}
            {!isLoading && !error && (!fila || fila.length === 0 || filteredData.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Clock className="h-10 w-10 opacity-30" />
                <p className="text-sm">Nenhuma mensagem encontrada neste período.</p>
                {periodo === "hoje" && (
                  <p className="text-xs">Clique em <strong>Gerar Fila do Dia</strong> para popular a fila com as campanhas ativas.</p>
                )}
              </div>
            )}
            {!isLoading && !error && filteredData && filteredData.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data Programada</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                        {isSuperAdmin && !isImpersonating ? (
                          <TableHead>Clínica</TableHead>
                        ) : (
                          <TableHead className="hidden sm:table-cell">Mensagem</TableHead>
                        )}
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Interação</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Custo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((item: any) => {
                        const dataProg = item.data_programada ? new Date(item.data_programada) : null;
                        const dataFormatada = dataProg
                          ? `${dataProg.toLocaleDateString("pt-BR")} ${dataProg.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                          : "—";
                        const previewMsg = item.mensagem
                          ? item.mensagem.length > 60
                            ? item.mensagem.slice(0, 60).trimEnd() + "…"
                            : item.mensagem
                          : "—";
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="whitespace-nowrap font-medium text-xs">{dataFormatada}</TableCell>
                            <TableCell className="text-xs">{item.paciente_nome ?? "—"}</TableCell>
                            <TableCell className="hidden sm:table-cell text-xs">{item.telefone ?? "—"}</TableCell>
                            {isSuperAdmin && !isImpersonating ? (
                              <TableCell className="text-xs font-semibold text-primary">{item.clinica_nome}</TableCell>
                            ) : (
                              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate" title={item.mensagem}>{previewMsg}</TableCell>
                            )}
                            <TableCell>{getOrigemBadge(item.origem, item.campanha_ref)}</TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.status === "enviado" && (
                                  <>
                                    {item.lida ? (
                                      <TooltipProvider>
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/5 text-blue-600 flex items-center gap-1 text-[10px] cursor-help">
                                              👁️ Lida
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-[250px] text-xs">
                                            {item.data_leitura ? (
                                              <p>Lida em: {new Date(item.data_leitura).toLocaleString("pt-BR")}</p>
                                            ) : (
                                              <p>Mensagem lida pelo paciente</p>
                                            )}
                                          </TooltipContent>
                                        </UITooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <Badge variant="outline" className="border-slate-200 text-slate-400 bg-slate-50 text-[10px]">
                                        Entregue
                                      </Badge>
                                    )}

                                    {item.respondida && (
                                      <TooltipProvider>
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 flex items-center gap-1 text-[10px] cursor-help">
                                              💬 Respondida
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-[250px] text-xs">
                                            <p className="font-semibold mb-1">Resposta do Paciente:</p>
                                            <p className="italic">"{item.mensagem_resposta || "Sem texto"}"</p>
                                            {item.data_resposta && (
                                              <p className="text-[10px] text-muted-foreground mt-1">
                                                Em {new Date(item.data_resposta).toLocaleString("pt-BR")}
                                              </p>
                                            )}
                                          </TooltipContent>
                                        </UITooltip>
                                      </TooltipProvider>
                                    )}

                                    {item.teve_retorno && (
                                      <TooltipProvider>
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="border-violet-500/30 bg-violet-500/5 text-violet-600 flex items-center gap-1 text-[10px] cursor-help">
                                              🔄 Retornou
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-[250px] text-xs">
                                            <p className="font-semibold mb-1">Paciente retornou!</p>
                                            {item.data_retorno && (
                                              <p className="text-muted-foreground">
                                                Retorno em: {new Date(item.data_retorno).toLocaleDateString("pt-BR")}
                                              </p>
                                            )}
                                          </TooltipContent>
                                        </UITooltip>
                                      </TooltipProvider>
                                    )}
                                  </>
                                )}
                                {item.status !== "enviado" && (
                                  <span className="text-muted-foreground/45 text-[10px]">—</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-right text-destructive font-medium text-xs">-{item.custo ?? 1}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
                    <span className="w-full text-center sm:w-auto sm:text-left">
                      Mostrando {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–
                      {Math.min(page * pageSize, totalItems)} de {totalItems}
                    </span>
                    <Pagination className="w-full justify-center sm:w-auto">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((prev) => Math.max(1, prev - 1));
                            }}
                            aria-disabled={page === 1}
                            className={page === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {pagesToShow.map((pageNumber, index) => (
                          <PaginationItem key={`${pageNumber}-${index}`}>
                            {pageNumber === "ellipsis" ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                href="#"
                                isActive={pageNumber === page}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setPage(pageNumber as number);
                                }}
                              >
                                {pageNumber}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((prev) => Math.min(totalPages, prev + 1));
                            }}
                            aria-disabled={page === totalPages}
                            className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção de Opt-Outs (Solicitações de Saída) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Solicitações de Saída (Opt-Out)</CardTitle>
                <CardDescription className="text-xs">
                  Pacientes que pediram para não receber mais mensagens. Eles são desabilitados automaticamente.
                </CardDescription>
              </div>
              {optOuts && optOuts.length > 0 && (
                <Badge variant="destructive" className="ml-auto text-sm">
                  {optOuts.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {optOutsLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!optOutsLoading && (!optOuts || optOuts.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhuma solicitação de saída registrada.</p>
              </div>
            )}
            {!optOutsLoading && optOuts && optOuts.length > 0 && (
              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Mensagem Recebida</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(optOuts as any[]).map((item: any) => {
                      const dataFormatada = item.created_at
                        ? new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "—";
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="whitespace-nowrap text-xs font-medium">{dataFormatada}</TableCell>
                          <TableCell className="text-xs font-medium">{item.paciente_nome || "—"}</TableCell>
                          <TableCell className="text-xs">{item.telefone || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[300px]">
                            <span className="italic" title={item.mensagem_recebida}>
                              "{item.mensagem_recebida ? (item.mensagem_recebida.length > 80 ? item.mensagem_recebida.slice(0, 80) + "…" : item.mensagem_recebida) : "—"}"
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit mx-auto text-[10px]">
                              <Ban className="w-3 h-3" /> Desabilitado
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default FilaEnvios;
