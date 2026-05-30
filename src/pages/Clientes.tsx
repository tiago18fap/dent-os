import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Eye, Users, Phone, Calendar, Stethoscope, Loader2, X, MessageSquare, Send, Ban, Trash2, UserCheck, ShieldAlert } from "lucide-react";
import { useClinica } from "@/contexts/ClinicaContext";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 25;

const Clientes = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    document.title = "Clientes | DentOS";
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Server-side paginated query
  const { data: queryResult, isLoading, error, refetch: refetchClientes } = useQuery({
    queryKey: ["clientes", clinica?.id, isSuperAdmin, isImpersonating, debouncedSearch, page],
    queryFn: async () => {
      let query = supabase
        .from("clientes")
        .select("id, paciente, telefone, codigo, nascimento, situacao, prestador", { count: "exact" });

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return { data: [], count: 0 };
        }
      }

      // Server-side search
      if (debouncedSearch) {
        query = query.or(
          `paciente.ilike.%${debouncedSearch}%,codigo.ilike.%${debouncedSearch}%,telefone.ilike.%${debouncedSearch}%`
        );
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order("paciente", { ascending: true })
        .range(from, to);

      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    enabled: !loading,
  });

  const clientes = queryResult?.data ?? [];
  const totalItems = queryResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const pagesToShow = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
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

  // Query para solicitações de opt-out (saída da lista)
  const optOutQuery = useQuery({
    queryKey: ["solicitacoes_optout", clinica?.id, isSuperAdmin, isImpersonating],
    queryFn: async () => {
      let query = supabase
        .from("solicitacoes_optout")
        .select("id, paciente_nome, telefone, mensagem_recebida, created_at, cliente_id");

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) {
          query = query.eq("clinica_id", clinica.id);
        } else {
          return [];
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  const optOutList = optOutQuery.data ?? [];

  const handleReactivar = async (logId: string, clienteId: string | null) => {
    try {
      if (clienteId) {
        const { error: updateError } = await supabase
          .from("clientes")
          .update({ situacao: "Ativo" })
          .eq("id", clienteId);

        if (updateError) throw updateError;
      }

      const { error: deleteError } = await supabase
        .from("solicitacoes_optout")
        .delete()
        .eq("id", logId);

      if (deleteError) throw deleteError;

      toast({
        title: "Paciente reativado!",
        description: "O paciente foi definido como Ativo e voltará a receber mensagens.",
      });

      optOutQuery.refetch();
      refetchClientes();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao reativar paciente",
        description: err.message || "Tente novamente mais tarde.",
      });
    }
  };

  const handleDeleteOptOut = async (logId: string) => {
    try {
      const { error } = await supabase
        .from("solicitacoes_optout")
        .delete()
        .eq("id", logId);

      if (error) throw error;

      toast({
        title: "Registro removido",
        description: "O registro de solicitação de saída foi excluído.",
      });

      optOutQuery.refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir registro",
        description: err.message || "Tente novamente mais tarde.",
      });
    }
  };

  const handleOpenDetail = (cliente: any) => {
    setSelectedCliente(cliente);
    setDetailOpen(true);
  };

  return (
    <AppLayout>
      <section className="space-y-4" aria-label="Gestão de Clientes e Opt-Out">
        <Tabs defaultValue="lista-clientes" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md bg-muted/60 p-1">
            <TabsTrigger value="lista-clientes" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Lista de Pacientes</span>
            </TabsTrigger>
            <TabsTrigger value="solicitacoes-saida" className="flex items-center gap-2 relative">
              <Ban className="h-4 w-4 text-destructive" />
              <span>Solicitações de Saída</span>
              {optOutList.length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px]">
                  {optOutList.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista-clientes" className="mt-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Clientes / Pacientes</CardTitle>
                  {!isLoading && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {totalItems.toLocaleString("pt-BR")} total
                    </Badge>
                  )}
                </div>
                <div className="w-full max-w-xs">
                  <Input
                    type="search"
                    placeholder="Buscar por nome, código ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-9 bg-background"
                    aria-label="Buscar clientes"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading && (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando clientes…</span>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-destructive">
                    Ocorreu um erro ao carregar os clientes. Tente novamente em instantes.
                  </p>
                )}
                {!isLoading && !error && clientes.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum cliente encontrado.</p>
                )}
                {!isLoading && !error && clientes.length > 0 && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-md border bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead className="hidden sm:table-cell">Código</TableHead>
                            <TableHead className="hidden sm:table-cell">Nascimento</TableHead>
                            <TableHead className="hidden sm:table-cell">Situação</TableHead>
                            <TableHead className="hidden md:table-cell">Prestador</TableHead>
                            <TableHead className="w-10">Detalhes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientes.map((cliente) => (
                            <TableRow key={cliente.id} className="group">
                              <TableCell className="font-medium">{cliente.paciente}</TableCell>
                              <TableCell className="tabular-nums text-xs">
                                {cliente.telefone ? formatPhone(cliente.telefone) : "-"}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                                {cliente.codigo ?? "-"}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-xs">
                                {cliente.nascimento
                                  ? new Date(cliente.nascimento + "T00:00:00").toLocaleDateString("pt-BR")
                                  : "-"}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    cliente.situacao === "Ativo"
                                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700"
                                      : cliente.situacao === "Desabilitado"
                                      ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700"
                                      : "border-gray-200 bg-gray-50 text-gray-400 dark:bg-gray-800/30 dark:text-gray-500 dark:border-gray-700"
                                  }`}
                                >
                                  {cliente.situacao ?? "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                {cliente.prestador ?? "-"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-50 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleOpenDetail(cliente)}
                                  title="Ver detalhes e procedimentos"
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
                        {Math.min(page * PAGE_SIZE, totalItems)} de {totalItems.toLocaleString("pt-BR")}
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
          </TabsContent>

          <TabsContent value="solicitacoes-saida" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <div>
                    <CardTitle className="text-lg">Solicitações de Remoção da Lista (Opt-Out / LGPD)</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pacientes que enviaram mensagens solicitando sair da lista ou reclamando. Eles foram automaticamente marcados como **Desabilitados** e não receberão novas mensagens do sistema.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {optOutQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando solicitações…</span>
                  </div>
                ) : optOutList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhuma solicitação de saída registrada.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Mensagem Recebida</TableHead>
                          <TableHead className="hidden sm:table-cell">Data da Solicitação</TableHead>
                          <TableHead className="w-24 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {optOutList.map((log: any) => (
                          <TableRow key={log.id} className="group">
                            <TableCell className="font-medium text-xs">
                              {log.paciente_nome}
                              {log.cliente_id ? (
                                <Badge variant="secondary" className="ml-2 bg-blue-50 text-blue-700 text-[9px] py-0.5 border-blue-200">
                                  Cadastrado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="ml-2 text-[9px] text-muted-foreground py-0.5 border-gray-200 bg-gray-50">
                                  Não Cadastrado
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="tabular-nums text-xs">
                              {log.telefone ? formatPhone(log.telefone) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={log.mensagem_recebida}>
                              {log.mensagem_recebida}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-xs">
                              {new Date(log.created_at).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {log.cliente_id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => handleReactivar(log.id, log.cliente_id)}
                                    title="Reativar paciente e voltar a enviar mensagens"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50"
                                  onClick={() => handleDeleteOptOut(log.id)}
                                  title="Excluir este log de solicitação"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* Dialog de Detalhes do Cliente */}
      <ClienteDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        cliente={selectedCliente}
        clinicaId={clinica?.id}
      />
    </AppLayout>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// ══════════════════════════════════════════════════════════════
// Dialog — Detalhes do Cliente com Timeline de Procedimentos
// ══════════════════════════════════════════════════════════════

function ClienteDetailDialog({
  open,
  onClose,
  cliente,
  clinicaId,
}: {
  open: boolean;
  onClose: () => void;
  cliente: any | null;
  clinicaId?: string;
}) {
  const { data: procedimentos, isLoading } = useQuery({
    queryKey: ["cliente-procedimentos", cliente?.id, cliente?.paciente],
    queryFn: async () => {
      if (!cliente?.paciente || !clinicaId) return [];
      const { data, error } = await (supabase as any)
        .from("procedimentos")
        .select("procedimento, data_finalizacao, prestador")
        .eq("clinica_id", clinicaId)
        .eq("nome_paciente", cliente.paciente)
        .order("data_finalizacao", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!cliente?.paciente,
  });

  const { data: mensagens, isLoading: loadingMsgs } = useQuery({
    queryKey: ["cliente-mensagens", cliente?.id],
    queryFn: async () => {
      if (!cliente?.id || !clinicaId) return [];
      const { data, error } = await (supabase as any)
        .from("fila_envios")
        .select("id, mensagem, data_programada, status, origem, created_at, lida, respondida, teve_retorno, data_leitura, data_resposta, data_retorno, mensagem_resposta")
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", cliente.id)
        .order("data_programada", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!cliente?.id,
  });

  if (!cliente) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {cliente.paciente}
          </DialogTitle>
        </DialogHeader>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <div className="rounded-lg border p-3 text-center">
            <Phone className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs font-medium">{cliente.telefone ? formatPhone(cliente.telefone) : "-"}</p>
            <p className="text-[10px] text-muted-foreground">Telefone</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <Calendar className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs font-medium">
              {cliente.nascimento
                ? new Date(cliente.nascimento + "T00:00:00").toLocaleDateString("pt-BR")
                : "-"}
            </p>
            <p className="text-[10px] text-muted-foreground">Nascimento</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <Badge
              variant="outline"
              className={`text-[10px] ${
                cliente.situacao === "Ativo"
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                  : "border-gray-200 bg-gray-50 text-gray-400 dark:bg-gray-800/30 dark:text-gray-500"
              }`}
            >
              {cliente.situacao ?? "-"}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-1">Situação</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <Stethoscope className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs font-medium">{procedimentos?.length ?? "..."}</p>
            <p className="text-[10px] text-muted-foreground">Procedimentos</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <MessageSquare className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs font-medium">{mensagens?.length ?? "..."}</p>
            <p className="text-[10px] text-muted-foreground">Mensagens</p>
          </div>
        </div>

        {/* Timeline de Procedimentos */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Stethoscope className="h-4 w-4 text-primary" />
            Linha do Tempo — Procedimentos
          </h3>

          {isLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Carregando procedimentos...</span>
            </div>
          )}

          {!isLoading && (!procedimentos || procedimentos.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum procedimento encontrado para este paciente.
            </p>
          )}

          {!isLoading && procedimentos && procedimentos.length > 0 && (
            <div className="relative">
              {/* Scrollable horizontal timeline */}
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-0 min-w-max">
                  {procedimentos.map((proc: any, i: number) => (
                    <div key={i} className="flex items-start">
                      {/* Timeline node */}
                      <div className="flex flex-col items-center min-w-[160px]">
                        {/* Dot */}
                        <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                          i === 0
                            ? "bg-primary border-primary"
                            : "bg-muted border-muted-foreground/30"
                        }`} />
                        {/* Connector line */}
                        {i < procedimentos.length - 1 && (
                          <div className="h-0.5 w-full bg-muted-foreground/15 absolute" style={{ display: 'none' }} />
                        )}
                        {/* Card */}
                        <div className={`mt-2 rounded-lg border p-2.5 w-[150px] ${
                          i === 0 ? "border-primary/30 bg-primary/5" : "bg-muted/30"
                        }`}>
                          <p className="text-[10px] font-semibold text-primary tabular-nums">
                            {proc.data_finalizacao || "Sem data"}
                          </p>
                          <p className="text-xs font-medium mt-0.5 line-clamp-2 leading-tight">
                            {proc.procedimento}
                          </p>
                          {proc.prestador && (
                            <p className="text-[10px] text-muted-foreground mt-1 truncate">
                              Dr(a). {proc.prestador}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Connector between nodes */}
                      {i < procedimentos.length - 1 && (
                        <div className="flex items-start pt-1.5">
                          <div className="w-4 h-0.5 bg-muted-foreground/20 mt-0" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="text-[10px] text-muted-foreground text-right pt-1 border-t">
                {procedimentos.length} procedimento{procedimentos.length !== 1 ? "s" : ""} registrado{procedimentos.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* Mensagens Enviadas */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Send className="h-4 w-4 text-primary" />
            Mensagens Enviadas
          </h3>

          {loadingMsgs && (
            <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Carregando mensagens...</span>
            </div>
          )}

          {!loadingMsgs && (!mensagens || mensagens.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhuma mensagem enviada para este paciente.
            </p>
          )}

          {!loadingMsgs && mensagens && mensagens.length > 0 && (
            <div className="relative pl-5">
              <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-muted-foreground/15" />
              <div className="space-y-3">
                {mensagens.map((msg: any, i: number) => {
                  const statusColor = msg.status === "enviado"
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : msg.status === "falha" || msg.status === "erro"
                    ? "border-red-400 bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : msg.status === "cancelado"
                    ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                    : msg.status === "dedup_ignorado"
                    ? "border-slate-400 bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400"
                    : "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400";

                  const origemLabel: Record<string, string> = {
                    aniversario_mes: "🎂 Aniversário",
                    aniversario_dia: "🎂 Aniv. Dia",
                    procedimento: "🦷 Procedimento",
                    massa: "📢 Disparo Geral",
                    manual: "✍️ Manual",
                  };

                  return (
                    <div key={msg.id} className="relative">
                      <div className={`absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                        msg.status === "enviado"
                          ? "bg-green-500 border-green-500"
                          : msg.status === "falha" || msg.status === "erro"
                          ? "bg-red-400 border-red-400"
                          : msg.status === "cancelado"
                          ? "bg-amber-400 border-amber-400"
                          : msg.status === "dedup_ignorado"
                          ? "bg-slate-400 border-slate-400"
                          : "bg-yellow-400 border-yellow-400"
                      }`} />
                      <div className={`rounded-lg border p-3 ${
                        msg.status === "enviado" ? "border-green-200/50 bg-green-50/30 dark:bg-green-950/10" : "bg-muted/20"
                      }`}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <p className="text-[10px] font-semibold text-primary tabular-nums">
                            {new Date(msg.data_programada).toLocaleDateString("pt-BR")} {new Date(msg.data_programada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {msg.status === "enviado" && (
                              <>
                                {msg.lida ? (
                                  <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/20 text-[9px] px-1.5 py-0 flex items-center gap-0.5">
                                    👁️ Lida
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-400 dark:bg-slate-900/10 text-[9px] px-1.5 py-0">
                                    Enviada
                                  </Badge>
                                )}
                              </>
                            )}
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusColor}`}>
                              {msg.status === "cancelado"
                                ? "Cancelado (Retornou)"
                                : msg.status === "dedup_ignorado"
                                ? "Dedup"
                                : msg.status}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {origemLabel[msg.origem] ?? msg.origem}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {msg.mensagem}
                        </p>
                        
                        {/* Indicador de Leitura detalhada */}
                        {msg.status === "enviado" && msg.lida && msg.data_leitura && (
                          <p className="text-[9px] text-muted-foreground/80 mt-1 flex items-center gap-1">
                            <span>✓✓ Lida em: {new Date(msg.data_leitura).toLocaleString("pt-BR")}</span>
                          </p>
                        )}

                        {/* Bloco de Resposta do Paciente */}
                        {msg.respondida && (
                          <div className="mt-2.5 pl-3 border-l-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 p-2 rounded text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Resposta do Paciente:</span>
                              {msg.data_resposta && (
                                <span className="text-[9px] text-muted-foreground">
                                  {new Date(msg.data_resposta).toLocaleString("pt-BR")}
                                </span>
                              )}
                            </div>
                            <p className="italic text-muted-foreground">"{msg.mensagem_resposta || "Sem texto"}"</p>
                          </div>
                        )}

                        {/* Bloco de Retorno Convertido */}
                        {msg.teve_retorno && (
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 px-2 py-1 rounded w-fit">
                            <span>🔄 <strong>Retorno Convertido!</strong> Paciente retornou à clínica{msg.data_retorno ? ` em ${new Date(msg.data_retorno).toLocaleDateString("pt-BR")}` : ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground text-right pt-1 border-t mt-3">
                {mensagens.length} mensagem{mensagens.length !== 1 ? "ns" : ""}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Clientes;
