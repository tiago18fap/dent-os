import { AppLayout } from "@/layouts/AppLayout";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

import { useClinica } from "@/contexts/ClinicaContext";

const Procedimentos = () => {
  const isMobile = useIsMobile();
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [prestadorOpen, setPrestadorOpen] = useState(false);
  const pageSize = 25;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: ["procedimentos", clinica?.id, isSuperAdmin, isImpersonating, debouncedSearch, professionalFilter, page],
    queryFn: async () => {
      let query = (supabase as any)
        .from("procedimentos")
        .select("id, nome_paciente, procedimento, prestador, data_finalizacao", { count: "exact" });

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return { data: [], count: 0 };
        }
      }

      if (debouncedSearch) {
        query = query.ilike("nome_paciente", `%${debouncedSearch}%`);
      }

      if (professionalFilter) {
        query = query.ilike("prestador", professionalFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order("data_finalizacao", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    enabled: !loading,
    retry: 1,
  });

  const procedimentos = queryResult?.data ?? [];
  const totalItems = queryResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Fetch unique prestadores (separate lightweight query)
  const { data: prestadoresData } = useQuery({
    queryKey: ["prestadores-unicos", clinica?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("procedimentos")
        .select("prestador");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) query = query.eq("clinica_id", clinica.id);
      }

      const { data } = await query.not("prestador", "is", null).limit(5000);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.prestador) set.add(r.prestador); });
      return Array.from(set).sort();
    },
    enabled: !loading,
  });

  const uniquePrestadores = prestadoresData ?? [];


  const pagesToShow = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: (number | "ellipsis")[] = [1];
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(totalPages - 1, page + 1);

    if (startPage > 2) {
      pages.push("ellipsis");
    }

    for (let p = startPage; p <= endPage; p++) {
      pages.push(p);
    }

    if (endPage < totalPages - 1) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <AppLayout>
      <section className="space-y-4" aria-label="Lista de procedimentos">
        <Card>
          <CardHeader className="flex flex-col gap-4">
            <CardTitle>Procedimentos</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <Input
                placeholder="Buscar por paciente..."
                value={searchTerm}
                onChange={(e) => {
                  setPage(1);
                  setSearchTerm(e.target.value);
                }}
              />
              
              <Popover open={prestadorOpen} onOpenChange={setPrestadorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={prestadorOpen}
                    className="w-full justify-between font-normal"
                  >
                    {professionalFilter
                      ? professionalFilter
                      : "Filtrar por Prestador..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] md:w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar prestador pelo nome..." />
                    <CommandList>
                      <CommandEmpty>Nenhum prestador encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setProfessionalFilter("");
                            setPrestadorOpen(false);
                            setPage(1);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              professionalFilter === "" ? "opacity-100" : "opacity-0"
                            )}
                          />
                          Todos os Prestadores
                        </CommandItem>
                        {uniquePrestadores.map((prestador) => (
                          <CommandItem
                            key={prestador}
                            value={prestador}
                            onSelect={(currentValue) => {
                              const original = uniquePrestadores.find(p => p.toLowerCase() === currentValue.toLowerCase());
                              setProfessionalFilter(original === professionalFilter ? "" : (original || ""));
                              setPrestadorOpen(false);
                              setPage(1);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                professionalFilter === prestador ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {prestador}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                          {format(date.to, "dd/MM/yyyy", { locale: ptBR })}
                        </>
                      ) : (
                        format(date.from, "dd/MM/yyyy", { locale: ptBR })
                      )
                    ) : (
                      <span>Filtrar por data...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from || new Date()}
                    selected={date}
                    onSelect={(d) => {
                      setPage(1);
                      setDate(d);
                    }}
                    numberOfMonths={isMobile ? 1 : 2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Carregando procedimentos…</p>}
            {error && (
              <p className="text-sm text-destructive">
                Ocorreu um erro ao carregar os procedimentos. Detalhes: {(error as Error).message}
              </p>
            )}
            {!isLoading && !error && procedimentos.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum procedimento encontrado.</p>
            )}
            {!isLoading && !error && procedimentos.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-md border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Procedimento</TableHead>
                        <TableHead className="hidden sm:table-cell">Prestador</TableHead>
                        <TableHead className="hidden sm:table-cell">Data finalização</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {procedimentos.map((proc: any) => (
                        <TableRow key={proc.id}>
                          <TableCell>{proc.procedimento}</TableCell>
                          <TableCell className="hidden sm:table-cell">{proc.prestador ?? "-"}</TableCell>
                          <TableCell className="hidden sm:table-cell">{proc.data_finalizacao ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
                    <span className="w-full text-center sm:w-auto sm:text-left">
                      Mostrando {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–
                      {Math.min(page * pageSize, totalItems)} de {totalItems.toLocaleString("pt-BR")}
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
      </section>
    </AppLayout>
  );
};

export default Procedimentos;
