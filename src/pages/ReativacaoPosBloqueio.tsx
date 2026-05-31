import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/contexts/ClinicaContext";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Cake, Trash2, Send, Check, AlertTriangle, ArrowRight,
  Calendar, UserCheck, Stethoscope, RefreshCcw, PartyPopper,
} from "lucide-react";

interface FilaItem {
  id: string;
  paciente_nome: string;
  telefone: string;
  mensagem: string;
  data_programada: string;
  origem: string;
  campanha_ref: string | null;
  status: string;
}

const ReativacaoPosBloqueio = () => {
  const { clinica, refreshClinica } = useClinica();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Data
  const [aniversariosVencidos, setAniversariosVencidos] = useState<FilaItem[]>([]);
  const [aniversariosMes, setAniversariosMes] = useState<FilaItem[]>([]);
  const [procedimentosPendentes, setProcedimentosPendentes] = useState<FilaItem[]>([]);
  const [pacientesRetornaram, setPacientesRetornaram] = useState<Set<string>>(new Set());

  // User choices
  const [removerAnivVencidos, setRemoverAnivVencidos] = useState(true); // Recomendado
  const [enviarAnivMes, setEnviarAnivMes] = useState(true); // Recomendado
  const [manterProcedimentos, setManterProcedimentos] = useState(true); // Recomendado

  useEffect(() => {
    if (!clinica?.id) return;
    carregarDados();
  }, [clinica?.id]);

  const carregarDados = async () => {
    if (!clinica?.id) return;
    setLoading(true);

    try {
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
      const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // 1. Buscar todos os pendentes da fila
      const { data: filaData, error } = await (supabase as any)
        .from("fila_envios")
        .select("id, paciente_nome, telefone, mensagem, data_programada, origem, campanha_ref, status")
        .eq("clinica_id", clinica.id)
        .eq("status", "pendente")
        .order("data_programada", { ascending: true });

      if (error) throw error;

      const fila = (filaData ?? []) as FilaItem[];

      // Separar por tipo
      const anivVencidos: FilaItem[] = [];
      const anivMes: FilaItem[] = [];
      const procs: FilaItem[] = [];

      for (const item of fila) {
        const dataProg = new Date(item.data_programada);
        const isAniversario = item.origem === "aniversario_dia" || item.origem === "aniversario_mes";
        const isProcedimento = item.origem === "procedimento";

        if (isAniversario) {
          if (dataProg < agora) {
            // Verificar se é do mês atual
            if (dataProg.getMonth() === agora.getMonth() && dataProg.getFullYear() === agora.getFullYear()) {
              // Aniversário atrasado mas do mês atual → seção 2 (perguntar)
              anivMes.push(item);
            } else {
              // Aniversário vencido de meses anteriores → seção 1 (remover)
              anivVencidos.push(item);
            }
          } else {
            // Aniversário futuro → seção 2 (do mês)
            anivMes.push(item);
          }
        } else if (isProcedimento) {
          procs.push(item);
        }
      }

      setAniversariosVencidos(anivVencidos);
      setAniversariosMes(anivMes);
      setProcedimentosPendentes(procs);

      // 2. Verificar retornos de pacientes com procedimentos pendentes
      if (procs.length > 0) {
        const nomesPacientes = [...new Set(procs.map(p => p.paciente_nome?.trim().toUpperCase()).filter(Boolean))];
        
        if (nomesPacientes.length > 0) {
          const { data: procedimentosRecentes } = await (supabase as any)
            .from("procedimentos")
            .select("nome_paciente, data_finalizacao")
            .eq("clinica_id", clinica.id)
            .order("data_finalizacao", { ascending: false })
            .limit(500);

          const retornaram = new Set<string>();
          
          if (procedimentosRecentes) {
            // Para cada paciente com procedimento pendente, verifica se retornou
            for (const proc of procs) {
              const nomePendente = (proc.paciente_nome ?? "").trim().toUpperCase();
              const dataPendente = new Date(proc.data_programada);
              
              const retornou = procedimentosRecentes.some((r: any) => {
                const nomeProc = (r.nome_paciente ?? "").trim().toUpperCase();
                if (nomeProc !== nomePendente) return false;
                
                // Verifica se fez procedimento APÓS a data programada do envio
                const dataProc = parseDataBR(r.data_finalizacao);
                return dataProc && dataProc > dataPendente;
              });

              if (retornou) {
                retornaram.add(proc.id);
              }
            }
          }
          
          setPacientesRetornaram(retornaram);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados de reativação:", err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as mensagens pendentes.",
      });
    } finally {
      setLoading(false);
    }
  };

  const parseDataBR = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.trim().split("/");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month, day);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const getDiasAtraso = (dateStr: string) => {
    const d = new Date(dateStr);
    const agora = new Date();
    const diff = Math.floor((agora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const handleAplicar = async () => {
    if (!clinica?.id) return;
    setProcessing(true);

    try {
      const idsParaRemover: string[] = [];
      const idsParaManter: string[] = [];

      // 1. Aniversários vencidos
      if (removerAnivVencidos) {
        idsParaRemover.push(...aniversariosVencidos.map(a => a.id));
      } else {
        idsParaManter.push(...aniversariosVencidos.map(a => a.id));
      }

      // 2. Aniversários do mês
      if (!enviarAnivMes) {
        idsParaRemover.push(...aniversariosMes.map(a => a.id));
      }

      // 3. Procedimentos - remover os que retornaram, manter os demais
      for (const proc of procedimentosPendentes) {
        if (pacientesRetornaram.has(proc.id)) {
          // Paciente retornou → remover
          idsParaRemover.push(proc.id);
        } else if (!manterProcedimentos) {
          // Usuário escolheu não manter → remover
          idsParaRemover.push(proc.id);
        }
      }

      // Executar remoções
      if (idsParaRemover.length > 0) {
        // Remover em batches de 50
        for (let i = 0; i < idsParaRemover.length; i += 50) {
          const batch = idsParaRemover.slice(i, i + 50);
          const { error } = await (supabase as any)
            .from("fila_envios")
            .delete()
            .in("id", batch)
            .eq("clinica_id", clinica.id);
          
          if (error) {
            console.error("Erro ao remover itens:", error);
          }
        }
      }

      // Marcar reativação como concluída
      const { error: errorUpdate } = await (supabase as any)
        .from("clinicas")
        .update({ reativacao_pendente: false })
        .eq("id", clinica.id);

      if (errorUpdate) throw errorUpdate;

      const totalRemovidos = idsParaRemover.length;
      const anivMesEnviados = enviarAnivMes ? aniversariosMes.length : 0;
      const procMantidos = procedimentosPendentes.filter(p => !pacientesRetornaram.has(p.id)).length;
      const procRetornaram = pacientesRetornaram.size;

      toast({
        title: "✅ Reativação concluída!",
        description: `${totalRemovidos} mensagens removidas. ${anivMesEnviados > 0 ? `${anivMesEnviados} aniversários mantidos para envio. ` : ""}${procMantidos > 0 ? `${procMantidos} procedimentos mantidos. ` : ""}${procRetornaram > 0 ? `${procRetornaram} pacientes já retornaram.` : ""}`,
      });

      await refreshClinica();

      setTimeout(() => {
        navigate("/app", { replace: true });
      }, 1200);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao aplicar alterações",
        description: err.message || "Tente novamente.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handlePular = async () => {
    if (!clinica?.id) return;
    setProcessing(true);
    try {
      await (supabase as any)
        .from("clinicas")
        .update({ reativacao_pendente: false })
        .eq("id", clinica.id);
      
      await refreshClinica();
      navigate("/app", { replace: true });
    } catch {
      navigate("/app", { replace: true });
    } finally {
      setProcessing(false);
    }
  };

  const totalPendentes = aniversariosVencidos.length + aniversariosMes.length + procedimentosPendentes.length;
  const temDados = totalPendentes > 0;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">Analisando mensagens pendentes...</span>
        </div>
      </AppLayout>
    );
  }

  if (!temDados) {
    // Sem pendências → limpa flag e redireciona
    handlePular();
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <PartyPopper className="h-6 w-6 text-green-500 mr-2" />
          <span className="text-muted-foreground">Nenhuma pendência encontrada. Redirecionando...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-2 py-4">
          <div className="flex items-center justify-center gap-2">
            <PartyPopper className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Bem-vindo de volta!</h1>
          </div>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Enquanto sua clínica esteve com o acesso bloqueado, algumas mensagens ficaram pendentes.
            Revise abaixo e escolha o que fazer com cada tipo.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="text-sm py-1 px-3">
              {totalPendentes} mensagens pendentes
            </Badge>
          </div>
        </div>

        {/* Seção 1: Aniversários Vencidos */}
        {aniversariosVencidos.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                  <Cake className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Aniversários Vencidos</CardTitle>
                  <CardDescription>
                    {aniversariosVencidos.length} mensagem{aniversariosVencidos.length > 1 ? "s" : ""} de aniversário 
                    com data já passada
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                  {aniversariosVencidos.length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {aniversariosVencidos.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                    <div className="flex items-center gap-2">
                      <Cake className="h-3.5 w-3.5 text-amber-500" />
                      <span className="font-medium">{item.paciente_nome}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(item.data_programada)}</span>
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {getDiasAtraso(item.data_programada)}d atrás
                      </Badge>
                    </div>
                  </div>
                ))}
                {aniversariosVencidos.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ... e mais {aniversariosVencidos.length - 10} mensagens
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remover-aniv-vencidos"
                    checked={removerAnivVencidos}
                    onCheckedChange={(v) => setRemoverAnivVencidos(!!v)}
                  />
                  <label htmlFor="remover-aniv-vencidos" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    Remover aniversários vencidos
                    <Badge className="bg-green-500 text-[10px] px-1.5 py-0 ml-1">Recomendado</Badge>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Não faz sentido enviar parabéns com atraso. Esses pacientes serão parabenizados no próximo ano.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seção 2: Aniversários do Mês */}
        {aniversariosMes.length > 0 && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Cake className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Aniversários do Mês</CardTitle>
                  <CardDescription>
                    {aniversariosMes.length} aniversariante{aniversariosMes.length > 1 ? "s" : ""} deste mês
                    {aniversariosMes.some(a => new Date(a.data_programada) < new Date()) && " (alguns com atraso)"}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
                  {aniversariosMes.length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {aniversariosMes.slice(0, 10).map((item) => {
                  const atraso = getDiasAtraso(item.data_programada);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Cake className="h-3.5 w-3.5 text-blue-500" />
                        <span className="font-medium">{item.paciente_nome}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(item.data_programada)}</span>
                        {atraso > 0 && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                            {atraso}d atrás
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {aniversariosMes.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ... e mais {aniversariosMes.length - 10} aniversariantes
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enviar-aniv-mes"
                    checked={enviarAnivMes}
                    onCheckedChange={(v) => setEnviarAnivMes(!!v)}
                  />
                  <label htmlFor="enviar-aniv-mes" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-blue-500" />
                    Manter para envio
                    <Badge className="bg-green-500 text-[10px] px-1.5 py-0 ml-1">Recomendado</Badge>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Ainda é o mês do aniversário! As mensagens serão processadas normalmente na próxima execução da fila.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seção 3: Procedimentos Pendentes */}
        {procedimentosPendentes.length > 0 && (
          <Card className="border-purple-200 dark:border-purple-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <Stethoscope className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Procedimentos Pendentes</CardTitle>
                  <CardDescription>
                    {procedimentosPendentes.length} mensagem{procedimentosPendentes.length > 1 ? "ns" : ""} de acompanhamento pós-procedimento
                    {pacientesRetornaram.size > 0 && (
                      <span className="text-green-600 font-medium">
                        {" "}— {pacientesRetornaram.size} paciente{pacientesRetornaram.size > 1 ? "s" : ""} já retornou
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs">
                  {procedimentosPendentes.length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {procedimentosPendentes.slice(0, 15).map((item) => {
                  const retornou = pacientesRetornaram.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`flex items-center justify-between p-2 rounded text-sm ${
                        retornou ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {retornou ? (
                          <UserCheck className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Stethoscope className="h-3.5 w-3.5 text-purple-500" />
                        )}
                        <span className={`font-medium ${retornou ? "line-through text-muted-foreground" : ""}`}>
                          {item.paciente_nome}
                        </span>
                        {retornou && (
                          <Badge className="bg-green-500 text-[10px] px-1.5 py-0">Retornou ✓</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(item.data_programada)}</span>
                      </div>
                    </div>
                  );
                })}
                {procedimentosPendentes.length > 15 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ... e mais {procedimentosPendentes.length - 15} mensagens
                  </p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                {pacientesRetornaram.size > 0 && (
                  <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-2 mb-2">
                    <p className="text-xs text-green-700 dark:text-green-400">
                      <UserCheck className="h-3.5 w-3.5 inline mr-1" />
                      <strong>{pacientesRetornaram.size} paciente{pacientesRetornaram.size > 1 ? "s" : ""}</strong> já retornou 
                      à clínica durante o bloqueio. As mensagens desses pacientes serão removidas automaticamente.
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="manter-procedimentos"
                    checked={manterProcedimentos}
                    onCheckedChange={(v) => setManterProcedimentos(!!v)}
                  />
                  <label htmlFor="manter-procedimentos" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-purple-500" />
                    Manter procedimentos de pacientes que NÃO retornaram
                    <Badge className="bg-green-500 text-[10px] px-1.5 py-0 ml-1">Recomendado</Badge>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Pacientes que não retornaram ainda precisam da mensagem de acompanhamento.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resumo e Ação */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="font-semibold text-lg">Resumo das Ações</h3>
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  {aniversariosVencidos.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {removerAnivVencidos ? "🗑️" : "📩"} {aniversariosVencidos.length} aniv. vencidos
                    </Badge>
                  )}
                  {aniversariosMes.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {enviarAnivMes ? "📩" : "🗑️"} {aniversariosMes.length} aniv. do mês
                    </Badge>
                  )}
                  {procedimentosPendentes.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {manterProcedimentos ? "✅" : "🗑️"} {procedimentosPendentes.length - pacientesRetornaram.size} procs
                      {pacientesRetornaram.size > 0 && `, 🔄 ${pacientesRetornaram.size} retornaram`}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePular}
                  disabled={processing}
                  className="text-sm"
                >
                  Pular revisão
                </Button>
                <Button
                  onClick={handleAplicar}
                  disabled={processing}
                  className="gap-2"
                  size="lg"
                >
                  {processing ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Aplicar e Continuar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nota informativa */}
        <div className="text-center pb-6">
          <p className="text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            Esta tela aparece apenas uma vez após a reativação da sua assinatura.
            As opções marcadas como <span className="font-semibold text-green-600">Recomendado</span> são as melhores práticas.
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default ReativacaoPosBloqueio;
