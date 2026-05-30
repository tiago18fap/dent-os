import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Users, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Sparkles, 
  ArrowRight, 
  RefreshCcw, 
  Loader2, 
  AlertCircle,
  HelpCircle,
  Calendar,
  LayoutDashboard,
  MoreVertical
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/contexts/ClinicaContext";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from "recharts";

// Cores para o gráfico de pizza (Situação dos Pacientes)
const PIE_COLORS = ["hsl(var(--login-primary))", "#f59e0b", "#94a3b8"];

const CardInfo = ({ text }: { text: string }) => (
  <UITooltip>
    <TooltipTrigger asChild>
      <button 
        type="button" 
        className="text-muted-foreground/50 hover:text-foreground p-1 rounded-full transition-colors cursor-help shrink-0"
        aria-label="Informações sobre o indicador"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent className="max-w-[220px] text-xs leading-relaxed bg-popover text-popover-foreground border shadow-md p-2.5">
      {text}
    </TooltipContent>
  </UITooltip>
);

const Index = () => {
  const navigate = useNavigate();
  const { clinica, loading: clinicaLoading, isSuperAdmin, isImpersonating } = useClinica();
  const clinicaId = clinica?.id;
  const isConsolidated = isSuperAdmin && !isImpersonating;

  // Estado do Modo Demonstração
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [hasInitializedDemo, setHasInitializedDemo] = useState(false);

  useEffect(() => {
    document.title = "Dashboard DentOS";
  }, []);

  // Redireciona para checkout se houver plano pendente no login/cadastro
  useEffect(() => {
    const pending = localStorage.getItem("pending_checkout_plano");
    if (pending && clinicaId) {
      navigate(`/assinatura?checkout=true&plano=${pending}`);
    }
  }, [clinicaId, navigate]);

  // 1. Query para total de pacientes
  const { data: totalPacientes = 0, isLoading: loadingPacientes } = useQuery({
    queryKey: ["dashboard_total_pacientes", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("clientes").select("*", { count: "exact", head: true });
      if (!isConsolidated) {
        if (!clinicaId) return 0;
        query = query.eq("clinica_id", clinicaId);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 2. Query para total de procedimentos
  const { data: totalProcedimentos = 0, isLoading: loadingProcedimentos } = useQuery({
    queryKey: ["dashboard_total_procedimentos", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("procedimentos").select("*", { count: "exact", head: true });
      if (!isConsolidated) {
        if (!clinicaId) return 0;
        query = query.eq("clinica_id", clinicaId);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 3. Query para estatísticas da fila (mensagens pendentes e histórico)
  const { data: queueStats = { pendente: 0, enviado: 0, falhou: 0, lido: 0, respondido: 0, retornado: 0 }, isLoading: loadingQueueStats } = useQuery({
    queryKey: ["dashboard_queue_stats", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("fila_envios").select("status, lida, respondida, teve_retorno");
      if (!isConsolidated) {
        if (!clinicaId) return { pendente: 0, enviado: 0, falhou: 0, lido: 0, respondido: 0, retornado: 0 };
        query = query.eq("clinica_id", clinicaId);
      }
      const { data, error } = await query;
      if (error) throw error;
      
      const stats = { pendente: 0, enviado: 0, falhou: 0, lido: 0, respondido: 0, retornado: 0 };
      data.forEach((item: any) => {
        if (item.status === "pendente") stats.pendente++;
        else if (item.status === "enviado") {
          stats.enviado++;
          if (item.lida) stats.lido++;
          if (item.respondida) stats.respondido++;
          if (item.teve_retorno) stats.retornado++;
        }
        else if (item.status === "falhou" || item.status === "error") stats.falhou++;
      });
      return stats;
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 4. Query para as últimas 3 sincronizações do Easy Dental
  const { data: syncLogs = [], isLoading: loadingSyncLogs } = useQuery({
    queryKey: ["dashboard_sync_logs", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("sync_logs").select("*");
      if (!isConsolidated) {
        if (!clinicaId) return [];
        query = query.eq("clinica_id", clinicaId);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 5. Query para os próximos 5 envios programados na fila (pendente)
  const { data: upcomingMessages = [], isLoading: loadingUpcoming } = useQuery({
    queryKey: ["dashboard_upcoming_messages", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("fila_envios")
        .select("id, paciente_nome, mensagem, data_programada, origem")
        .eq("status", "pendente");
      if (!isConsolidated) {
        if (!clinicaId) return [];
        query = query.eq("clinica_id", clinicaId);
      }
      const { data, error } = await query
        .order("data_programada", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 6. Query para distribuição de pacientes por situação
  const { data: patientDistribution = [], isLoading: loadingDistribution } = useQuery({
    queryKey: ["dashboard_patient_distribution", clinicaId, isConsolidated],
    queryFn: async () => {
      let query = supabase.from("clientes").select("situacao");
      if (!isConsolidated) {
        if (!clinicaId) return [];
        query = query.eq("clinica_id", clinicaId);
      }
      const { data, error } = await query;
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((item: any) => {
        const sit = item.situacao || "Outros";
        counts[sit] = (counts[sit] || 0) + 1;
      });
      
      return Object.keys(counts).map(key => ({
        name: key,
        value: counts[key]
      }));
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // 7. Query para estatísticas reais de conversão e retornos pós-mensagem
  const { data: realConversionStats = { retornos: 0, conversaoRate: 0, faturamentoRecuperado: 0, tempoRetornoDias: 0 }, isLoading: loadingConversion } = useQuery({
    queryKey: ["dashboard_real_conversion", clinicaId, isConsolidated],
    queryFn: async () => {
      // Buscar mensagens enviadas
      let msgQuery = supabase.from("fila_envios")
        .select("paciente_nome, created_at")
        .eq("status", "enviado");
      if (!isConsolidated) {
        if (!clinicaId) return { retornos: 0, conversaoRate: 0, faturamentoRecuperado: 0, tempoRetornoDias: 0 };
        msgQuery = msgQuery.eq("clinica_id", clinicaId);
      }
      const { data: sentMessages, error: msgError } = await msgQuery;
        
      if (msgError) throw msgError;
      if (!sentMessages || sentMessages.length === 0) {
        return { retornos: 0, conversaoRate: 0, faturamentoRecuperado: 0, tempoRetornoDias: 0 };
      }
      
      // Buscar todos os procedimentos para ver quais foram realizados depois do envio da campanha correspondente
      let procQuery = supabase.from("procedimentos").select("nome_paciente, data_finalizacao");
      if (!isConsolidated) {
        procQuery = procQuery.eq("clinica_id", clinicaId);
      }
      const { data: procs, error: procError } = await procQuery;
        
      if (procError) throw procError;
      
      const uniquePatientsMessaged = new Set(sentMessages.map(m => m.paciente_nome.trim().toUpperCase()));
      const uniqueReturns = new Set<string>();
      let totalDaysSaved = 0;
      let returnCount = 0;
      
      sentMessages.forEach(msg => {
        const msgDate = new Date(msg.created_at);
        const name = msg.paciente_nome.trim().toUpperCase();
        
        // Encontra procedimentos finalizados após o envio da mensagem para esse paciente
        const matchingProcs = procs.filter(p => {
          if (p.nome_paciente.trim().toUpperCase() !== name) return false;
          if (!p.data_finalizacao) return false;
          const procDate = new Date(p.data_finalizacao);
          return procDate > msgDate;
        });
        
        if (matchingProcs.length > 0) {
          uniqueReturns.add(name);
          matchingProcs.forEach(p => {
            const procDate = new Date(p.data_finalizacao);
            const diffTime = Math.abs(procDate.getTime() - msgDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            totalDaysSaved += diffDays;
            returnCount++;
          });
        }
      });
      
      const totalContatados = uniquePatientsMessaged.size;
      const totalRetornos = uniqueReturns.size;
      const conversaoRate = totalContatados > 0 ? (totalRetornos / totalContatados) * 100 : 0;
      const faturamentoRecuperado = totalRetornos * 150; // Média estimada de R$ 150 por consulta/retorno simples
      const avgTempoRetorno = returnCount > 0 ? Math.round(totalDaysSaved / returnCount) : 0;
      
      return {
        retornos: totalRetornos,
        conversaoRate: Math.round(conversaoRate * 10) / 10,
        faturamentoRecuperado,
        tempoRetornoDias: avgTempoRetorno
      };
    },
    enabled: !!clinicaId || isConsolidated,
  });

  // Inicializa o modo de demonstração caso a clínica não tenha envios reais
  useEffect(() => {
    if (!loadingQueueStats && !hasInitializedDemo) {
      const hasRealEnvios = queueStats.enviado > 0 || realConversionStats.retornos > 0;
      // Se não há envios reais, ativa o modo demo por padrão para não mostrar tela vazia
      setDemoMode(!hasRealEnvios);
      setHasInitializedDemo(true);
    }
  }, [queueStats.enviado, realConversionStats.retornos, loadingQueueStats, hasInitializedDemo]);

  // --- DADOS SIMULADOS PARA MODO DEMO ---
  const demoStats = {
    retornos: 147,
    conversaoRate: 15.3,
    faturamentoRecuperado: 22050,
    tempoRetornoReduzido: 45 // Redução média em dias no intervalo
  };

  const demoFaturamentoTrend = [
    { name: "Jan", valor: 2500 },
    { name: "Fev", valor: 5400 },
    { name: "Mar", valor: 11200 },
    { name: "Abr", valor: 16800 },
    { name: "Mai", valor: 22050 }
  ];

  const demoTempoRetorno = [
    { name: "Disparo Geral", Antes: 180, Depois: 135 },
    { name: "Procedimentos", Antes: 210, Depois: 145 },
    { name: "Aniversariantes", Antes: 150, Depois: 110 }
  ];

  const demoFunil = [
    { name: "Importados", qtd: 1915 },
    { name: "Contatados", qtd: 960 },
    { name: "Lidos", qtd: 648 },
    { name: "Respondidos", qtd: 284 },
    { name: "Retornos", qtd: 147 }
  ];

  // --- DADOS REAIS ---
  const activeStats = demoMode ? demoStats : {
    retornos: queueStats.retornado,
    conversaoRate: queueStats.enviado > 0 ? Math.round((queueStats.retornado / queueStats.enviado) * 100 * 10) / 10 : 0,
    faturamentoRecuperado: queueStats.retornado * 150, // R$ 150 de faturamento estimado por retorno
    tempoRetornoReduzido: realConversionStats.tempoRetornoDias > 0 ? 60 - realConversionStats.tempoRetornoDias : 0 // Compara com baseline de 60 dias
  };

  const faturamentoTrend = demoMode ? demoFaturamentoTrend : [
    { name: "Atual", valor: queueStats.retornado * 150 }
  ];

  const tempoRetorno = demoMode ? demoTempoRetorno : [
    { name: "Geral", Antes: 180, Depois: realConversionStats.tempoRetornoDias || 180 }
  ];

  const funilData = demoMode ? demoFunil : [
    { name: "Importados", qtd: totalPacientes },
    { name: "Contatados", qtd: queueStats.enviado },
    { name: "Lidos", qtd: queueStats.lido },
    { name: "Respondidos", qtd: queueStats.respondido },
    { name: "Retornos", qtd: queueStats.retornado }
  ];

  const isDemoActive = demoMode;

  const getBadgeOrigem = (origem: string) => {
    switch (origem) {
      case "procedimento":
        return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600">Procedimento</Badge>;
      case "aniversario_mes":
      case "aniversario":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">Aniversário</Badge>;
      default:
        return <Badge variant="outline">{origem}</Badge>;
    }
  };

  if (clinicaLoading) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando dados do painel analítico...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <TooltipProvider>
      <AppLayout>
      {/* Top Header com Título e Switch de Demonstração */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-[hsl(var(--login-primary))]" />
            Dashboard Analítico
          </h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe o desempenho das suas automações na clínica <span className="font-semibold text-foreground">{isConsolidated ? "Consolidado (Todas as clínicas)" : (clinica?.nome || "Carregando...")}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 rounded-full border bg-card px-4 py-2 shadow-sm shrink-0 self-start sm:self-center">
          <Switch 
            id="demo-toggle" 
            checked={demoMode} 
            onCheckedChange={setDemoMode} 
          />
          <Label htmlFor="demo-toggle" className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            Modo Demonstração
          </Label>
        </div>
      </div>

      {/* Banner explicativo do Modo Demo */}
      {isDemoActive && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3 text-sm animate-in fade-in slide-in-from-top-3 duration-300">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-800">Modo Demonstração Ativo</p>
            <p className="text-xs text-amber-700/90 leading-relaxed">
              Como sua clínica ainda não enviou mensagens reais (existem {queueStats.pendente} mensagens aguardando conexão na Fila de Envios), os gráficos de faturamento e taxas de retorno estão exibindo dados simulados. KPIs reais como <strong>Pacientes</strong>, <strong>Procedimentos</strong> e <strong>Fila</strong> continuam exibindo os dados reais do seu banco de dados.
            </p>
          </div>
        </div>
      )}

      {/* Grid de Cards de KPIs */}
      <section className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4" aria-label="Indicadores Chave de Performance">
        <Card className="hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total de Pacientes</CardTitle>
            <div className="flex items-center gap-0.5">
              <Users className="h-4 w-4 text-blue-500" />
              <CardInfo text="Total de pacientes importados e sincronizados da base de dados do seu software Easy Dental." />
            </div>
          </CardHeader>
          <CardContent>
            {loadingPacientes ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold">{totalPacientes.toLocaleString("pt-BR")}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Sincronizados da Easy Dental</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative">
            <CardTitle className="text-xs font-medium text-muted-foreground">Mensagens em Fila</CardTitle>
            <div className="flex items-center gap-0.5">
              <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
              <CardInfo text="Quantidade de mensagens automáticas de campanhas ativas que estão programadas e aguardando processamento na fila de disparos do WhatsApp." />
            </div>
          </CardHeader>
          <CardContent>
            {loadingQueueStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold">{queueStats.pendente}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Aguardando envio pelo WhatsApp</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all duration-300 border-[hsl(var(--login-primary))]/20 bg-[hsl(var(--login-primary))]/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative">
            <CardTitle className="text-xs font-medium text-[hsl(var(--login-primary))]">Retornos Convertidos</CardTitle>
            <div className="flex items-center gap-0.5">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--login-primary))]" />
              <CardInfo text="Pacientes contatados via WhatsApp que realizaram e concluíram um novo procedimento/consulta na clínica após a data de envio da mensagem." />
            </div>
          </CardHeader>
          <CardContent>
            {loadingConversion ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{activeStats.retornos}</p>
                <Badge className="bg-[hsl(var(--login-primary))] text-[10px] font-normal text-white">
                  {activeStats.conversaoRate}% conversão
                </Badge>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Pacientes que voltaram à clínica</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all duration-300 border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative">
            <CardTitle className="text-xs font-medium text-green-600">Receita Recuperada</CardTitle>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-green-500" />
              <CardInfo text="Volume financeiro recuperado, calculado multiplicando o total de pacientes que retornaram pelo ticket médio estimado de R$ 150 por consulta." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold text-green-700">
              {activeStats.faturamentoRecuperado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {isDemoActive ? "Simulação de ROI com base nos retornos" : "Cálculo real pós-disparos realizados"}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Seção de Gráficos Analíticos */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="Visualização de Dados e Gráficos">
        {/* Gráfico 1: Evolução de Receita Recuperada */}
        <Card className="hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span>Receita Recuperada Acumulada</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Histórico financeiro de tratamentos concluídos pós-comunicação ativa
              </CardDescription>
            </div>
            <CardInfo text="Evolução histórica do faturamento de tratamentos concluídos pós-comunicação ativa, acumulando os retornos convertidos ao longo do tempo." />
          </CardHeader>
          <CardContent className="h-64">
            {faturamentoTrend.length === 1 && faturamentoTrend[0].valor === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-xs text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
                <span>Nenhuma receita recuperada registrada ainda. <br/> Os envios precisam iniciar para gerar conversões financeiras.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={faturamentoTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--login-primary))" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="hsl(var(--login-primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="name" className="text-[10px] fill-muted-foreground" />
                  <YAxis className="text-[10px] fill-muted-foreground" tickFormatter={(val) => `R$ ${val}`} />
                  <Tooltip 
                    formatter={(value: any) => [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Faturamento"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Area type="monotone" dataKey="valor" stroke="hsl(var(--login-primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorFaturamento)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 2: Redução no Intervalo de Retorno */}
        <Card className="hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-500" />
                <span>Intervalo de Retorno do Paciente (Dias)</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Tempo médio que o paciente leva para retornar à clínica com vs sem campanhas
              </CardDescription>
            </div>
            <CardInfo text="Comparação do tempo médio (em dias) que os pacientes levam para retornar. Compara a média antes de usar a plataforma (baseline de 180 dias) com a média real após a implantação da comunicação ativa." />
          </CardHeader>
          <CardContent className="h-64">
            {tempoRetorno.length === 1 && tempoRetorno[0].Depois === 180 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-xs text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
                <span>Sem dados históricos suficientes de novos retornos reais para comparação.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tempoRetorno} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="name" className="text-[10px] fill-muted-foreground" />
                  <YAxis className="text-[10px] fill-muted-foreground" tickFormatter={(val) => `${val} dias`} />
                  <Tooltip 
                    formatter={(value: any) => [`${value} dias`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Antes" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Sem Automação (Baseline)" />
                  <Bar dataKey="Depois" fill="hsl(var(--login-primary))" radius={[4, 4, 0, 0]} name="Com DentOS (Atual)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 3: Funil de Conversão */}
        <Card className="hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>Funil de Engajamento e Conversão</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Fluxo desde o paciente cadastrado até o tratamento efetivado pós-mensagem
              </CardDescription>
            </div>
            <CardInfo text="Mapeamento do fluxo de pacientes: desde o total importado, quantos foram contatados por mensagem, quantos agendaram retorno e quantos concluíram seus tratamentos." />
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={funilData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis type="number" className="text-[10px] fill-muted-foreground" />
                <YAxis dataKey="name" type="category" className="text-[10px] fill-muted-foreground" />
                <Tooltip 
                  formatter={(value: any) => [`${value} pacientes`]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="qtd" fill="hsl(var(--login-primary))" radius={[0, 4, 4, 0]} name="Pacientes">
                  {funilData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        index === 0 ? "hsl(var(--muted-foreground)/35)" :
                        index === 1 ? "rgba(100, 116, 139, 0.65)" :
                        index === 2 ? "rgba(59, 130, 246, 0.75)" :
                        index === 3 ? "rgba(16, 185, 129, 0.85)" :
                        "hsl(var(--login-primary))"
                      } 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico 4: Pizza de Situação da Base de Pacientes */}
        <Card className="hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                <span>Situação Clínico-Operacional dos Pacientes</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Distribuição e saúde atual do cadastro de pacientes (banco de dados real)
              </CardDescription>
            </div>
            <CardInfo text="Percentual e quantidade de pacientes divididos por sua situação atual cadastrada no banco de dados (ex: Ativos, Inativos, etc.), ideal para medir a saúde da base." />
          </CardHeader>
          <CardContent className="h-64">
            {loadingDistribution ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : patientDistribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Nenhum paciente cadastrado para exibição de status.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={patientDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {patientDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [`${value} pacientes`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    wrapperStyle={{ fontSize: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Seção Inferior: Fila de Envios do Dia & Logs de Sincronizações */}
      <section className="grid gap-4 md:grid-cols-[5fr,4fr]" aria-label="Monitoramento em Tempo Real">
        {/* Fila de Envios Programados */}
        <Card className="hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="space-y-1.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span>Próximos Envios Agendados na Fila</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Próximos contatos agendados gerados automaticamente pelos critérios de campanhas
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => navigate("/fila-envios")}>
                  Ver Fila Completa
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <CardInfo text="Agenda de mensagens automáticas com disparos previstos para hoje, mostrando o nome do paciente, trecho da mensagem e origem da campanha." />
              </div>
            </CardHeader>
            <CardContent>
              {loadingUpcoming ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : upcomingMessages.length === 0 ? (
                <div className="text-center p-8 border rounded-lg border-dashed text-xs text-muted-foreground">
                  Nenhum envio programado na fila. Configure campanhas ou force uma atualização.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Paciente</TableHead>
                        <TableHead className="text-xs">Mensagem (Trecho)</TableHead>
                        <TableHead className="text-xs">Origem</TableHead>
                        <TableHead className="text-xs text-right">Programado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingMessages.map((msg: any) => (
                        <TableRow key={msg.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium max-w-[120px] truncate">{msg.paciente_nome}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{msg.mensagem}</TableCell>
                          <TableCell className="text-xs">{getBadgeOrigem(msg.origem)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground font-mono">
                            {new Date(msg.data_programada).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Histórico de Sincronizações (Easy Dental) */}
        <Card className="hover:shadow-md transition-shadow duration-300 flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="space-y-1.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <RefreshCcw className="h-4 w-4 text-[hsl(var(--login-primary))]" />
                  <span>Sincronizações Recentes (Easy Dental)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Histórico de importações automáticas executadas pelo worker
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => navigate("/configuracoes?tab=sistema")}>
                  Configurações
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <CardInfo text="Histórico das últimas execuções de importação de dados, indicando a data/hora, quantidade de novos pacientes/procedimentos sincronizados e o status da conexão." />
              </div>
            </CardHeader>
            <CardContent>
              {loadingSyncLogs ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : syncLogs.length === 0 ? (
                <div className="text-center p-8 border rounded-lg border-dashed text-xs text-muted-foreground">
                  Nenhuma sincronização executada ainda.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data/Hora</TableHead>
                        <TableHead className="text-xs">Resultados</TableHead>
                        <TableHead className="text-xs text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncLogs.map((log: any) => (
                        <TableRow key={log.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {new Date(log.created_at).toLocaleString("pt-BR", { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </TableCell>
                          <TableCell className="text-xs space-y-0.5">
                            <span className="block text-[11px] font-medium text-foreground">
                              {log.pacientes_importados} pacientes
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {log.procedimentos_importados} procedimentos
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            <Badge 
                              className={
                                log.status === "sucesso" 
                                  ? "bg-green-500 hover:bg-green-600 text-white font-normal text-[10px]" 
                                  : "bg-red-500 hover:bg-red-600 text-white font-normal text-[10px]"
                              }
                            >
                              {log.status === "sucesso" ? "Sucesso" : "Falhou"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </div>
        </Card>
      </section>
    </AppLayout>
  </TooltipProvider>
  );
};

export default Index;
