import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useClinica } from "@/contexts/ClinicaContext";

const Clientes = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();

  const { data, isLoading, error } = useQuery({
    queryKey: ["clientes", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("clientes")
        .select("id, paciente, telefone, codigo, nascimento, situacao, prestador");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query.order("paciente", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filteredData = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return data;

    return data.filter((cliente) => {
      const nome = (cliente.paciente ?? "").toLowerCase();
      const codigo = (cliente.codigo ?? "").toString().toLowerCase();
      const telefone = (cliente.telefone ?? "").toString().toLowerCase();
      return nome.includes(term) || codigo.includes(term) || telefone.includes(term);
    });
  }, [data, searchTerm]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedData = useMemo(() => {
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
      <section className="space-y-4" aria-label="Lista de clientes/pacientes">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Clientes / Pacientes</CardTitle>
            <div className="w-full max-w-xs">
              <Input
                type="search"
                placeholder="Buscar por nome, código ou telefone..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="h-9 bg-background"
                aria-label="Buscar clientes"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Carregando clientes…</p>}
            {error && (
              <p className="text-sm text-destructive">
                Ocorreu um erro ao carregar os clientes. Tente novamente em instantes.
              </p>
            )}
            {!isLoading && !error && (!data || data.length === 0) && (
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
            {!isLoading && !error && data && data.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Nascimento</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Prestador</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((cliente) => (
                        <TableRow key={cliente.id}>
                          <TableCell>{cliente.paciente}</TableCell>
                          <TableCell>{cliente.telefone ?? "-"}</TableCell>
                          <TableCell>{cliente.codigo ?? "-"}</TableCell>
                          <TableCell>
                            {cliente.nascimento
                              ? new Date(cliente.nascimento).toLocaleDateString("pt-BR")
                              : "-"}
                          </TableCell>
                          <TableCell>{cliente.situacao ?? "-"}</TableCell>
                          <TableCell>{cliente.prestador ?? "-"}</TableCell>
                        </TableRow>
                      ))}
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
      </section>
    </AppLayout>
  );
};

export default Clientes;
