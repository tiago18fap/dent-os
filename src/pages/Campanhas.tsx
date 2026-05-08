import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/contexts/ClinicaContext";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

const aniversariantesFake = [
  { nome: "Ana Paula", data: "10/10", telefone: "(11) 99999-0001", alertado: true },
  { nome: "Bruno Silva", data: "11/10", telefone: "(11) 99999-0002", alertado: false },
  { nome: "Carla Souza", data: "15/10", telefone: "(11) 99999-0003", alertado: false },
];

type ProcedimentoId = string;

interface ProcedimentoDb {
  id: ProcedimentoId;
  procedimento: string;
  mensagem: string | null;
  tempo_disparo_minutos: number | null;
}

const PROCEDIMENTO_BG_CLASSES: string[] = [
  "bg-primary/5",
  "bg-secondary/5",
  "bg-accent/5",
  "bg-primary/10",
  "bg-secondary/10",
];

interface ConfigProcedimento {
  ativo: boolean;
  limiteEnvios: number;
  diasEntreEnvios: number;
  mensagem: string;
  groupId?: string;
}

interface DisparoMassaHistoricoItem {
  id: number | string;
  dataRegistro: string;
  dataEnvio: string;
  previewMensagem: string;
  quantidadeEnvios: number;
  totalEnviado: number;
}

interface CampanhaConfigRow {
  chave: string;
  mensagem: string;
  ativo: boolean;
}

interface DisparoMassaHistoricoRow {
  id: string;
  created_at: string;
  status: string | null;
  quantidade_destinatarios: number | null;
  mensagem: string | null;
  data_agendada: string | null;
}

const CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX = "procedimento_" as const;
const CAMPANHA_CHAVE_ANIVERSARIO_DIA = "aniversario_dia" as const;
const CAMPANHA_CHAVE_ANIVERSARIO_MES = "aniversario_mes" as const;
const TABELA_CAMPANHAS_PROCEDIMENTO = "campanhas_procedimento" as const;

