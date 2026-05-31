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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [processandoCheckout, setProcessandoCheckout] = useState(false);
  const [iniciarTrial, setIniciarTrial] = useState(false);

  const [cnpj, setCnpj] = useState("");
  const [paymentType, setPaymentType] = useState<'assinatura' | 'avulso'>('assinatura');
  const [cardNum, setCardNum] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [mpPublicKey, setMpPublicKey] = useState("");

  useEffect(() => {
    if (clinica?.cnpj) {
      setCnpj(formatCnpj(clinica.cnpj));
    }
  }, [clinica]);

  useEffect(() => {
    // Carregar chave pública do Mercado Pago
    const fetchKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mercadopago-public-key");
        if (!error && data?.publicKey) {
          setMpPublicKey(data.publicKey);
        }
      } catch (e) {
        console.error("Failed to load public key", e);
      }
    };
    if (selectedPlanoForCheckout) {
      fetchKey();
    }
  }, [selectedPlanoForCheckout]);

  useEffect(() => {
    if (!selectedPlanoForCheckout) return;
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [selectedPlanoForCheckout]);

  const tokenizeCard = async () => {
    if (!mpPublicKey || mpPublicKey === "APP_USR-dummy-public-key" || !(window as any).MercadoPago) {
      console.warn("Mercado Pago SDK não carregado ou chave dummy. Usando token simulado.");
      return `mock_token_${Date.now()}`;
    }
    
    try {
      const mp = new (window as any).MercadoPago(mpPublicKey);
      const response = await mp.createCardToken({
        cardNumber: cardNum.replace(/\s+/g, ""),
        cardholderName: cardName,
        cardExpirationMonth: cardExpiry.split("/")[0],
        cardExpirationYear: "20" + cardExpiry.split("/")[1],
        securityCode: cardCvv,
      });
      return response.id;
    } catch (e) {
      console.error("Erro na tokenização do cartão:", e);
      return `mock_token_${Date.now()}`;
    }
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
  };

  const formatCardExpiry = (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
  };

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
    }
  }, [loading, clinica, isSuperAdmin, isImpersonating]);

  // Detecta se voltou do Mercado Pago com sucesso
  useEffect(() => {
    if (loading || !clinica) return;

    const query = new URLSearchParams(window.location.search);
    const success = query.get("success");
    const planoCheckout = query.get("plano_checkout") || selectedPlanoForCheckout;

    if (success === "true" && clinica.id) {
      const planoAtivo = planoCheckout || "bronze";
      
      const updatePlan = async () => {
        try {
          setProcessandoCheckout(true);
          toast({
            title: "Processando ativação...",
            description: "Estamos confirmando o seu pagamento e ativando seu plano.",
          });

          // Atualizar o plano e status de pagamento da clínica
          const { error: errorClinica } = await supabase
            .from("clinicas")
            .update({
              status_pagamento: "ativo",
              plano: planoAtivo,
              limite_mensagens: planoAtivo === "prata" ? 1000 : 100,
              limite_procedimentos: planoAtivo === "prata" ? 30 : 10,
              data_fim_teste: null
            })
            .eq("id", clinica.id);

          if (errorClinica) throw errorClinica;

          // Atualizar carteira de envios
          const { error: errorCarteira } = await supabase
            .from("carteira_envios")
            .upsert({
              clinica_id: clinica.id,
              saldo: planoAtivo === "prata" ? 1000 : 100
            });

          if (errorCarteira) throw errorCarteira;

          // Check if there are past-due pending messages
          const { data: pendingPast } = await (supabase as any)
            .from("fila_envios")
            .select("id")
            .eq("clinica_id", clinica.id)
            .eq("status", "pendente")
            .lt("data_programada", new Date().toISOString())
            .limit(1);

          if (pendingPast && pendingPast.length > 0) {
            await (supabase as any)
              .from("clinicas")
              .update({ reativacao_pendente: true })
              .eq("id", clinica.id);
          }

          toast({
            title: "Parabéns! Assinatura Ativada!",
            description: `Seu plano ${planoAtivo.toUpperCase()} foi ativado com sucesso.`,
          });

          localStorage.removeItem("pending_checkout_plano");

          // Remove query params sem dar reload
          const url = new URL(window.location.href);
          url.searchParams.delete("success");
          url.searchParams.delete("plano_checkout");
          window.history.replaceState({}, "", url.pathname + url.search);

          // Redireciona para o painel principal após um pequeno delay
          setTimeout(() => {
            window.location.href = "/app";
          }, 1500);

        } catch (err: any) {
          toast({
            variant: "destructive",
            title: "Erro ao ativar plano",
            description: err.message || "Tente novamente ou fale com o suporte.",
          });
        } finally {
          setProcessandoCheckout(false);
        }
      };

      updatePlan();
    }
  }, [loading, clinica, selectedPlanoForCheckout]);


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

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinica?.id) return;

    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      toast({
        variant: "destructive",
        title: "CNPJ inválido",
        description: "Por favor, informe um CNPJ válido com 14 dígitos.",
      });
      return;
    }

    setProcessandoCheckout(true);

    try {
      // 1. Atualizar o CNPJ no banco da clínica
      const { error: errorCnpj } = await supabase
        .from("clinicas")
        .update({ cnpj: cleanCnpj })
        .eq("id", clinica.id);

      if (errorCnpj) throw errorCnpj;

      if (iniciarTrial) {
        // Ativar trial de 7 dias
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
        setSelectedPlanoForCheckout(null);
        setIniciarTrial(false);
        
        // Recarregar a página para atualizar contexto
        setTimeout(() => {
          window.location.href = "/app";
        }, 1000);
      } else {
        // Pagar com cartão
        if (!cardNum || !cardName || !cardExpiry || !cardCvv) {
          toast({
            variant: "destructive",
            title: "Dados de cartão incompletos",
            description: "Por favor, preencha todos os campos do cartão de crédito.",
          });
          setProcessandoCheckout(false);
          return;
        }

        toast({
          title: "Processando...",
          description: "Tokenizando cartão de crédito...",
        });

        const cardToken = await tokenizeCard();

        toast({
          title: "Ativando plano...",
          description: "Enviando pagamento ao Mercado Pago...",
        });

        const { data: payData, error: payError } = await supabase.functions.invoke("mercadopago-transparent", {
          body: {
            planoId: selectedPlanoForCheckout,
            tipo: paymentType,
            token: cardToken,
          },
        });

        if (payError || !payData?.success) {
          toast({
            variant: "destructive",
            title: "Assinatura Recusada",
            description: payError?.message || "O pagamento do cartão foi recusado. Verifique os dados ou tente outro cartão.",
          });
        } else {
          toast({
            title: "Plano ativado!",
            description: `Seu plano ${selectedPlanoForCheckout.toUpperCase()} foi ativado com sucesso!`,
          });

          // Check if there are past-due pending messages
          const { data: pendingPast } = await (supabase as any)
            .from("fila_envios")
            .select("id")
            .eq("clinica_id", clinica.id)
            .eq("status", "pendente")
            .lt("data_programada", new Date().toISOString())
            .limit(1);

          if (pendingPast && pendingPast.length > 0) {
            await (supabase as any)
              .from("clinicas")
              .update({ reativacao_pendente: true })
              .eq("id", clinica.id);
          }
          
          localStorage.removeItem("pending_checkout_plano");
          setSelectedPlanoForCheckout(null);
          
          setTimeout(() => {
            window.location.href = "/app";
          }, 1000);
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no checkout",
        description: err.message || "Tente novamente mais tarde.",
      });
    } finally {
      setProcessandoCheckout(false);
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

  if (selectedPlanoForCheckout) {
    const price = selectedPlanoForCheckout === "prata" ? "R$ 139,00" : "R$ 89,00";
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Checkout — Plano {selectedPlanoForCheckout.toUpperCase()}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Finalize a contratação do plano selecionado. Preencha seus dados de faturamento e pagamento.
            </p>
          </div>

          <Card className="shadow-lg border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg">Resumo da Assinatura</CardTitle>
              <CardDescription>
                Você está contratando o plano <span className="font-bold capitalize text-primary">{selectedPlanoForCheckout}</span> por <span className="font-bold text-foreground">{price}/mês</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConfirmPayment} className="space-y-4">
                {/* Dados da Clínica (CNPJ) */}
                <div className="space-y-2">
                  <Label htmlFor="checkout-cnpj">CNPJ da Clínica</Label>
                  <Input
                    id="checkout-cnpj"
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                    required
                    disabled={processandoCheckout}
                  />
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    💳 Dados de Pagamento (Mercado Pago Transparente)
                  </h3>

                  {/* Seletor de Tipo de Pagamento */}
                  {!iniciarTrial && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentType("assinatura")}
                        className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                          paymentType === "assinatura"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-muted text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <span className="text-xs font-bold">Assinatura Recorrente</span>
                        <span className="text-[9px] font-normal leading-tight">Cobrança automática mensal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentType("avulso")}
                        className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                          paymentType === "avulso"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-muted text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <span className="text-xs font-bold">Pagamento Avulso</span>
                        <span className="text-[9px] font-normal leading-tight">Renovação manual mensal</span>
                      </button>
                    </div>
                  )}

                  {/* Checkbox de 7 Dias Grátis */}
                  <div className="flex items-center space-x-2 bg-muted/30 p-2.5 rounded-lg border border-dashed">
                    <input
                      id="checkout-trial-checkbox"
                      type="checkbox"
                      checked={iniciarTrial}
                      onChange={(e) => setIniciarTrial(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[hsl(var(--login-primary))] focus:ring-[hsl(var(--login-primary))] cursor-pointer accent-[hsl(var(--login-primary))]"
                    />
                    <label htmlFor="checkout-trial-checkbox" className="text-xs text-muted-foreground font-semibold cursor-pointer select-none">
                      Iniciar com 7 dias grátis de teste (sem pagar agora)
                    </label>
                  </div>

                  {/* Campos do Cartão (Escondidos no Trial) */}
                  {!iniciarTrial && (
                    <div className="space-y-3 animate-in fade-in-50 duration-200">
                      <div className="space-y-1.5">
                        <Label htmlFor="checkout-cardNum">Número do Cartão</Label>
                        <Input
                          id="checkout-cardNum"
                          type="text"
                          placeholder="0000 0000 0000 0000"
                          value={cardNum}
                          onChange={(e) => setCardNum(formatCardNumber(e.target.value))}
                          disabled={processandoCheckout}
                          required={!iniciarTrial}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="checkout-cardName">Nome impresso no Cartão</Label>
                        <Input
                          id="checkout-cardName"
                          type="text"
                          placeholder="NOME COMO NO CARTÃO"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value.toUpperCase())}
                          disabled={processandoCheckout}
                          required={!iniciarTrial}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="checkout-cardExpiry">Validade (MM/AA)</Label>
                          <Input
                            id="checkout-cardExpiry"
                            type="text"
                            placeholder="MM/AA"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(formatCardExpiry(e.target.value))}
                            disabled={processandoCheckout}
                            required={!iniciarTrial}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="checkout-cardCvv">CVV / Cód. Segurança</Label>
                          <Input
                            id="checkout-cardCvv"
                            type="password"
                            placeholder="123"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            disabled={processandoCheckout}
                            required={!iniciarTrial}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    type="submit"
                    className="flex-1 bg-[hsl(var(--login-primary))] hover:bg-[hsl(var(--login-primary))]/90 text-primary-foreground font-semibold py-5"
                    disabled={processandoCheckout}
                  >
                    {processandoCheckout ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Processando...</span>
                      </>
                    ) : iniciarTrial ? (
                      "Ativar 7 Dias Grátis & Acessar"
                    ) : (
                      "Confirmar Assinatura & Ativar Plano"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedPlanoForCheckout(null);
                      setIniciarTrial(false);
                      setCardNum("");
                      setCardName("");
                      setCardExpiry("");
                      setCardCvv("");
                    }}
                    className="py-5"
                    disabled={processandoCheckout}
                  >
                    Voltar para Planos
                  </Button>
                </div>
              </form>
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
                <p className="text-xl font-bold capitalize">
                  {clinica?.status_pagamento === "teste_gratis"
                    ? "7 Dias Grátis"
                    : clinica?.plano || "Nenhum"}
                </p>
                {clinica?.status_pagamento === "teste_gratis" && clinica?.plano && (
                  <p className="text-xs text-muted-foreground mt-0.5">Base: {clinica.plano.charAt(0).toUpperCase() + clinica.plano.slice(1)}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="mt-1">{getStatusBadge(clinica?.status_pagamento)}</div>
                {clinica?.status_pagamento === "teste_gratis" && clinica?.data_fim_teste && (
                  <p className="text-[10px] text-blue-600 mt-1">
                    {(() => {
                      const dias = Math.max(0, Math.ceil((new Date(clinica.data_fim_teste).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                      return dias > 0 ? `${dias} dia${dias > 1 ? "s" : ""} restante${dias > 1 ? "s" : ""}` : "Período expirado";
                    })()}
                  </p>
                )}
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
    </AppLayout>
  );
};

export default Assinatura;
