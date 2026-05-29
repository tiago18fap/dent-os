import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Stethoscope, Users, Calendar as CalendarIcon } from "lucide-react";
import { useClinica } from "@/contexts/ClinicaContext";

interface ProcedimentoAgrupado {
  nome: string;
  total: number;
  prestadores: string[];
}

const PAGE_SIZE = 25;

const Procedimentos = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProc, setSelectedProc] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    document.title = "Procedimentos | DentOS";
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Busca TODOS os procedimentos e agrupa por nome (client-side grouping)
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ["procedimentos-raw", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      // Fetch all using pagination
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        let query = (supabase as any)
          .from("procedimentos")
          .select("procedimento, prestador, nome_paciente, data_finalizacao");

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            query = query.eq("clinica_id", clinica.id);
          } else {
            return [];
          }
        }

        const { data, error } = await query
          .order("procedimento", { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        allData = allData.concat(data ?? []);
        if (!data || data.length < batchSize) break;
        from += batchSize;
      }

      return allData;
    },
    enabled: !loading,
    retry: 1,
  });

  // Agrupar por nome do procedimento
  const agrupados = useMemo(() => {
    if (!rawData) return [];
    const map = new Map<string, { total: number; prestadores: Set<string> }>();

    rawData.forEach((proc: any) => {
      const nome = proc.procedimento ?? "Sem nome";
      if (!map.has(nome)) {
        map.set(nome, { total: 0, prestadores: new Set() });
      }
      const entry = map.get(nome)!;
      entry.total++;
      if (proc.prestador) entry.prestadores.add(proc.prestador);
    });

    return Array.from(map.entries())
      .map(([nome, info]) => ({
        nome,
        total: info.total,
        prestadores: Array.from(info.prestadores).sort(),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [rawData]);

  // Filtrar por busca
  const filtered = useMemo(() => {
    if (!debouncedSearch) return agrupados;
    const term = debouncedSearch.toLowerCase();
    return agrupados.filter(
      (p) =>
        p.nome.toLowerCase().includes(term) ||
        p.prestadores.some((pr) => pr.toLowerCase().includes(term))
    );
  }, [agrupados, debouncedSearch]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const paginatedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const pagesToShow = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(totalPages - 1, page + 1);
    if (startPage > 2) pages.push("ellipsis");
    for (let p = startPage; p <= endPage; p++) pages.push(p);
    if (endPage < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  const handleOpenDetail = (procNome: string) => {
    setSelectedProc(procNome);
    setDetailOpen(true);
  };

  return (
    <AppLayout>
      <section className="space-y-4" aria-label="Lista de procedimentos">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <CardTitle>Procedimentos</CardTitle>
              {!isLoading && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {agrupados.length} tipos
                </Badge>
              )}
            </div>
            <div className="w-full max-w-xs">
              <Input
                type="search"
                placeholder="Buscar procedimento ou prestador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 bg-background"
                aria-label="Buscar procedimentos"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando procedimentos…</span>
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">
                Ocorreu um erro ao carregar os procedimentos. Detalhes: {(error as Error).message}
              </p>
            )}
            {!isLoading && !error && paginatedData.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum procedimento encontrado.</p>
            )}
            {!isLoading && !error && paginatedData.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-md border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Procedimento</TableHead>
                        <TableHead className="hidden sm:table-cell">Prestador(es)</TableHead>
                        <TableHead className="text-center w-24">Realizados</TableHead>
                        <TableHead className="w-10">Detalhes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((proc) => (
                        <TableRow key={proc.nome} className="group">
                          <TableCell className="font-medium">{proc.nome}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[250px]">
                            {proc.prestadores.length > 0
                              ? proc.prestadores.join(", ")
                              : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs tabular-nums">
                              {proc.total}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-50 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleOpenDetail(proc.nome)}
                              title="Ver pacientes que realizaram este procedimento"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginação */}
                <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
                  <span className="w-full text-center sm:w-auto sm:text-left">
                    Mostrando {totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, totalItems)} de {totalItems}
                  </span>
                  {totalPages > 1 && (
                    <Pagination className="w-full justify-center sm:w-auto">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                            aria-disabled={page === 1}
                            className={page === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {pagesToShow.map((pn, i) => (
                          <PaginationItem key={`${pn}-${i}`}>
                            {pn === "ellipsis" ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                href="#"
                                isActive={pn === page}
                                onClick={(e) => { e.preventDefault(); setPage(pn as number); }}
                              >
                                {pn}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                            aria-disabled={page === totalPages}
                            className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Dialog de Detalhes do Procedimento */}
      <ProcedimentoDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        procedimentoNome={selectedProc}
        rawData={rawData ?? []}
      />
    </AppLayout>
  );
};

// ══════════════════════════════════════════════════════════════
// Dialog — Detalhes do Procedimento (timeline vertical de pacientes)
// ══════════════════════════════════════════════════════════════

function ProcedimentoDetailDialog({
  open,
  onClose,
  procedimentoNome,
  rawData,
}: {
  open: boolean;
  onClose: () => void;
  procedimentoNome: string | null;
  rawData: any[];
}) {
  // Filtrar dos dados já carregados (evita query com caracteres especiais)
  const pacientes = useMemo(() => {
    if (!procedimentoNome || !rawData) return [];
    return rawData.filter((p: any) => p.procedimento === procedimentoNome);
  }, [procedimentoNome, rawData]);

  if (!procedimentoNome) return null;

  // Agrupar por data para a timeline
  const porData = useMemo(() => {
    if (!pacientes) return [];
    const map = new Map<string, { pacientes: string[]; prestador: string }>();
    pacientes.forEach((p: any) => {
      const data = p.data_finalizacao || "Sem data";
      if (!map.has(data)) {
        map.set(data, { pacientes: [], prestador: p.prestador || "" });
      }
      const entry = map.get(data)!;
      if (p.nome_paciente && !entry.pacientes.includes(p.nome_paciente)) {
        entry.pacientes.push(p.nome_paciente);
      }
    });
    return Array.from(map.entries()).map(([data, info]) => ({
      data,
      pacientes: info.pacientes,
      prestador: info.prestador,
    }));
  }, [pacientes]);

  const totalPacientes = useMemo(() => {
    if (!pacientes) return 0;
    const set = new Set<string>();
    pacientes.forEach((p: any) => { if (p.nome_paciente) set.add(p.nome_paciente); });
    return set.size;
  }, [pacientes]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-5 w-5 text-primary shrink-0" />
            <span className="line-clamp-2">{procedimentoNome}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="rounded-lg border p-3 text-center">
            <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-bold">{totalPacientes}</p>
            <p className="text-[10px] text-muted-foreground">Pacientes</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <CalendarIcon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-bold">{pacientes.length}</p>
            <p className="text-[10px] text-muted-foreground">Realizações</p>
          </div>
        </div>

        {/* Timeline vertical */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Linha do Tempo
          </h3>

          {porData.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro encontrado.</p>
          )}

          {porData.length > 0 && (
            <div className="relative pl-5">
              {/* Linha vertical */}
              <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-muted-foreground/15" />

              <div className="space-y-3">
                {porData.map((item, i) => (
                  <div key={i} className="relative">
                    {/* Dot */}
                    <div className={`absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                      i === 0
                        ? "bg-primary border-primary"
                        : "bg-background border-muted-foreground/30"
                    }`} />

                    {/* Card */}
                    <div className={`rounded-lg border p-3 ${
                      i === 0 ? "border-primary/30 bg-primary/5" : "bg-muted/20"
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-primary tabular-nums">
                          {item.data}
                        </p>
                        {item.prestador && (
                          <p className="text-[10px] text-muted-foreground">
                            Dr(a). {item.prestador}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.pacientes.map((nome, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px] font-normal">
                            {nome}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Procedimentos;
