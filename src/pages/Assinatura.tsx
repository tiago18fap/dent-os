import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClinica } from "@/contexts/ClinicaContext";
import { supabase } from "@/integrations/supabase/client";
import { Check, CreditCard, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLANOS = [
  {
    id: "bronze",
    nome: "Bronze",
    preco: "R$ 89,00",
    mensagens: "100 mensagens/mês",
    procedimentos: "Até 5 campanhas de procedimento",
    suporte: "Suporte em até 48h",
    destaque: false,
  },
  {
    id: "prata",
    nome: "Prata",
    preco: "R$ 139,00",
    mensagens: "2.500 mensagens/mês",
    procedimentos: "Até 10 campanhas de procedimento",
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
  const { clinica, loading } = useClinica();
  const { toast } = useToast();

  const handleMudarPlano = async (planoId: string) => {
    try {
      toast({
        title: "Aguarde...",
        description: "Redirecionando para a página de pagamento seguro.",
      });

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planoId },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não retornada.");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao iniciar checkout",
        description: error.message || "Não foi possível conectar ao gateway de pagamento.",
      });
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
                    onClick={() => handleMudarPlano(plano.id)}
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
