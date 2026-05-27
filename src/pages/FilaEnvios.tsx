import { AppLayout } from "@/layouts/AppLayout";
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
import { Wallet, Clock, CheckCircle2, XCircle, RefreshCcw, CalendarDays, Megaphone, Cake, Send, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClinica } from "@/contexts/ClinicaContext";
import { gerarFilaDiaria } from "@/utils/gerarFilaDiaria";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PeriodoFiltro = "hoje" | "semanal" | "mensal" | "personalizado";

function getDateRange(periodo: PeriodoFiltro, customRange?: DateRange): { start: Date; end: Date } {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

  switch (periodo) {
    case "hoje":
      return { start: inicioHoje, end: fimHoje };
    case "semanal": {
      const inicio = new Date(inicioHoje);
      inicio.setDate(inicio.getDate() - 6);
      return { start: inicio, end: fimHoje };
    }
    case "mensal": {
      const inicio = new Date(inicioHoje);
      inicio.setDate(inicio.getDate() - 29);
      return { start: inicio, end: fimHoje };
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("hoje");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [gerandoFila, setGerandoFila] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    document.title = "Fila de Envios | DentAlerta";
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
        .select("*");

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
      return data ?? [];
    },
    enabled: !loading,
    refetchInterval: 30000,
  });

  const filteredData = useMemo(() => {
    if (!fila) return [];
    const term = searchTerm.trim().toLowerCase();
    
    if (!term) return fila;

    return (fila as any[]).filter((item) => {
      const nome = (item.paciente_nome ?? "").toLowerCase();
      const status = (item.status ?? "").toLowerCase();
      const origem = (item.origem ?? "").toLowerCase();
      const mensagem = (item.mensagem ?? "").toLowerCase();
      return nome.includes(term) || status.includes(term) || origem.includes(term) || mensagem.includes(term);
    });
  }, [fila, searchTerm]);

  // Contagens baseadas nos dados filtrados por período (não pelo search)
  const contagens = useMemo(() => {
    const dados = (fila ?? []) as any[];
    return {
      pendentes: dados.filter(f => f.status === "pendente").length,
      enviados: dados.filter(f => f.status === "enviado").length,
      falhas: dados.filter(f => f.status === "falha").length,
      total: dados.length,
    };
  }, [fila]);

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
      default:
        return <Badge variant="outline">{s || "—"}</Badge>;
    }
  };

  const getOrigemBadge = (origem: string | null | undefined) => {
    const o = (origem ?? "").toLowerCase();
    switch (o) {
      case 'massa':
        return <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50 flex items-center gap-1 text-[10px]"><Send className="w-3 h-3" /> Massa</Badge>;
      case 'procedimento':
        return <Badge variant="outline" className="border-purple-400 text-purple-600 bg-purple-50 flex items-center gap-1 text-[10px]"><Megaphone className="w-3 h-3" /> Procedimento</Badge>;
      case 'aniversario_dia':
        return <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 flex items-center gap-1 text-[10px]"><Cake className="w-3 h-3" /> Aniversário</Badge>;
      case 'aniversario_mes':
        return <Badge variant="outline" className="border-emerald-400 text-emerald-600 bg-emerald-50 flex items-center gap-1 text-[10px]"><Cake className="w-3 h-3" /> Aniv. Mês</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{o || "—"}</Badge>;
    }
  };

  const handleGerarFila = async () => {
    if (!clinica?.id) {
      toast({ variant: "destructive", title: "Erro", description: "Selecione uma clínica primeiro." });
      return;
    }
    setGerandoFila(true);
    try {
      console.log("[GerarFila] Iniciando para clínica:", clinica.id);
      const resultado = await gerarFilaDiaria(clinica.id);
      console.log("[GerarFila] Resultado:", JSON.stringify(resultado, null, 2));
      
      if (resultado.erros.length > 0) {
        console.warn("[GerarFila] Erros:", resultado.erros);
      }

      const hasErros = resultado.erros.length > 0;

      toast({
        title: resultado.total > 0 ? "Fila gerada com sucesso!" : "Nenhuma mensagem nova",
        description: resultado.total > 0
          ? `${resultado.procedimentos} por procedimento, ${resultado.aniversarios} por aniversário. Total: ${resultado.total} novas mensagens.${hasErros ? ` (${resultado.erros.length} avisos)` : ""}`
          : hasErros
            ? `Nenhuma mensagem gerada. Avisos: ${resultado.erros[0]}`
            : "Todas as mensagens elegíveis já estão na fila ou não há campanhas ativas.",
        variant: hasErros && resultado.total === 0 ? "destructive" : "default",
      });

      // Refetch data
      refetch();
      queryClient.invalidateQueries({ queryKey: ["carteira_envios"] });
    } catch (err: any) {
      console.error("[GerarFila] Erro fatal:", err);
      toast({
        variant: "destructive",
        title: "Erro ao gerar fila",
        description: err?.message ?? "Não foi possível gerar a fila de envios.",
      });
    } finally {
      setGerandoFila(false);
    }
  };

  const periodoLabel = (p: PeriodoFiltro) => {
    switch (p) {
      case "hoje": return "Hoje";
      case "semanal": return "7 dias";
      case "mensal": return "30 dias";
      case "personalizado": return "Personalizado";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header com botão de gerar fila */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Fila de Envios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Acompanhe e gerencie as mensagens programadas para envio via WhatsApp.
            </p>
          </div>
          <Button
            onClick={handleGerarFila}
            disabled={gerandoFila || !clinica?.id}
            className="gap-2"
          >
            <RefreshCcw className={`h-4 w-4 ${gerandoFila ? "animate-spin" : ""}`} />
            {gerandoFila ? "Gerando..." : "Gerar Fila do Dia"}
          </Button>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Saldo da Carteira</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
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
              <div className="text-2xl font-bold text-amber-600">
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
              <div className="text-2xl font-bold text-green-600">
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
              <div className="text-2xl font-bold text-destructive">
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
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
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
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Buscar por paciente, status ou origem..."
                value={searchTerm}
                onChange={(e) => {
                  setPage(1);
                  setSearchTerm(e.target.value);
                }}
              />
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
                        <TableHead>Telefone</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
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
                            <TableCell className="text-xs">{item.telefone ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={item.mensagem}>{previewMsg}</TableCell>
                            <TableCell>{getOrigemBadge(item.origem)}</TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                            <TableCell className="text-right text-destructive font-medium text-xs">-{item.custo ?? 1}</TableCell>
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
      </div>
    </AppLayout>
  );
};

export default FilaEnvios;
