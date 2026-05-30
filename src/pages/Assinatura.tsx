import { useState, useEffect } from "react";
import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinica } from "@/contexts/ClinicaContext";
import { supabase } from "@/integrations/supabase/client";
import { Check, CreditCard, ShieldAlert, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const PLANOS = [
  {
    id: "bronze",
    nome: "Bronze",
    preco: "R$ 89,00",
    mensagens: "100 mensagens/mês",
    procedimentos: "Até 10 campanhas de procedimento",
    suporte: "Suporte em até 48h",
    destaque: false,
  },
  {
    id: "prata",
    nome: "Prata",
    preco: "R$ 139,00",
    mensagens: "1.000 mensagens/mês",
    procedimentos: "Até 30 campanhas de procedimento",
    suporte: "Suporte em até 24h",
    destaque: true,
  },
  {
    id: "ouro",
    nome: "Ouro",
    preco: "Sob Consulta",
    mensagens: "Volume Personalizado",
    procedimentos: "Campanhas Ilimitadas",
    suporte: "Gerente de Contas Dedicado",
    destaque: false,
  },
];

const Assinatura = () => {
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();
  const { toast } = useToast();

  const [selectedPlanoForCheckout, setSelectedPlanoForCheckout] = useState<string | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [processandoCheckout, setProcessandoCheckout] = useState(false);
  const [iniciarTrial, setIniciarTrial] = useState(false);

  // Detecta checkout automático por query param ou localStorage
  useEffect(() => {
    if (loading || !clinica) return;

    // Se é super admin e não está impersonating, não faz sentido fazer checkout de clínica
    if (isSuperAdmin && !isImpersonating) return;

    const pendingPlano = localStorage.getItem("pending_checkout_plano");
    const queryPlano = new URLSearchParams(window.location.search).get("plano");
    const planoId = queryPlano || pendingPlano;

    if (planoId && ["bronze", "prata", "ouro"].includes(planoId)) {
      // Limpa os pendentes para evitar loops
      localStorage.removeItem("pending_checkout_plano");
      
      // Remove o param do URL sem recarregar a página
      const url = new URL(window.location.href);
      url.searchParams.delete("plano");
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.pathname + url.search);

      if (planoId === 'ouro') {
        toast({
          title: "Plano Ouro",
          description: "Fale com nosso suporte em contato@dentos.com.br para um plano personalizado.",
        });
        return;
      }

      setSelectedPlanoForCheckout(planoId);
      setCheckoutDialogOpen(true);
    }
  }, [loading, clinica, isSuperAdmin, isImpersonating]);

  const adminClinicasQuery = useQuery({
    queryKey: ["admin_assinaturas_clinicas"],
    enabled: isSuperAdmin && !isImpersonating && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinicas")
        .select("id, nome, plano, status_pagamento, data_fim_teste, created_at")
        .order("nome", { ascending: true });

      if (error) throw error;
      return data ?? [];
    }
  });

  const iniciarCheckoutMP = async (tipo: 'assinatura' | 'avulso') => {
    if (!selectedPlanoForCheckout) return;
    try {
      setProcessandoCheckout(true);
      toast({
        title: "Aguarde...",
        description: "Redirecionando para o pagamento seguro do Mercado Pago.",
      });

      const { data, error } = await supabase.functions.invoke("mercadopago-checkout", {
        body: { planoId: selectedPlanoForCheckout, tipo },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não retornada pelo Mercado Pago.");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao iniciar checkout",
        description: error.message || "Não foi possível conectar ao Mercado Pago.",
      });
    } finally {
      setProcessandoCheckout(false);
      setCheckoutDialogOpen(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "ativo":
        return <Badge className="bg-green-500">Ativa</Badge>;
      case "teste_gratis":
        return <Badge className="bg-blue-500">Teste Grátis</Badge>;
      case "inadimplente":
        return <Badge variant="destructive">Pagamento Pendente</Badge>;
      case "cancelado":
        return <Badge variant="outline">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">Carregando dados da assinatura...</div>
      </AppLayout>
    );
  }

  if (isSuperAdmin && !isImpersonating) {
    const clinicasList = adminClinicasQuery.data ?? [];
    const totalClinicas = clinicasList.length;
    const bronzeCount = clinicasList.filter(c => c.plano === 'bronze').length;
    const prataCount = clinicasList.filter(c => c.plano === 'prata').length;
    const ouroCount = clinicasList.filter(c => c.plano === 'ouro').length;
    const premiumCount = clinicasList.filter(c => c.plano === 'ilimitado_premium').length;

    const activeCount = clinicasList.filter(c => c.status_pagamento === 'ativo').length;
    const trialCount = clinicasList.filter(c => c.status_pagamento === 'teste_gratis').length;
    const unpaidCount = clinicasList.filter(c => c.status_pagamento === 'inadimplente').length;

    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Painel de Assinaturas (Admin)</h1>
            <p className="text-muted-foreground mt-2">
              Visão geral de faturamento e planos de todas as clínicas cadastradas no DentOS.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase text-foreground/70">Total de Clínicas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalClinicas}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase text-green-600">Assinaturas Ativas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeCount}</div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Bronze: {bronzeCount} | Prata: {prataCount} | Ouro: {ouroCount} | Premium: {premiumCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase text-blue-600">Período de Teste</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{trialCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase text-destructive">Inadimplentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{unpaidCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Lista de Faturamento por Clínica</CardTitle>
            </CardHeader>
            <CardContent>
              {adminClinicasQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Carregando dados das clínicas...</p>
              ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clínica</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Status Financeiro</TableHead>
                        <TableHead>Fim do Período de Teste</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clinicasList.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-xs">
                            {c.nome}
                            <span className="block text-[9px] text-muted-foreground font-mono">{c.id}</span>
                          </TableCell>
                          <TableCell className="text-xs capitalize">{c.plano.replaceAll('_', ' ')}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={c.status_pagamento === 'ativo' ? 'default' : c.status_pagamento === 'teste_gratis' ? 'secondary' : 'destructive'}
                              className="text-[10px] font-normal"
                            >
                              {c.status_pagamento.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.data_fim_teste ? new Date(c.data_fim_teste).toLocaleDateString("pt-BR") : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-primary/50 text-primary hover:bg-primary/10"
                              onClick={() => {
                                localStorage.setItem("impersonated_clinica_id", c.id);
                                toast({
                                  title: "Visualizando clínica",
                                  description: `Você agora está visualizando o painel de ${c.nome}.`
                                });
                                setTimeout(() => {
                                  window.location.reload();
                                }, 800);
                              }}
                            >
                              Visualizar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assinatura & Planos</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie o plano da {clinica?.nome || "sua clínica"}, limites de uso e cobranças.
          </p>
        </div>

        {clinica?.status_pagamento === "inadimplente" && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 mt-0.5" />
            <div>
              <h3 className="font-semibold">Acesso Bloqueado</h3>
              <p className="text-sm mt-1">
                Sua assinatura encontra-se com pendência financeira. O acesso a disparos e gestão de clientes está bloqueado.
                Por favor, regularize escolhendo um plano abaixo para liberar o sistema instantaneamente.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Plano Atual</CardTitle>
            <CardDescription>Resumo do consumo do ciclo atual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/50 border">
              <div>
                <p className="text-sm text-muted-foreground">Plano</p>
                <p className="text-xl font-bold capitalize">{clinica?.plano || "Nenhum"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="mt-1">{getStatusBadge(clinica?.status_pagamento)}</div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Limite Mensal</p>
                <p className="text-xl font-bold">{clinica?.limite_mensagens?.toLocaleString() || 0} envios</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-semibold mb-4">Mudar de Plano</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANOS.map((plano) => (
              <Card 
                key={plano.id} 
                className={`relative flex flex-col ${plano.destaque ? 'border-primary shadow-lg scale-105 z-10' : ''}`}
              >
                {plano.destaque && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Mais Popular
                    </span>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plano.nome}</CardTitle>
                  <CardDescription className="text-xl font-bold text-foreground mt-2">
                    {plano.preco}
                    {plano.preco !== "Sob Consulta" && <span className="text-sm font-normal text-muted-foreground"> /mês</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      {plano.mensagens}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      {plano.procedimentos}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      {plano.suporte}
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant={plano.destaque ? "default" : "outline"} 
                    className="w-full"
                    onClick={() => {
                      if (plano.id === 'ouro') {
                        toast({
                          title: "Plano Ouro",
                          description: "Fale com nosso suporte em contato@dentos.com.br para um plano personalizado.",
                        });
                        return;
                      }
                      setSelectedPlanoForCheckout(plano.id);
                      setCheckoutDialogOpen(true);
                    }}
                    disabled={clinica?.plano === plano.id}
                  >
                    {clinica?.plano === plano.id ? "Seu Plano Atual" : "Escolher " + plano.nome}
                    <CreditCard className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="sm:max-w-[450px] border-primary/20 bg-background/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <CreditCard className="h-5 w-5 text-primary" />
              <span>Checkout do Plano</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Selecione a forma de pagamento do plano <strong className="capitalize text-foreground font-semibold">{selectedPlanoForCheckout}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Corpo do Checkout Dinâmico */}
          {iniciarTrial ? (
            <div className="pt-2 space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground leading-relaxed">
                Você escolheu iniciar o plano <strong className="capitalize">{selectedPlanoForCheckout}</strong> no período de testes. Seu acesso será liberado por <strong>7 dias totalmente grátis</strong> sem nenhuma cobrança ou cadastro de cartão hoje.
              </div>
              <Button
                className="w-full bg-[hsl(var(--login-primary))] hover:bg-[hsl(var(--login-primary))]/90 text-primary-foreground font-semibold py-6 flex items-center justify-center gap-2"
                onClick={async () => {
                  if (!clinica?.id) return;
                  try {
                    setProcessandoCheckout(true);
                    
                    // Atualiza o status de pagamento e a validade da clínica no Supabase
                    const { error } = await supabase
                      .from("clinicas")
                      .update({
                        status_pagamento: "teste_gratis",
                        data_fim_teste: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                      })
                      .eq("id", clinica.id);

                    if (error) throw error;

                    toast({
                      title: "Período de teste ativado!",
                      description: "Seus 7 dias gratuitos foram liberados. Aproveite!",
                    });
                    
                    localStorage.removeItem("pending_checkout_plano");
                    setCheckoutDialogOpen(false);
                    
                    // Recarrega a página no Dashboard para atualizar o ClinicaContext e liberar o acesso
                    window.location.href = "/app";
                  } catch (err: any) {
                    toast({
                      variant: "destructive",
                      title: "Erro ao ativar teste",
                      description: err.message || "Tente novamente mais tarde.",
                    });
                  } finally {
                    setProcessandoCheckout(false);
                  }
                }}
                disabled={processandoCheckout}
              >
                {processandoCheckout ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>Ativar 7 Dias Grátis & Acessar Painel</span>
                )}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pt-2">
              <Button
                className="h-24 flex flex-col items-start p-4 hover:border-primary border border-muted bg-card hover:bg-primary/5 transition-all text-left group"
                variant="outline"
                disabled={processandoCheckout}
                onClick={() => iniciarCheckoutMP("assinatura")}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-foreground group-hover:text-primary transition-colors">Assinatura Mensal Automática</span>
                  <Badge className="bg-primary/20 text-primary border-0 hover:bg-primary/20 text-[10px]">Recomendado</Badge>
                </div>
                <span className="text-xs text-muted-foreground font-normal mt-1 whitespace-normal">
                  Cobrança recorrente no Cartão de Crédito. Sem preocupações com renovação mensal.
                </span>
              </Button>

              <Button
                className="h-24 flex flex-col items-start p-4 hover:border-primary border border-muted bg-card hover:bg-primary/5 transition-all text-left group"
                variant="outline"
                disabled={processandoCheckout}
                onClick={() => iniciarCheckoutMP("avulso")}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-foreground group-hover:text-primary transition-colors">Pagamento Avulso Mensal</span>
                  <Badge variant="outline" className="text-[10px]">Pix ou Cartão</Badge>
                </div>
                <span className="text-xs text-muted-foreground font-normal mt-1 whitespace-normal">
                  Gere um Pix ou pague com cartão de crédito manualmente a cada mês para renovar sua conta.
                </span>
              </Button>
            </div>
          )}

          {/* Checkbox para optar pelo Trial de 7 Dias Grátis */}
          <div className="flex items-center space-x-2 border-t pt-4 mt-2">
            <input
              id="trial-checkbox"
              type="checkbox"
              checked={iniciarTrial}
              onChange={(e) => setIniciarTrial(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[hsl(var(--login-primary))] focus:ring-[hsl(var(--login-primary))] cursor-pointer accent-[hsl(var(--login-primary))]"
            />
            <label htmlFor="trial-checkbox" className="text-xs text-muted-foreground font-semibold cursor-pointer select-none">
              Iniciar com 7 dias grátis de teste (sem pagar agora)
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Assinatura;