export function Campanhas() {
  const { toast } = useToast();
  const { clinica } = useClinica();

  // Disparo em massa
  const [mensagemMassa, setMensagemMassa] = useState("");
  const [historicoDisparosMassa, setHistoricoDisparosMassa] = useState<DisparoMassaHistoricoItem[]>([]);
  const [enviarMassaAgora, setEnviarMassaAgora] = useState(true);
  const [dataMassa, setDataMassa] = useState("");
  const [horaMassa, setHoraMassa] = useState("");
  const [selecaoPacientesAberta, setSelecaoPacientesAberta] = useState(false);
  const [pacientes, setPacientes] = useState<{ id: string; paciente: string | null }[]>([]);
  const [pacientesCarregando, setPacientesCarregando] = useState(false);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [filtroProcedimento, setFiltroProcedimento] = useState("");
  const [pacientesSelecionadosIds, setPacientesSelecionadosIds] = useState<string[]>([]);
  const [paginaPacientes, setPaginaPacientes] = useState(1);
  const PACIENTES_POR_PAGINA = 50;

  // Disparo por procedimento
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDb[]>([]);
  const [procedimentosCarregando, setProcedimentosCarregando] = useState(false);
  const [procedimentosSelecionadosIds, setProcedimentosSelecionadosIds] = useState<ProcedimentoId[]>([]);
  const [buscaProcedimento, setBuscaProcedimento] = useState("");
  const [configsProcedimentos, setConfigsProcedimentos] = useState<Record<ProcedimentoId, ConfigProcedimento>>({});
  const [novoProcedimentoPorGrupo, setNovoProcedimentoPorGrupo] = useState<Record<string, ProcedimentoId | "">>({});

  // Disparo de aniversário
  const [aniversarioDiaAtivo, setAniversarioDiaAtivo] = useState(true);
  const [aniversarioMesAtivo, setAniversarioMesAtivo] = useState(false);
  const [mensagemAniversarioDia, setMensagemAniversarioDia] = useState(
    "Olá {nome}, parabéns pelo seu aniversário! Desejamos muita saúde e sorrisos. Conte com a nossa clínica sempre que precisar!",
  );
  const [mensagemAniversarioMes, setMensagemAniversarioMes] = useState(
    "Olá {nome}, este mês é especial para você! Aproveite para cuidar do seu sorriso agendando uma avaliação em nossa clínica.",
  );

  const [grupoConfirmacaoExclusao, setGrupoConfirmacaoExclusao] = useState<{
    groupId: string;
    titulo: string;
  } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [tabValue, setTabValue] = useState<"massa" | "procedimento" | "aniversario">(() => {
    const tab = searchParams.get("tab");
    return tab === "procedimento" || tab === "aniversario" ? tab : "massa";
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    setTabValue(tab === "procedimento" || tab === "aniversario" ? tab : "massa");
  }, [searchParams]);

  useEffect(() => {
    if (!selecaoPacientesAberta) return;

    const carregarPacientes = async () => {
      try {
        setPacientesCarregando(true);

        let clientesQuery = (supabase as any)
          .from("clientes")
          .select("id, paciente")
          .ilike("situacao", "Ativo")
          .order("paciente", { ascending: true });

        const termoPaciente = buscaPaciente.trim();
        const termoProcedimento = filtroProcedimento.trim();

        if (termoProcedimento.length > 0) {
          const { data: procedimentosFiltrados, error: erroProc } = await (supabase as any)
            .from("procedimentos")
            .select("nome_paciente, procedimento")
            .ilike("procedimento", `%${termoProcedimento}%`);

          if (erroProc) throw erroProc;

          const nomes = Array.from(
            new Set(
              (procedimentosFiltrados ?? [])
                .map((row: any) => row.nome_paciente as string | null)
                .filter((nome): nome is string => !!nome && nome.trim().length > 0),
            ),
          );

          if (nomes.length === 0) {
            setPacientes([]);
            setPacientesCarregando(false);
            return;
          }

          clientesQuery = clientesQuery.in("paciente", nomes);
        }

        if (termoPaciente.length > 0) {
          clientesQuery = clientesQuery.ilike("paciente", `%${termoPaciente}%`);
        }

        const { data, error } = await clientesQuery;

        if (error) throw error;

        setPacientes((data ?? []) as { id: string; paciente: string | null }[]);
      } catch (erro) {
        console.error("Erro ao carregar pacientes para disparo em massa", erro);
      } finally {
        setPacientesCarregando(false);
      }
    };

    void carregarPacientes();
  }, [selecaoPacientesAberta, buscaPaciente, filtroProcedimento]);

  useEffect(() => {
    document.title = "Campanhas DentAlerta";

    const carregarProcedimentos = async () => {
      try {
        setProcedimentosCarregando(true);
        const { data, error } = await (supabase as any)
          .from("procedimentos")
          .select("*")
          .order("procedimento", { ascending: true });

        console.log("Procedimentos carregados:", { data, error });

        if (error) throw error;

        const lista = (data ?? []) as any[];

        const normalizados: ProcedimentoDb[] = lista.map((row) => ({
          id: row.id,
          procedimento: row.procedimento ?? row.nome ?? row.descricao ?? "Procedimento sem nome",
          mensagem: row.mensagem ?? null,
          tempo_disparo_minutos: row.tempo_disparo_minutos ?? null,
        }));

        // Remove procedimentos duplicados pelo nome
        const vistos = new Set<string>();
        const unicos = normalizados.filter((proc) => {
          const chave = (proc.procedimento || "").trim().toLowerCase();
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        });

        setProcedimentos(unicos);
      } catch (error) {
        console.error("Erro ao carregar procedimentos", error);
      } finally {
        setProcedimentosCarregando(false);
      }
    };
    const carregarConfiguracoes = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("campanhas_config")
          .select("chave, mensagem, ativo");

        if (error) throw error;
        const rows = (data ?? []) as CampanhaConfigRow[];
        if (rows.length === 0) return;

        setConfigsProcedimentos((prev) => {
          const novo = { ...prev } as Record<ProcedimentoId, ConfigProcedimento>;

          for (const row of rows) {
            if (row.chave.startsWith(CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX)) {
              const id = row.chave.replace(CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX, "");
              const existente = novo[id];

              novo[id] = {
                ativo: row.ativo,
                limiteEnvios: existente?.limiteEnvios ?? 2,
                diasEntreEnvios: existente?.diasEntreEnvios ?? 30,
                mensagem: row.mensagem,
                groupId: existente?.groupId ?? id,
              };
            }
          }

          return novo;
        });

        rows.forEach((row) => {
          if (row.chave === CAMPANHA_CHAVE_ANIVERSARIO_DIA) {
            setAniversarioDiaAtivo(row.ativo);
            setMensagemAniversarioDia(row.mensagem);
          }
          if (row.chave === CAMPANHA_CHAVE_ANIVERSARIO_MES) {
            setAniversarioMesAtivo(row.ativo);
            setMensagemAniversarioMes(row.mensagem);
          }
        });
      } catch (error) {
        console.error("Erro ao carregar configurações de campanhas", error);
        // Se a tabela ainda não existir ou houver problema de permissão,
        // apenas registramos no console para não exibir erro visual ao abrir a página.
      }
    };

    const carregarHistoricoMassa = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("disparos_massa_historico")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as DisparoMassaHistoricoRow[];

        const itens: DisparoMassaHistoricoItem[] = rows.map((row) => {
          const dtRegistro = new Date(row.created_at);
          const dataRegistro = dtRegistro.toLocaleDateString("pt-BR");

          const baseEnvio = row.data_agendada && row.data_agendada.trim().length > 0 ? row.data_agendada : row.created_at;
          const dtEnvio = new Date(baseEnvio);
          const dataEnvio = `${dtEnvio.toLocaleDateString("pt-BR")} ${dtEnvio.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}`;

          const qtd = row.quantidade_destinatarios ?? 0;

          return {
            id: row.id,
            dataRegistro,
            dataEnvio,
            previewMensagem:
              row.mensagem && row.mensagem.trim().length > 0
                ? row.mensagem
                : "-",
            quantidadeEnvios: qtd,
            totalEnviado: qtd,
          };
        });

        setHistoricoDisparosMassa(itens);
      } catch (error) {
        console.error("Erro ao carregar histórico de disparos em massa", error);
      }
    };

    void carregarProcedimentos();
    void carregarConfiguracoes();
    void carregarHistoricoMassa();
  }, [toast]);

  const requireMensagem = (mensagem: string) => {
    if (!mensagem.trim()) {
      toast({
        variant: "destructive",
        title: "Mensagem obrigatória",
        description: "Digite o texto da sua mensagem antes de realizar o disparo.",
      });
      return false;
    }
    return true;
  };

  const registrarDisparoMassa = async (dataAgendada: Date, mensagem: string, idsPacientes: string[]) => {
    try {
      const quantidade = idsPacientes.length;

      const { data: carteira, error: erroCarteira } = await (supabase as any)
        .from("carteira_envios")
        .select("*")
        .limit(1)
        .single();
        
      if (erroCarteira && erroCarteira.code !== 'PGRST116') throw new Error("Erro ao ler carteira");
      
      const saldoAtual = carteira?.saldo ?? 0;
      if (saldoAtual < quantidade) {
        toast({
          variant: "destructive",
          title: "Saldo Insuficiente",
          description: `Você precisa de ${quantidade} créditos na Carteira de Envios, mas possui apenas ${saldoAtual}.`,
        });
        return false;
      }

      const { data: clientes, error: erroClientes } = await (supabase as any)
        .from("clientes")
        .select("id, paciente, telefone")
        .in("id", idsPacientes);
      
      if (erroClientes) throw erroClientes;

      const insertsFila = clientes.map((c: any) => ({
        paciente_id: c.id,
        paciente_nome: c.paciente,
        telefone: c.telefone,
        mensagem: mensagem,
        data_programada: dataAgendada.toISOString(),
        status: "pendente",
        custo: 1,
        origem: "massa"
      }));

      const { error: erroFila } = await (supabase as any).from("fila_envios").insert(insertsFila);
      if (erroFila) throw erroFila;

      const { error: erroUpdate } = await (supabase as any)
        .from("carteira_envios")
        .update({ saldo: saldoAtual - quantidade })
        .eq("id", carteira.id);
        
      if (erroUpdate) throw erroUpdate;

      await (supabase as any)
        .from("disparos_massa_historico")
        .insert({
          status: "agendado",
          quantidade_destinatarios: quantidade,
          mensagem: mensagem,
          data_agendada: dataAgendada.toISOString(),
        });

      return true;
    } catch (error) {
      console.error("Erro ao registrar disparo em massa", error);
      toast({
        variant: "destructive",
        title: "Erro ao registrar disparo",
        description: "Não foi possível colocar as mensagens na fila.",
      });
      return false;
    }
  };

  const handleEnviarMassa = async () => {
    if (!requireMensagem(mensagemMassa)) return;

    const quantidadeDestinatarios = pacientesSelecionadosIds.length;

    if (quantidadeDestinatarios === 0) {
      toast({
        variant: "destructive",
        title: "Selecione os pacientes",
        description: "Escolha ao menos um paciente para receber o disparo em massa.",
      });
      return;
    }

    let dataAgendada: Date;

    if (enviarMassaAgora || !dataMassa || !horaMassa) {
      dataAgendada = new Date();
    } else {
      const combinada = new Date(`${dataMassa}T${horaMassa}:00`);
      if (Number.isNaN(combinada.getTime())) {
        toast({
          variant: "destructive",
          title: "Data ou hora inválida",
          description: "Verifique a data e a hora de agendamento do disparo.",
        });
        return;
      }
      dataAgendada = combinada;
    }

    const dataRegistro = new Date().toLocaleDateString("pt-BR");
    const dataEnvio = `${dataAgendada.toLocaleDateString("pt-BR")} ${dataAgendada.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const preview =
      mensagemMassa.length > 100 ? `${mensagemMassa.slice(0, 100).trimEnd()}…` : mensagemMassa.trim();

    const sucesso = await registrarDisparoMassa(dataAgendada, mensagemMassa.trim(), pacientesSelecionadosIds);

    if (sucesso) {
      setHistoricoDisparosMassa((prev) => [
        {
          id: Date.now(),
          dataRegistro,
          dataEnvio,
          previewMensagem: preview,
          quantidadeEnvios: quantidadeDestinatarios,
          totalEnviado: quantidadeDestinatarios,
        },
        ...prev,
      ]);

      toast({
        title: "Disparo agendado com sucesso!",
        description: `${quantidadeDestinatarios.toLocaleString("pt-BR")} mensagens foram adicionadas à Fila de Envios e o saldo foi deduzido da sua Carteira.`,
      });
    }
  };

  const salvarCampanhaConfig = async (chave: string, mensagem: string, ativo: boolean) => {
    const mensagemLimpa = mensagem.trim();

    if (mensagemLimpa.length === 0 || mensagemLimpa.length > 1000) {
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("campanhas_config")
        .upsert(
          {
            chave,
            mensagem: mensagemLimpa,
            ativo,
          },
          {
            onConflict: "chave",
          },
        );

      if (error) throw error;
    } catch (error: any) {
      console.error("Erro ao salvar configuração de campanha", error);

      const codigo = error?.code ?? error?.message ?? "";
      const tabelaInexistente = typeof codigo === "string" && codigo.includes("PGRST205");

      toast({
        variant: "destructive",
        title: tabelaInexistente ? "Tabela de campanhas não encontrada" : "Erro ao salvar campanha",
        description: tabelaInexistente
          ? "A tabela de configurações de campanhas ainda não foi criada no banco de dados. Peça ao responsável pelo sistema para criar a tabela 'campanhas_config'."
          : "Não foi possível salvar a configuração. Tente novamente.",
      });
    }
  };


  const sincronizarCampanhaGrupo = async (
    groupId: string,
    procedimentoIds: ProcedimentoId[],
    config: Pick<ConfigProcedimento, "ativo" | "limiteEnvios" | "diasEntreEnvios" | "mensagem">,
  ) => {
    try {
      if (procedimentoIds.length === 0) {
        await removerCampanhaGrupo(groupId);
        return;
      }

      const nomesProcedimentos = procedimentoIds
        .map((id) => procedimentos.find((p) => p.id === id)?.procedimento)
        .filter(Boolean) as string[];

      const { error } = await (supabase as any)
        .from(TABELA_CAMPANHAS_PROCEDIMENTO)
        .upsert(
          {
            group_id: groupId,
            ativo: config.ativo,
            limite_envios: config.limiteEnvios,
            dias_entre_envios: config.diasEntreEnvios,
            mensagem: config.mensagem,
            procedimentos_ids: procedimentoIds,
            procedimentos_nomes: nomesProcedimentos,
          },
          { onConflict: "group_id" },
        );

      if (error) throw error;
    } catch (error) {
      console.error("Erro ao sincronizar campanha por procedimento", error);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar campanha",
        description: "Não foi possível atualizar este card no banco. Tente novamente.",
      });
    }
  };
 
  const removerCampanhaGrupo = async (groupId: string) => {
    try {
      const { error } = await (supabase as any)
        .from(TABELA_CAMPANHAS_PROCEDIMENTO)
        .delete()
        .eq("group_id", groupId);
 
      if (error) {
        console.error("Erro ao remover resumo de campanha por procedimento", error);
      }
    } catch (error) {
      console.error("Erro inesperado ao remover resumo de campanha por procedimento", error);
    }
  };
 
  const updateProcedimento = (id: ProcedimentoId, partial: Partial<ConfigProcedimento>) => {
    setConfigsProcedimentos((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...partial,
      },
    }));
  };

  const removerProcedimento = async (id: ProcedimentoId) => {
    // Remove do estado (tela)
    setConfigsProcedimentos((prev) => {
      const novo = { ...prev } as Record<ProcedimentoId, ConfigProcedimento>;
      delete novo[id];
      return novo;
    });

    // Remove configuração salva para este procedimento, se existir
    try {
      const { error } = await (supabase as any)
        .from("campanhas_config")
        .delete()
        .eq("chave", `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${id}`);

      if (error) {
        console.error("Erro ao remover configuração de campanha do procedimento", error);
      }
    } catch (error) {
      console.error("Erro inesperado ao remover configuração de campanha do procedimento", error);
    }
  };

  const procedimentosEmCampanha = new Set(Object.keys(configsProcedimentos));

  const procedimentosDisponiveis = procedimentos.filter((proc) => !procedimentosEmCampanha.has(proc.id));

  const campanhasPorConfig = Object.entries(configsProcedimentos).reduce(
    (acc, [id, config]) => {
      const groupId = config.groupId ?? id;

      if (!acc[groupId]) {
        acc[groupId] = {
          config,
          procedimentoIds: [],
        };
      }

      acc[groupId].procedimentoIds.push(id as ProcedimentoId);

      return acc;
    },
    {} as Record<string, { config: ConfigProcedimento; procedimentoIds: ProcedimentoId[] }>,
  );

  const totalPaginasPacientes = useMemo(
    () => Math.max(1, Math.ceil(pacientes.length / PACIENTES_POR_PAGINA)),
    [pacientes.length],
  );

  const paginasPaginadasPacientes = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];

    if (totalPaginasPacientes <= 5) {
      for (let i = 1; i <= totalPaginasPacientes; i++) {
        pages.push(i);
      }
      return pages;
    }

    const primeiraPagina = 1;
    const ultimaPagina = totalPaginasPacientes;
    const paginaAtual = paginaPacientes;

    pages.push(primeiraPagina);

    const inicio = Math.max(2, paginaAtual - 1);
    const fim = Math.min(ultimaPagina - 1, paginaAtual + 1);

    if (inicio > 2) pages.push("ellipsis");

    for (let i = inicio; i <= fim; i++) {
      pages.push(i);
    }

    if (fim < ultimaPagina - 1) pages.push("ellipsis");

    pages.push(ultimaPagina);

    return pages;
  }, [totalPaginasPacientes, paginaPacientes]);

  return (
    <AppLayout>
      <section className="space-y-5 rounded-xl bg-gradient-to-b from-primary/5 via-background to-secondary/5 p-4 shadow-sm" aria-label="Campanhas de comunicação">
        <AlertDialog
          open={!!grupoConfirmacaoExclusao}
          onOpenChange={(open) => {
            if (!open) setGrupoConfirmacaoExclusao(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a excluir o card{grupoConfirmacaoExclusao?.titulo ? ` “${grupoConfirmacaoExclusao.titulo}”` : ""}.
                Isso remove as configurações e apaga o registro no banco de dados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const alvo = grupoConfirmacaoExclusao;
                  if (!alvo) return;

                  const grupoAtual = campanhasPorConfig[alvo.groupId];
                  const ids = grupoAtual?.procedimentoIds ?? [];

                  try {
                    await Promise.all(ids.map((id) => removerProcedimento(id)));
                    await removerCampanhaGrupo(alvo.groupId);

                    setNovoProcedimentoPorGrupo((prev) => {
                      if (!(alvo.groupId in prev)) return prev;
                      const next = { ...prev };
                      delete next[alvo.groupId];
                      return next;
                    });

                    setGrupoConfirmacaoExclusao(null);

                    toast({
                      title: "Campanha removida",
                      description: "O box foi removido e o registro foi apagado do banco.",
                    });
                  } catch (error) {
                    console.error("Erro ao remover campanha (grupo)", error);
                    toast({
                      variant: "destructive",
                      title: "Erro ao remover campanha",
                      description: "Não foi possível apagar o registro no banco. Tente novamente.",
                    });
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs
          value={tabValue}
          onValueChange={(value) => {
            setTabValue(value as "massa" | "procedimento" | "aniversario");
            setSearchParams({ tab: value });
          }}
          className="w-full"
        >
          <TabsList className="mb-3 flex w-full justify-start gap-2 rounded-lg bg-card/80 p-1 shadow-sm">
            <TabsTrigger value="massa">Disparo em massa</TabsTrigger>
            <TabsTrigger value="procedimento">Disparo por procedimento</TabsTrigger>
            <TabsTrigger value="aniversario">Disparo de aniversário</TabsTrigger>
          </TabsList>

          <TabsContent value="massa" className="mt-0">
            {/* Disparo em massa */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Disparo em massa</CardTitle>
                <CardDescription>
                  Envie uma mensagem personalizada para toda a base de clientes em poucos cliques.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Destinatários */}
                <div className="space-y-2 rounded-md border bg-card/60 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">Destinatários</p>
                      <p className="text-[11px] text-muted-foreground">
                        Selecione os pacientes que devem receber esta mensagem em massa.
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <p className="text-[11px] text-muted-foreground">
                        Contatos selecionados: {pacientesSelecionadosIds.length.toLocaleString("pt-BR")}
                      </p>
                      <Dialog open={selecaoPacientesAberta} onOpenChange={setSelecaoPacientesAberta}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            setSelecaoPacientesAberta(true);
                            setPaginaPacientes(1);
                          }}
                        >
                          Selecionar pacientes
                        </Button>
                        <DialogContent className="max-h-[70vh] w-full max-w-3xl overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Selecionar pacientes</DialogTitle>
                            <DialogDescription>
                              Use os filtros abaixo para localizar os pacientes que receberão o disparo em massa.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor="busca-paciente">Buscar paciente</Label>
                                <Input
                                  id="busca-paciente"
                                  placeholder="Digite o nome do paciente..."
                                  value={buscaPaciente}
                                  onChange={(event) => {
                                    setPaginaPacientes(1);
                                    setBuscaPaciente(event.target.value);
                                  }}
                                  className="h-8 text-xs"
                                />
                                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>Filtre pelos nomes dos pacientes.</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() => {
                                      setPacientesSelecionadosIds((prev) => {
                                        const idsTodos = pacientes.map((p) => p.id);
                                        const jaTodosSelecionados =
                                          idsTodos.length > 0 && idsTodos.every((id) => prev.includes(id));

                                        if (jaTodosSelecionados) {
                                          return prev.filter((id) => !idsTodos.includes(id));
                                        }

                                        return Array.from(new Set([...prev, ...idsTodos]));
                                      });
                                    }}
                                  >
                                    {pacientes.length > 0 &&
                                    pacientes.every((p) => pacientesSelecionadosIds.includes(p.id))
                                      ? "Limpar seleção"
                                      : "Selecionar todos"}
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="filtro-procedimento">Filtrar por procedimento</Label>
                                <Input
                                  id="filtro-procedimento"
                                  placeholder="Digite parte do nome do procedimento..."
                                  value={filtroProcedimento}
                                  onChange={(event) => {
                                    setPaginaPacientes(1);
                                    setFiltroProcedimento(event.target.value);
                                  }}
                                  className="h-8 text-xs"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  Busca pacientes que tenham procedimentos contendo esse texto.
                                </p>
                              </div>
                            </div>

                            <div className="flex-1 overflow-hidden rounded-md border bg-card">
                              {pacientesCarregando ? (
                                <p className="p-4 text-xs text-muted-foreground">Carregando pacientes…</p>
                              ) : pacientes.length === 0 ? (
                                <p className="p-4 text-xs text-muted-foreground">
                                  Nenhum paciente encontrado com os filtros atuais.
                                </p>
                              ) : (
                                <div className="flex max-h-[300px] flex-col">
                                  <div className="flex-1 overflow-y-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-10"></TableHead>
                                          <TableHead>Paciente</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {pacientes
                                          .slice(
                                            (paginaPacientes - 1) * PACIENTES_POR_PAGINA,
                                            paginaPacientes * PACIENTES_POR_PAGINA,
                                          )
                                          .map((paciente) => {
                                            const selecionado = pacientesSelecionadosIds.includes(paciente.id);
                                            return (
                                              <TableRow key={paciente.id} className="cursor-pointer">
                                                <TableCell className="w-10">
                                                  <Checkbox
                                                    checked={selecionado}
                                                    onCheckedChange={(checked) => {
                                                      setPacientesSelecionadosIds((prev) => {
                                                        if (checked) {
                                                          return prev.includes(paciente.id)
                                                            ? prev
                                                            : [...prev, paciente.id];
                                                        }
                                                        return prev.filter((id) => id !== paciente.id);
                                                      });
                                                    }}
                                                    aria-label={`Selecionar paciente ${paciente.paciente ?? "sem nome"}`}
                                                  />
                                                </TableCell>
                                                <TableCell>{paciente.paciente ?? "Paciente sem nome"}</TableCell>
                                              </TableRow>
                                            );
                                          })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                  {pacientes.length > PACIENTES_POR_PAGINA && (
                                    <div className="border-t p-2 text-[11px] text-muted-foreground">
                                      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
                                        <span>
                                          Mostrando
                                          {" "}
                                          {pacientes.length === 0
                                            ? 0
                                            : (paginaPacientes - 1) * PACIENTES_POR_PAGINA + 1}
                                          –
                                          {Math.min(
                                            paginaPacientes * PACIENTES_POR_PAGINA,
                                            pacientes.length,
                                          )}
                                          {" "}
                                          de {pacientes.length}
                                        </span>
                                        <Pagination className="w-full justify-center sm:w-auto">
                                          <PaginationContent>
                                            <PaginationItem>
                                              <PaginationPrevious
                                                href="#"
                                                onClick={(event) => {
                                                  event.preventDefault();
                                                  setPaginaPacientes((prev) => Math.max(1, prev - 1));
                                                }}
                                                aria-disabled={paginaPacientes === 1}
                                                className={
                                                  paginaPacientes === 1
                                                    ? "pointer-events-none opacity-50"
                                                    : ""
                                                }
                                              />
                                            </PaginationItem>
                                            {paginasPaginadasPacientes.map((page, index) =>
                                              page === "ellipsis" ? (
                                                <PaginationItem key={`ellipsis-${index}`}>
                                                  <PaginationEllipsis />
                                                </PaginationItem>
                                              ) : (
                                                <PaginationItem key={page}>
                                                  <PaginationLink
                                                    href="#"
                                                    isActive={page === paginaPacientes}
                                                    onClick={(event) => {
                                                      event.preventDefault();
                                                      setPaginaPacientes(page);
                                                    }}
                                                  >
                                                    {page}
                                                  </PaginationLink>
                                                </PaginationItem>
                                              ),
                                            )}
                                            <PaginationItem>
                                              <PaginationNext
                                                href="#"
                                                onClick={(event) => {
                                                  event.preventDefault();
                                                  setPaginaPacientes((prev) => Math.min(totalPaginasPacientes, prev + 1));
                                                }}
                                                aria-disabled={paginaPacientes === totalPaginasPacientes}
                                                className={
                                                  paginaPacientes === totalPaginasPacientes
                                                    ? "pointer-events-none opacity-50"
                                                    : ""
                                                }
                                              />
                                            </PaginationItem>
                                          </PaginationContent>
                                        </Pagination>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <DialogFooter className="mt-2 flex flex-col items-end gap-2 sm:flex-row sm:justify-between">
                            <p className="text-[11px] text-muted-foreground">
                              Total de pacientes selecionados: {" "}
                              <span className="font-semibold">
                                {pacientesSelecionadosIds.length.toLocaleString("pt-BR")} contato(s)
                              </span>
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setPacientesSelecionadosIds([]);
                                }}
                              >
                                Limpar seleção
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setSelecaoPacientesAberta(false)}
                              >
                                Concluir seleção
                              </Button>
                            </div>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border bg-card/60 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">Agendamento do disparo</p>
                      <p className="text-[11px] text-muted-foreground">
                        Escolha se deseja enviar agora ou programar para uma data e horário específicos.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {enviarMassaAgora ? "Enviar agora" : "Agendar envio"}
                      </span>
                      <Switch
                        checked={enviarMassaAgora}
                        onCheckedChange={(checked) => setEnviarMassaAgora(checked)}
                        aria-label="Definir envio do disparo em massa para agora"
                      />
                    </div>
                  </div>

                  {!enviarMassaAgora && (
                    <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="data-massa">Data</Label>
                        <Input
                          id="data-massa"
                          type="date"
                          value={dataMassa}
                          onChange={(event) => setDataMassa(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="hora-massa">Hora</Label>
                        <Input
                          id="hora-massa"
                          type="time"
                          value={horaMassa}
                          onChange={(event) => setHoraMassa(event.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mensagem-massa">Mensagem</Label>
                  <Textarea
                    id="mensagem-massa"
                    rows={5}
                    placeholder="Olá {{nome}}, estamos com condições especiais para sua próxima consulta…"
                    value={mensagemMassa}
                    onChange={(event) => setMensagemMassa(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {"Use {{nome}}, {{procedimento}} e {{data_procedimento}} para personalizar automaticamente a mensagem."}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{mensagemMassa.length} caracteres</p>
                </div>

                <Button type="button" size="sm" onClick={handleEnviarMassa} className="w-full">
                  Enviar
                </Button>

                {historicoDisparosMassa.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-foreground">Últimos disparos</p>
                    <div className="space-y-1 rounded-md bg-card p-2 text-xs">
                      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b pb-1 text-[11px] text-muted-foreground">
                        <span>Data de envio</span>
                        <span>Mensagem</span>
                        <span className="text-right">Qtd. envios</span>
                        <span className="text-right">Total enviados</span>
                      </div>
                      {historicoDisparosMassa.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 py-1"
                        >
                          <span>{item.dataEnvio}</span>
                          <span className="truncate" title={item.previewMensagem}>
                            {item.previewMensagem}
                          </span>
                          <span className="text-right">{item.quantidadeEnvios.toLocaleString("pt-BR")}</span>
                          <span className="text-right">{item.totalEnviado.toLocaleString("pt-BR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="procedimento" className="mt-0">
            {/* Disparo por procedimento */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Disparo por procedimento</CardTitle>
                <CardDescription>
                  Configure lembretes automáticos por tipo de procedimento para acompanhar o tratamento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ative os procedimentos desejados, defina o intervalo em dias e personalize a mensagem padrão de WhatsApp.
                </p>

                <div className="space-y-3">
                  <div className="space-y-2 rounded-md border bg-card p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="procedimento-select">Adicionar procedimentos</Label>

                        <div className="space-y-1">
                          <Input
                            id="busca-procedimento"
                            type="text"
                            placeholder="Buscar procedimento pelo nome"
                            value={buscaProcedimento}
                            onChange={(event) => setBuscaProcedimento(event.target.value)}
                            className="h-8 text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Digite parte do nome para filtrar a lista de procedimentos.
                          </p>
                        </div>

                        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-md border bg-background p-2 text-xs">
                          {procedimentosCarregando ? (
                            <p className="text-[11px] text-muted-foreground">Carregando procedimentos...</p>
                          ) : procedimentos.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Nenhum procedimento importado ainda.</p>
                          ) : (
                            procedimentos
                              .filter((proc) => !configsProcedimentos[proc.id])
                              .filter((proc) =>
                                buscaProcedimento.trim().length === 0
                                  ? true
                                  : proc.procedimento
                                      .toLowerCase()
                                      .includes(buscaProcedimento.trim().toLowerCase()),
                              )
                              .map((proc) => {
                                const checked = procedimentosSelecionadosIds.includes(proc.id);
                                return (
                                  <label
                                    key={proc.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(novoValor) => {
                                        setProcedimentosSelecionadosIds((prev) => {
                                          if (novoValor) {
                                            return prev.includes(proc.id) ? prev : [...prev, proc.id];
                                          }
                                          return prev.filter((id) => id !== proc.id);
                                        });
                                      }}
                                    />
                                    <span className="truncate text-xs text-foreground">{proc.procedimento}</span>
                                  </label>
                                );
                              })
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Marque os procedimentos que usarão a mesma lógica de campanha.
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        className="mt-2 w-full sm:mt-0 sm:w-auto"
                        onClick={async () => {
                          if (!procedimentosSelecionadosIds || procedimentosSelecionadosIds.length === 0) {
                            toast({
                              variant: "destructive",
                              title: "Selecione ao menos um procedimento",
                              description: "Escolha um ou mais procedimentos importados para criar a campanha.",
                            });
                            return;
                          }

                          const limiteProcedimentos = clinica?.limite_procedimentos || 5;
                          const campanhasAtuais = Object.keys(campanhasPorConfig).length;
                          
                          if (campanhasAtuais >= limiteProcedimentos) {
                            toast({
                              variant: "destructive",
                              title: "Limite do plano atingido",
                              description: `Seu plano ${clinica?.plano.toUpperCase() || 'atual'} permite criar até ${limiteProcedimentos} campanhas de procedimento. Fale com o suporte para fazer um upgrade.`,
                            });
                            return;
                          }

                          const novoGrupoId =
                            (crypto as Crypto | undefined)?.randomUUID?.() ??
                            `grupo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                          const configsParaAdicionar: Record<ProcedimentoId, ConfigProcedimento> = {};
                          const idsAdicionados: ProcedimentoId[] = [];

                          procedimentosSelecionadosIds.forEach((procId) => {
                            if (configsProcedimentos[procId]) return;
                            const proc = procedimentos.find((p) => p.id === procId);
                            if (!proc) return;

                            const diasEntreEnvios = proc.tempo_disparo_minutos
                              ? Math.max(1, Math.round(proc.tempo_disparo_minutos / (60 * 24)))
                              : 30;

                            const mensagemBase =
                              proc.mensagem ??
                              "Olá {nome}, estamos acompanhando seu tratamento. Responda esta mensagem para agendarmos sua próxima consulta.";

                            configsParaAdicionar[procId] = {
                              ativo: true,
                              limiteEnvios: 2,
                              diasEntreEnvios,
                              mensagem: mensagemBase,
                              groupId: novoGrupoId,
                            };

                            idsAdicionados.push(procId);
                          });

                          if (idsAdicionados.length === 0) {
                            toast({
                              variant: "destructive",
                              title: "Nenhuma campanha nova",
                              description: "Os procedimentos selecionados já estão em campanhas.",
                            });
                            return;
                          }

                          setConfigsProcedimentos((prev) => ({
                            ...prev,
                            ...configsParaAdicionar,
                          }));

                          // Salva automaticamente (sem botão)
                          await Promise.all(
                            idsAdicionados.map((id) =>
                              salvarCampanhaConfig(
                                `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${id}`,
                                configsParaAdicionar[id].mensagem,
                                configsParaAdicionar[id].ativo,
                              ),
                            ),
                          );

                          const configDoGrupo = configsParaAdicionar[idsAdicionados[0]];
                          await sincronizarCampanhaGrupo(novoGrupoId, idsAdicionados, configDoGrupo);

                          toast({
                            title: "Campanhas criadas",
                            description: "As campanhas por procedimento já foram enviadas para o banco de dados.",
                          });
                        }}
                        disabled={procedimentosCarregando || procedimentos.length === 0}
                      >
                        Criar campanhas
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Os procedimentos são importados a partir dos arquivos da sua operadora. Cada código de procedimento pode ter sua própria
                      campanha.
                    </p>
                  </div>

                  {Object.keys(campanhasPorConfig).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum procedimento configurado ainda. Use o seletor acima para criar campanhas para os procedimentos importados.
                    </p>
                  )}

                  {Object.entries(campanhasPorConfig).map(([chaveGrupo, grupo], index) => {
                    const bgClass = PROCEDIMENTO_BG_CLASSES[index % PROCEDIMENTO_BG_CLASSES.length];
                    const nomesProcedimentos = grupo.procedimentoIds
                      .map((id) => procedimentos.find((p) => p.id === id)?.procedimento)
                      .filter(Boolean) as string[];
                    const disponiveisParaAdicionar = procedimentosDisponiveis;

                    return (
                      <div
                        key={chaveGrupo}
                        className={`space-y-3 rounded-md border bg-card p-3 shadow-sm md:p-4 ${bgClass}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {nomesProcedimentos.length > 0 ? nomesProcedimentos.join(", ") : "Procedimentos"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Esta campanha será aplicada para todos os procedimentos listados acima.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {grupo.config.ativo ? "Ativo" : "Inativo"}
                            </span>
                             <Switch
                               checked={grupo.config.ativo}
                               onCheckedChange={async (checked) => {
                                 const configAtualizada = {
                                   ...grupo.config,
                                   ativo: checked,
                                 };

                                 grupo.procedimentoIds.forEach((id) => {
                                   updateProcedimento(id, { ativo: checked });
                                   void salvarCampanhaConfig(
                                     `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${id}`,
                                     configAtualizada.mensagem,
                                     checked,
                                   );
                                 });

                                 await sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, configAtualizada);
                               }}
                               aria-label="Ativar ou desativar lembretes para os procedimentos desta campanha"
                             />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                               onClick={() => {
                                 setGrupoConfirmacaoExclusao({
                                   groupId: chaveGrupo,
                                   titulo:
                                     nomesProcedimentos.length > 0
                                       ? nomesProcedimentos.join(", ")
                                       : "Campanha por procedimento",
                                 });
                               }}
                              aria-label="Remover todos os procedimentos desta campanha"
                            >
                             ×
                           </Button>
                          </div>
                        </div>

                        {grupo.procedimentoIds.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-foreground">Procedimentos desta campanha</p>
                            <div className="flex flex-wrap gap-2">
                              {grupo.procedimentoIds.map((idProcedimento) => {
                                const procedimento = procedimentos.find((p) => p.id === idProcedimento);
                                if (!procedimento) return null;
                                return (
                                  <button
                                    key={idProcedimento}
                                    type="button"
                                     onClick={() => {
                                       const idsAtualizados = grupo.procedimentoIds.filter((pid) => pid !== idProcedimento);
                                       void removerProcedimento(idProcedimento).then(() => {
                                         void sincronizarCampanhaGrupo(chaveGrupo, idsAtualizados, grupo.config);
                                       });
                                     }}
                                    className="group inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] shadow-sm hover:border-destructive hover:bg-destructive/5"
                                    aria-label={`Remover procedimento ${procedimento.procedimento}`}
                                  >
                                    <span className="max-w-[180px] truncate text-foreground">
                                      {procedimento.procedimento}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground group-hover:text-destructive">
                                      ×
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Clique no "x" para remover apenas um procedimento sem apagar toda a campanha.
                            </p>
                          </div>
                        )}

                        {disponiveisParaAdicionar.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-foreground">
                              Adicionar procedimento a esta campanha
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs sm:w-64"
                                value={novoProcedimentoPorGrupo[chaveGrupo] ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value as ProcedimentoId | "";
                                  setNovoProcedimentoPorGrupo((prev) => ({
                                    ...prev,
                                    [chaveGrupo]: value,
                                  }));
                                }}
                              >
                                <option value="">Selecione um procedimento</option>
                                {disponiveisParaAdicionar.map((proc) => (
                                  <option key={proc.id} value={proc.id}>
                                    {proc.procedimento}
                                  </option>
                                ))}
                              </select>

                              <Button
                                type="button"
                                size="sm"
                                className="w-full sm:w-auto"
                                 onClick={() => {
                                   const selecionado = novoProcedimentoPorGrupo[chaveGrupo];

                                   if (!selecionado) {
                                     toast({
                                       variant: "destructive",
                                       title: "Selecione um procedimento",
                                       description: "Escolha um procedimento para adicionar a esta campanha.",
                                     });
                                     return;
                                   }

                                   if (configsProcedimentos[selecionado]) {
                                     setNovoProcedimentoPorGrupo((prev) => ({
                                       ...prev,
                                       [chaveGrupo]: "",
                                     }));
                                     return;
                                   }

                                   const idsAtualizados = [...grupo.procedimentoIds, selecionado];

                                   setConfigsProcedimentos((prev) => {
                                     if (prev[selecionado]) return prev;

                                     return {
                                       ...prev,
                                       [selecionado]: {
                                         ativo: grupo.config.ativo,
                                         limiteEnvios: grupo.config.limiteEnvios,
                                         diasEntreEnvios: grupo.config.diasEntreEnvios,
                                         mensagem: grupo.config.mensagem,
                                         groupId: grupo.config.groupId ?? chaveGrupo,
                                       },
                                     };
                                   });

                                   void salvarCampanhaConfig(
                                     `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${selecionado}`,
                                     grupo.config.mensagem,
                                     grupo.config.ativo,
                                   );

                                   void sincronizarCampanhaGrupo(chaveGrupo, idsAtualizados, grupo.config);

                                   setNovoProcedimentoPorGrupo((prev) => ({
                                     ...prev,
                                     [chaveGrupo]: "",
                                   }));

                                   toast({
                                     title: "Procedimento adicionado",
                                     description: "O procedimento foi incluído nesta campanha.",
                                   });
                                 }}
                              >
                                Adicionar
                              </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              O procedimento adicionado usará a mesma configuração de dias e mensagem desta campanha.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Não há mais procedimentos disponíveis para adicionar nesta campanha.
                          </p>
                        )}

                        {grupo.config.ativo && (
                          <>
                            <div className="space-y-1">
                              <Label>Tempo de envio</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  value={grupo.config.diasEntreEnvios}
                                 onChange={(event) => {
                                     const novoValor = Number(event.target.value) || 0;
                                     const configAtualizada = {
                                       ...grupo.config,
                                       diasEntreEnvios: novoValor,
                                     };

                                     grupo.procedimentoIds.forEach((idProcedimento) => {
                                       updateProcedimento(idProcedimento, {
                                         diasEntreEnvios: novoValor,
                                       });
                                       void salvarCampanhaConfig(
                                         `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${idProcedimento}`,
                                         configAtualizada.mensagem,
                                         configAtualizada.ativo,
                                       );
                                     });

                                     void sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, configAtualizada);
                                   }}
                                />
                                <span className="text-xs text-muted-foreground">dias</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Informe em dias (ex: 30, 120, 365) após a data do procedimento.
                              </p>
                            </div>

                            <div className="space-y-1">
                              <Label>Mensagem para o cliente</Label>
                              <Textarea
                                rows={3}
                                value={grupo.config.mensagem}
                                onChange={(event) => {
                                  const novaMensagem = event.target.value;
                                  const configAtualizada = {
                                    ...grupo.config,
                                    mensagem: novaMensagem,
                                  };

                                  grupo.procedimentoIds.forEach((idProcedimento) => {
                                    updateProcedimento(idProcedimento, {
                                      mensagem: novaMensagem,
                                    });
                                    void salvarCampanhaConfig(
                                      `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${idProcedimento}`,
                                      novaMensagem,
                                      configAtualizada.ativo,
                                    );
                                  });

                                  void sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, configAtualizada);
                                }}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                {"Use {{nome}}, {{procedimento}} e {{data_procedimento}} para personalizar automaticamente a mensagem."}
                              </p>
                            </div>
                          </>
                        )}

                      </div>
                    );
                  })}

                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="aniversario" className="mt-0">
            {/* Disparo de aniversário */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Disparo de aniversário</CardTitle>
                <CardDescription>
                  Configure mensagens automáticas para o dia e para o mês de aniversário dos pacientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {/* Mensagem no dia do aniversário */}
                  <div className="space-y-2 rounded-md border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Mensagem no dia do aniversário</p>
                        <p className="text-[11px] text-muted-foreground">
                          Envie automaticamente uma mensagem no dia exato do aniversário do paciente.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {aniversarioDiaAtivo ? "Ativo" : "Inativo"}
                        </span>
                        <Switch
                          checked={aniversarioDiaAtivo}
                          onCheckedChange={setAniversarioDiaAtivo}
                          aria-label="Ativar mensagem no dia do aniversário"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mensagem-aniversario-dia">Mensagem</Label>
                      <Textarea
                        id="mensagem-aniversario-dia"
                        rows={3}
                        value={mensagemAniversarioDia}
                        onChange={(event) => setMensagemAniversarioDia(event.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">{"Use {{nome}} na mensagem para inserir automaticamente o nome do paciente."}</p>
                    </div>
                  </div>

                  {/* Mensagem no mês de aniversário */}
                  <div className="space-y-2 rounded-md border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Mensagem no mês de aniversário</p>
                        <p className="text-[11px] text-muted-foreground">
                          Envie uma mensagem durante o mês de aniversário, por exemplo para campanhas promocionais.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {aniversarioMesAtivo ? "Ativo" : "Inativo"}
                        </span>
                        <Switch
                          checked={aniversarioMesAtivo}
                          onCheckedChange={setAniversarioMesAtivo}
                          aria-label="Ativar mensagem no mês de aniversário"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mensagem-aniversario-mes">Mensagem</Label>
                      <Textarea
                        id="mensagem-aniversario-mes"
                        rows={3}
                        value={mensagemAniversarioMes}
                        onChange={(event) => setMensagemAniversarioMes(event.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">{"Use {{nome}} na mensagem para inserir automaticamente o nome do paciente."}</p>
                    </div>
                  </div>
                </div>

                {/* Lista de aniversariantes do mês (simulação) */}
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-foreground">Aniversariantes do mês (simulação)</p>
                  <div className="space-y-1 rounded-md bg-card p-2 text-xs">
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-2 border-b pb-1 text-[11px] text-muted-foreground">
                      <span>Nome</span>
                      <span>Data</span>
                      <span>Telefone</span>
                      <span className="text-right">Status</span>
                    </div>
                    {aniversariantesFake.map((paciente) => (
                      <div
                        key={`${paciente.nome}-${paciente.data}`}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-2 py-1"
                      >
                        <span>{paciente.nome}</span>
                        <span>{paciente.data}</span>
                        <span>{paciente.telefone}</span>
                        <span className="text-right">
                          {paciente.alertado ? "Já alertado" : "Não alertado"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </AppLayout>
  );
}

export default Campanhas;
