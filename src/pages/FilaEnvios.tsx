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
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Wallet, Clock, CheckCircle2, XCircle } from "lucide-react";

import { useClinica } from "@/contexts/ClinicaContext";

const FilaEnvios = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 20;

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

  const { data: fila, isLoading, error } = useQuery({
    queryKey: ["fila_envios", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("fila_envios")
        .select("*");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query.order("data_programada", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
    refetchInterval: 30000, // refresh every 30s
  });

  const filteredData = useMemo(() => {
    if (!fila) return [];
    const term = searchTerm.trim().toLowerCase();
    
    if (!term) return fila;

    return (fila as any[]).filter((item) => {
      const nome = (item.paciente_nome ?? "").toLowerCase();
      const status = (item.status ?? "").toLowerCase();
      const origem = (item.origem ?? "").toLowerCase();
      return nome.includes(term) || status.includes(term) || origem.includes(term);
    });
  }, [fila, searchTerm]);

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

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pendente':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
      case 'enviado':
        return <Badge className="bg-green-500 hover:bg-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Enviado</Badge>;
      case 'falha':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Falha</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
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
                Créditos de envios disponíveis
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Na Fila (Pendentes)</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {fila?.filter(f => f.status === 'pendente').length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Envios programados aguardando disparo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Enviado</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {fila?.filter(f => f.status === 'enviado').length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Mensagens entregues com sucesso
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Fatura e Fila de Envios</CardTitle>
              <CardDescription>
                Acompanhe o extrato de envios programados e realizados. Cada envio custa 1 crédito.
              </CardDescription>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Buscar por paciente ou status..."
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
            {!isLoading && !error && (!fila || fila.length === 0) && (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem na fila.</p>
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
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((item: any) => {
                        const dataProg = new Date(item.data_programada);
                        const dataFormatada = `${dataProg.toLocaleDateString("pt-BR")} ${dataProg.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="whitespace-nowrap font-medium">{dataFormatada}</TableCell>
                            <TableCell>{item.paciente_nome}</TableCell>
                            <TableCell>{item.telefone ?? "-"}</TableCell>
                            <TableCell className="capitalize">{item.origem ?? "Massa"}</TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">-${item.custo}</TableCell>
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
