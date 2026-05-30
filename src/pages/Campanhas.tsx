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
import { Badge } from "@/components/ui/badge";
import { Cake, Zap, Loader2, Plus } from "lucide-react";
import { gravarLogAuditoria } from "@/utils/auditoria";

type ProcedimentoId = string;

interface ProcedimentoDb {
  id: ProcedimentoId;
  procedimento: string;
  mensagem: string | null;
  tempo_disparo_minutos: number | null;
  clinica_id?: string;
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
  clinicaId?: string;
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
  const { clinica, loading, isSuperAdmin, isImpersonating } = useClinica();

  // Disparo Geral
  const [mensagemMassa, setMensagemMassa] = useState("");
  const [enviandoMassa, setEnviandoMassa] = useState(false);
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

  // Disparo Geral — modo procedimento
  const [modoSelecao, setModoSelecao] = useState<"paciente" | "procedimento">("paciente");
  const [procsSelecionadosGeral, setProcsSelecionadosGeral] = useState<string[]>([]);
  const [buscaProcGeral, setBuscaProcGeral] = useState("");
  const [dataInicioGeral, setDataInicioGeral] = useState("");
  const [dataFimGeral, setDataFimGeral] = useState("");
  const [buscandoPacientesProc, setBuscandoPacientesProc] = useState(false);
  const [resumoLote, setResumoLote] = useState<{ total: number; nomes: string[] } | null>(null);

  // Disparo por procedimento
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDb[]>([]);
  const [procedimentosCarregando, setProcedimentosCarregando] = useState(false);
  const [procedimentosSelecionadosIds, setProcedimentosSelecionadosIds] = useState<ProcedimentoId[]>([]);
  const [buscaProcedimento, setBuscaProcedimento] = useState("");
  const [configsProcedimentos, setConfigsProcedimentos] = useState<Record<ProcedimentoId, ConfigProcedimento>>({});
  const [novoProcedimentoPorGrupo, setNovoProcedimentoPorGrupo] = useState<Record<string, ProcedimentoId | "">>({});
  const [addProcAberto, setAddProcAberto] = useState<Record<string, boolean>>({});
  const [forcandoFila, setForcandoFila] = useState<Record<string, boolean>>({});

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

  // Aniversariantes reais do mês
  const [aniversariantesMes, setAniversariantesMes] = useState<
    { id: string; nome: string; data: string; telefone: string; dia: number }[]
  >([]);
  const [aniversariantesCarregando, setAniversariantesCarregando] = useState(false);

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
    if (loading) return;

    const carregarPacientes = async () => {
      try {
        setPacientesCarregando(true);

        let clientesQuery = (supabase as any)
          .from("clientes")
          .select("id, paciente")
          .ilike("situacao", "Ativo")
          .not("telefone", "is", null)
          .order("paciente", { ascending: true });

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            clientesQuery = clientesQuery.eq("clinica_id", clinica.id);
          } else {
            setPacientes([]);
            setPacientesCarregando(false);
            return;
          }
        }

        const termoPaciente = buscaPaciente.trim();
        const termoProcedimento = filtroProcedimento.trim();

        if (termoProcedimento.length > 0) {
          let procQuery = (supabase as any)
            .from("procedimentos")
            .select("nome_paciente, procedimento")
            .ilike("procedimento", `%${termoProcedimento}%`);

          if (!isSuperAdmin || isImpersonating) {
            if (clinica?.id) {
              procQuery = procQuery.eq("clinica_id", clinica.id);
            } else {
              setPacientes([]);
              setPacientesCarregando(false);
              return;
            }
          }

          const { data: procedimentosFiltrados, error: erroProc } = await procQuery;

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
  }, [selecaoPacientesAberta, buscaPaciente, filtroProcedimento, loading, clinica?.id, isSuperAdmin, isImpersonating]);

  useEffect(() => {
    if (loading) return;
    document.title = "Campanhas DentOS";

    const carregarProcedimentos = async () => {
      try {
        setProcedimentosCarregando(true);
        let procQuery = (supabase as any)
          .from("procedimentos")
          .select("*");

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            procQuery = procQuery.eq("clinica_id", clinica.id);
          } else {
            setProcedimentos([]);
            setProcedimentosCarregando(false);
            return;
          }
        }

        const { data, error } = await procQuery.order("procedimento", { ascending: true });

        console.log("Procedimentos carregados:", { data, error });

        if (error) throw error;

        const lista = (data ?? []) as any[];

        const normalizados: ProcedimentoDb[] = lista.map((row) => ({
          id: row.id,
          procedimento: row.procedimento ?? row.nome ?? row.descricao ?? "Procedimento sem nome",
          mensagem: row.mensagem ?? null,
          tempo_disparo_minutos: row.tempo_disparo_minutos ?? null,
          clinica_id: row.clinica_id,
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
        // ─── 1. Carregar campanhas de procedimento agrupadas ───
        let procCampQuery = (supabase as any)
          .from(TABELA_CAMPANHAS_PROCEDIMENTO)
          .select("group_id, ativo, limite_envios, dias_entre_envios, mensagem, procedimentos_ids, clinica_id");

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            procCampQuery = procCampQuery.eq("clinica_id", clinica.id);
          } else {
            return;
          }
        }

        const { data: campanhasProc, error: erroCampProc } = await procCampQuery;

        if (erroCampProc) {
          console.error("Erro ao carregar campanhas_procedimento:", erroCampProc);
        }

        if (campanhasProc && campanhasProc.length > 0) {
          setConfigsProcedimentos(() => {
            const novo = {} as Record<ProcedimentoId, ConfigProcedimento>;

            for (const camp of campanhasProc) {
              const groupId: string = camp.group_id;
              const ids: string[] = camp.procedimentos_ids ?? [];
              const config: ConfigProcedimento = {
                ativo: camp.ativo ?? true,
                limiteEnvios: camp.limite_envios ?? 2,
                diasEntreEnvios: camp.dias_entre_envios ?? 30,
                mensagem: camp.mensagem ?? "",
                groupId,
                clinicaId: camp.clinica_id,
              };

              // Atribui o mesmo config (com o mesmo groupId) para cada procedimento do grupo
              for (const id of ids) {
                novo[id] = { ...config };
              }
            }

            return novo;
          });
        }

        // ─── 2. Carregar configs de aniversário ───
        let configQuery = (supabase as any)
          .from("campanhas_config")
          .select("chave, mensagem, ativo")
          .in("chave", [CAMPANHA_CHAVE_ANIVERSARIO_DIA, CAMPANHA_CHAVE_ANIVERSARIO_MES]);

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            configQuery = configQuery.eq("clinica_id", clinica.id);
          }
        }

        const { data: configRows, error: erroConfig } = await configQuery;

        if (erroConfig) {
          console.error("Erro ao carregar campanhas_config:", erroConfig);
        }

        if (configRows) {
          for (const row of configRows as CampanhaConfigRow[]) {
            if (row.chave === CAMPANHA_CHAVE_ANIVERSARIO_DIA) {
              setAniversarioDiaAtivo(row.ativo);
              setMensagemAniversarioDia(row.mensagem);
            }
            if (row.chave === CAMPANHA_CHAVE_ANIVERSARIO_MES) {
              setAniversarioMesAtivo(row.ativo);
              setMensagemAniversarioMes(row.mensagem);
            }
          }
        }
      } catch (error) {
        console.error("Erro ao carregar configurações de campanhas", error);
      }
    };

    const carregarHistoricoMassa = async () => {
      try {
        let massQuery = (supabase as any)
          .from("disparos_massa_historico")
          .select("*");

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            massQuery = massQuery.eq("clinica_id", clinica.id);
          } else {
            setHistoricoDisparosMassa([]);
            return;
          }
        }

        const { data, error } = await massQuery.order("created_at", { ascending: false });

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
  }, [toast, loading, clinica?.id, isSuperAdmin, isImpersonating]);

  // Carregar aniversariantes reais do mês atual
  useEffect(() => {
    if (loading) return;
    const carregarAniversariantes = async () => {
      try {
        setAniversariantesCarregando(true);
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1; // 1-12

        let query = (supabase as any)
          .from("clientes")
          .select("id, paciente, telefone, nascimento")
          .ilike("situacao", "Ativo")
          .not("nascimento", "is", null)
          .not("telefone", "is", null);

        if (!isSuperAdmin || isImpersonating) {
          if (clinica?.id) {
            query = query.eq("clinica_id", clinica.id);
          } else {
            setAniversariantesMes([]);
            setAniversariantesCarregando(false);
            return;
          }
        }

        const { data, error } = await query;
        if (error) throw error;

        const aniversariantes = ((data ?? []) as any[])
          .filter((c: any) => {
            if (!c.nascimento) return false;
            const nasc = new Date(c.nascimento + "T00:00:00");
            return nasc.getMonth() + 1 === mesAtual;
          })
          .map((c: any) => {
            const nasc = new Date(c.nascimento + "T00:00:00");
            const dia = nasc.getDate();
            const mesStr = String(mesAtual).padStart(2, "0");
            const diaStr = String(dia).padStart(2, "0");
            return {
              id: c.id,
              nome: c.paciente ?? "Sem nome",
              data: `${diaStr}/${mesStr}`,
              telefone: c.telefone ?? "—",
              dia,
            };
          })
          .sort((a: any, b: any) => a.dia - b.dia);

        setAniversariantesMes(aniversariantes);
      } catch (err) {
        console.error("Erro ao carregar aniversariantes:", err);
      } finally {
        setAniversariantesCarregando(false);
      }
    };
    void carregarAniversariantes();
  }, [loading, clinica?.id, isSuperAdmin, isImpersonating]);

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
        .eq("clinica_id", clinica?.id)
        .limit(1)
        .single();
        
      if (erroCarteira && erroCarteira.code !== 'PGRST116') throw new Error("Erro ao ler carteira");

      if (!carteira) {
        toast({ variant: 'destructive', title: 'Carteira não encontrada', description: 'Não foi encontrada uma carteira de envios para esta clínica.' });
        return false;
      }
      
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
        .eq("clinica_id", clinica?.id)
        .ilike("situacao", "Ativo")
        .not("telefone", "is", null)
        .in("id", idsPacientes);
      
      if (erroClientes) throw erroClientes;

      const insertsFila = clientes.map((c: any) => {
        const nomeCompleto = (c.paciente ?? "").trim();
        const primeiroNome = nomeCompleto.split(" ")[0] ?? "";
        const nomeFormatado = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
        const mensagemFinal = mensagem.replace(/\{nome\}/gi, nomeFormatado);
        return {
          paciente_id: c.id,
          paciente_nome: c.paciente,
          telefone: c.telefone,
          mensagem: mensagemFinal,
          data_programada: dataAgendada.toISOString(),
          status: "pendente",
          custo: 1,
          origem: "massa",
          clinica_id: clinica?.id,
        };
      });

      const { error: erroFila } = await (supabase as any).from("fila_envios").insert(insertsFila);
      if (erroFila) throw erroFila;

      const { error: erroUpdate } = await (supabase as any)
        .from("carteira_envios")
        .update({ saldo: saldoAtual - quantidade })
        .eq("id", carteira.id)
        .eq("clinica_id", clinica?.id);
        
      if (erroUpdate) throw erroUpdate;

      await (supabase as any)
        .from("disparos_massa_historico")
        .insert({
          status: "agendado",
          quantidade_destinatarios: quantidade,
          mensagem: mensagem,
          data_agendada: dataAgendada.toISOString(),
          clinica_id: clinica?.id,
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
    if (enviandoMassa) return;
    if (!requireMensagem(mensagemMassa)) return;
    setEnviandoMassa(true);
    try {

    const quantidadeDestinatarios = pacientesSelecionadosIds.length;

    if (quantidadeDestinatarios === 0) {
      toast({
        variant: "destructive",
        title: "Selecione os pacientes",
        description: modoSelecao === "procedimento"
          ? "Use o botão 'Buscar pacientes' para encontrar os destinatários por procedimento."
          : "Escolha ao menos um paciente para receber o disparo.",
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
    } finally {
      setEnviandoMassa(false);
    }
  };

  const salvarCampanhaConfig = async (
    chave: string,
    mensagem: string,
    ativo: boolean,
    clinicaId?: string,
  ) => {
    const mensagemLimpa = mensagem.trim();

    if (mensagemLimpa.length === 0 || mensagemLimpa.length > 1000) {
      return;
    }

    const finalClinicaId = clinicaId || clinica?.id;
    if (!finalClinicaId) {
      console.warn("salvarCampanhaConfig ignorado: clinicaId não fornecido.");
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
            clinica_id: finalClinicaId,
          },
          {
            onConflict: "clinica_id,chave",
          },
        );

      if (error) throw error;

      await gravarLogAuditoria(
        finalClinicaId,
        "salvar_frase",
        `Salva frase da campanha '${chave}' (${ativo ? 'Ativa' : 'Inativa'}): "${mensagemLimpa.slice(0, 80)}${mensagemLimpa.length > 80 ? '...' : ''}"`
      );
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
    config: Pick<ConfigProcedimento, "ativo" | "limiteEnvios" | "diasEntreEnvios" | "mensagem" | "clinicaId">,
  ) => {
    try {
      if (procedimentoIds.length === 0) {
        await removerCampanhaGrupo(groupId, config.clinicaId);
        return;
      }

      const nomesProcedimentos = procedimentoIds
        .map((id) => procedimentos.find((p) => p.id === id)?.procedimento)
        .filter(Boolean) as string[];

      const finalClinicaId = config.clinicaId || clinica?.id;

      const payload = {
        group_id: groupId,
        ativo: config.ativo,
        limite_envios: config.limiteEnvios,
        dias_entre_envios: config.diasEntreEnvios,
        mensagem: config.mensagem,
        procedimentos_ids: procedimentoIds,
        procedimentos_nomes: nomesProcedimentos,
        clinica_id: finalClinicaId,
      };

      // Check if exists
      const { data: existing } = await (supabase as any)
        .from(TABELA_CAMPANHAS_PROCEDIMENTO)
        .select("group_id")
        .eq("clinica_id", finalClinicaId)
        .eq("group_id", groupId)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update
        const { error } = await (supabase as any)
          .from(TABELA_CAMPANHAS_PROCEDIMENTO)
          .update(payload)
          .eq("clinica_id", finalClinicaId)
          .eq("group_id", groupId);
        if (error) throw error;

        await gravarLogAuditoria(
          finalClinicaId,
          "editar_procedimento",
          `Atualizada frase da campanha de procedimento (Group ID: ${groupId}): "${config.mensagem.slice(0, 80)}${config.mensagem.length > 80 ? '...' : ''}"`
        );
      } else {
        // Insert
        const { error } = await (supabase as any)
          .from(TABELA_CAMPANHAS_PROCEDIMENTO)
          .insert(payload);
        if (error) throw error;

        await gravarLogAuditoria(
          finalClinicaId,
          "criar_procedimento",
          `Criada campanha de procedimento (Group ID: ${groupId}): "${config.mensagem.slice(0, 80)}${config.mensagem.length > 80 ? '...' : ''}"`
        );
      }
    } catch (error) {
      console.error("Erro ao sincronizar campanha por procedimento", error);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar campanha",
        description: "Não foi possível atualizar este card no banco. Tente novamente.",
      });
    }
  };
 
  const removerCampanhaGrupo = async (groupId: string, clinicaId?: string) => {
    try {
      let query = (supabase as any)
        .from(TABELA_CAMPANHAS_PROCEDIMENTO)
        .delete()
        .eq("group_id", groupId);

      const finalClinicaId = clinicaId || clinica?.id;
      if (finalClinicaId) {
        query = query.eq("clinica_id", finalClinicaId);
      }

      const { error } = await query;
 
      if (error) {
        console.error("Erro ao remover resumo de campanha por procedimento", error);
      } else {
        await gravarLogAuditoria(
          finalClinicaId,
          "deletar_procedimento",
          `Excluída campanha de procedimento (Group ID: ${groupId})`
        );
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

  const forcarFilaProcedimento = async (groupId: string, nomesProc: string[]) => {
    if (nomesProc.length === 0) return;
    try {
      setForcandoFila((prev) => ({ ...prev, [groupId]: true }));
      
      const hoje = new Date();
      const hojeNorm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0).toISOString();
      const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999).toISOString();

      // 1. Carregar a configuração da campanha de procedimento específica
      const { data: campanha, error: erroCamp } = await (supabase as any)
        .from("campanhas_procedimento")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();

      if (erroCamp || !campanha) {
        throw new Error(erroCamp?.message || "Configuração da campanha não encontrada.");
      }

      if (!campanha.ativo) {
        toast({
          variant: "destructive",
          title: "Campanha inativa",
          description: "Ative a campanha antes de forçar o envio para a fila.",
        });
        return;
      }

      const diasEntreEnvios: number = campanha.dias_entre_envios ?? 30;
      const mensagemTemplate: string = campanha.mensagem ?? "";

      if (!mensagemTemplate.trim() || diasEntreEnvios <= 0) {
        throw new Error("Configuração da campanha está incompleta (mensagem vazia ou dias inválidos).");
      }

      // 2. Buscar procedimentos da clínica que combinem com os nomes da campanha
      let procQuery = (supabase as any)
        .from("procedimentos")
        .select("nome_paciente, data_finalizacao, procedimento, clinica_id")
        .in("procedimento", nomesProc);

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) procQuery = procQuery.eq("clinica_id", clinica.id);
      }

      const { data: procs, error: erroProcs } = await procQuery;
      if (erroProcs) throw erroProcs;

      if (!procs || procs.length === 0) {
        toast({
          title: "Nenhum procedimento encontrado",
          description: "Não foram encontrados procedimentos registrados com estes nomes.",
        });
        return;
      }

      // 3. Filtrar procedimentos elegíveis para hoje
      const pacientesParaEnviar = new Map<string, { procedimento: string; dataFinalizacao: Date }>();
      
      const parseDateBRLocal = (dateStr: string | null | undefined): Date | null => {
        if (!dateStr) return null;
        const parts = dateStr.trim().split("/");
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        return new Date(year, month, day);
      };

      for (const proc of procs) {
        const nome = (proc.nome_paciente ?? "").trim();
        if (!nome) continue;

        const dataFin = parseDateBRLocal(proc.data_finalizacao);
        if (!dataFin) continue;

        const dataEnvio = new Date(dataFin.getFullYear(), dataFin.getMonth(), dataFin.getDate());
        dataEnvio.setDate(dataEnvio.getDate() + diasEntreEnvios);

        if (dataEnvio.getTime() === hojeNorm.getTime()) {
          // VERIFICAÇÃO: Existe outro procedimento mais recente deste mesmo paciente para esta campanha?
          const temMaisRecente = procs.some((other) => {
            if ((other.nome_paciente ?? "").trim().toLowerCase() !== nome.toLowerCase()) return false;
            if (!nomesProc.map(n => n.toLowerCase()).includes((other.procedimento ?? "").toLowerCase())) return false;
            
            const otherDate = parseDateBRLocal(other.data_finalizacao);
            if (!otherDate) return false;
            return otherDate.getTime() > dataFin.getTime();
          });

          if (temMaisRecente) {
            // Pula este procedimento pois o paciente já retornou mais recentemente para fazer um procedimento desta campanha!
            continue;
          }

          if (!pacientesParaEnviar.has(nome)) {
            pacientesParaEnviar.set(nome, {
              procedimento: proc.procedimento,
              dataFinalizacao: dataFin,
            });
          }
        }
      }

      if (pacientesParaEnviar.size === 0) {
        // Calcular previstos para os próximos 30 dias
        const amanha = new Date(hojeNorm.getFullYear(), hojeNorm.getMonth(), hojeNorm.getDate() + 1);
        const fim30 = new Date(hojeNorm.getFullYear(), hojeNorm.getMonth(), hojeNorm.getDate() + 30);
        const pacientesProximos = new Map<string, Date>();

        for (const proc of procs) {
          const nome = (proc.nome_paciente ?? "").trim();
          if (!nome) continue;

          const dataFin = parseDateBRLocal(proc.data_finalizacao);
          if (!dataFin) continue;

          const dataEnvio = new Date(dataFin.getFullYear(), dataFin.getMonth(), dataFin.getDate());
          dataEnvio.setDate(dataEnvio.getDate() + diasEntreEnvios);

          if (dataEnvio.getTime() >= amanha.getTime() && dataEnvio.getTime() <= fim30.getTime()) {
            // Verificar se há outro mais recente
            const temMaisRecente = procs.some((other) => {
              if ((other.nome_paciente ?? "").trim().toLowerCase() !== nome.toLowerCase()) return false;
              if (!nomesProc.map(n => n.toLowerCase()).includes((other.procedimento ?? "").toLowerCase())) return false;
              
              const otherDate = parseDateBRLocal(other.data_finalizacao);
              if (!otherDate) return false;
              return otherDate.getTime() > dataFin.getTime();
            });

            if (temMaisRecente) continue;

            const existing = pacientesProximos.get(nome);
            if (!existing || dataEnvio.getTime() < existing.getTime()) {
              pacientesProximos.set(nome, dataEnvio);
            }
          }
        }

        const totalProximos = pacientesProximos.size;

        toast({
          title: "Nenhum disparo pendente para hoje",
          description: `Nenhum paciente atinge a data do disparo hoje (${diasEntreEnvios} dias pós-procedimento). Nos próximos 30 dias, há ${totalProximos} paciente(s) previsto(s) para entrar na fila.`,
        });
        return;
      }

      // 4. Carregar clientes
      const nomesPacientes = Array.from(pacientesParaEnviar.keys());
      let clientesQuery = (supabase as any)
        .from("clientes")
        .select("id, paciente, telefone")
        .ilike("situacao", "Ativo")
        .in("paciente", nomesPacientes);

      if (!isSuperAdmin || isImpersonating) {
        if (clinica?.id) clientesQuery = clientesQuery.eq("clinica_id", clinica.id);
      }

      const { data: clientes, error: erroClientes } = await clientesQuery;
      if (erroClientes) throw erroClientes;

      if (!clientes || clientes.length === 0) {
        toast({
          title: "Clientes inativos ou sem telefone",
          description: "Os pacientes elegíveis não possuem cadastro ativo ou telefone cadastrado.",
        });
        return;
      }

      // 5. Inserir na fila prevenindo duplicados
      let inseridos = 0;
      let duplicados = 0;
      const pacientesAdicionados: string[] = [];

      for (const cliente of clientes) {
        const nomePaciente = (cliente.paciente ?? "").trim();
        const telefone = (cliente.telefone ?? "").trim();
        if (!telefone) continue;

        const dadosEnvio = pacientesParaEnviar.get(nomePaciente);
        if (!dadosEnvio) continue;

        // Verificar duplicata hoje
        const { count: dupCount, error: erroDup } = await (supabase as any)
          .from("fila_envios")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", campanha.clinica_id)
          .eq("paciente_id", cliente.id)
          .eq("origem", "procedimento")
          .eq("campanha_ref", groupId)
          .gte("data_programada", inicioHoje)
          .lte("data_programada", fimHoje);

        if (erroDup) throw erroDup;

        if ((dupCount ?? 0) > 0) {
          duplicados++;
          continue;
        }

        // Substituir variáveis
        const primeiroNome = nomePaciente.split(" ")[0];
        const nomeFormatado = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
        
        const mensagemFinal = mensagemTemplate
          .replace(/\{nome\}/gi, nomeFormatado)
          .replace(/\{procedimento\}/gi, dadosEnvio.procedimento);

        const { error: erroInsert } = await (supabase as any)
          .from("fila_envios")
          .insert({
            paciente_id: cliente.id,
            paciente_nome: nomePaciente,
            telefone: telefone,
            mensagem: mensagemFinal,
            data_programada: new Date().toISOString(),
            status: "pendente",
            custo: 1,
            origem: "procedimento",
            clinica_id: campanha.clinica_id,
            campanha_ref: groupId,
          });

        if (erroInsert) throw erroInsert;
        inseridos++;
        pacientesAdicionados.push(nomePaciente);
      }

      if (inseridos > 0) {
        await gravarLogAuditoria(
          campanha.clinica_id,
          "forcar_fila_procedimento",
          `Forçado envio manual para fila da campanha '${nomesProc.join(", ")}' (Group ID: ${groupId}): adicionou ${inseridos} paciente(s): ${pacientesAdicionados.join(", ")}`
        );
        toast({
          title: "Fila atualizada com sucesso",
          description: `${inseridos} mensagem(ns) foram adicionadas à fila de envios.${duplicados > 0 ? ` (${duplicados} já estavam na fila)` : ""}`,
        });
      } else {
        toast({
          title: "Nenhum novo disparo adicionado",
          description: `Todos os ${duplicados} paciente(s) elegíveis de hoje já estavam na fila.`,
        });
      }

    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro ao forçar fila",
        description: err.message || "Ocorreu um erro inesperado ao gerar a fila.",
      });
    } finally {
      setForcandoFila((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  const removerProcedimento = async (id: ProcedimentoId, clinicaId?: string) => {
    const finalClinicaId = clinicaId || configsProcedimentos[id]?.clinicaId || clinica?.id;

    // Remove do estado (tela)
    setConfigsProcedimentos((prev) => {
      const novo = { ...prev } as Record<ProcedimentoId, ConfigProcedimento>;
      delete novo[id];
      return novo;
    });

    // Remove configuração salva para este procedimento, se existir
    try {
      let query = (supabase as any)
        .from("campanhas_config")
        .delete()
        .eq("chave", `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${id}`);

      if (finalClinicaId) {
        query = query.eq("clinica_id", finalClinicaId);
      }

      const { error } = await query;

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
                  const clinicaId = grupoAtual?.config?.clinicaId;

                  try {
                    await Promise.all(ids.map((id) => removerProcedimento(id, clinicaId)));
                    await removerCampanhaGrupo(alvo.groupId, clinicaId);

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
          <TabsList className="mb-3 flex w-full justify-start gap-2 overflow-x-auto flex-nowrap rounded-lg bg-card/80 p-1 shadow-sm">
            <TabsTrigger value="massa">Disparo Geral</TabsTrigger>
            <TabsTrigger value="procedimento">Disparo por procedimento</TabsTrigger>
            <TabsTrigger value="aniversario">Disparo de aniversário</TabsTrigger>
          </TabsList>

          <TabsContent value="massa" className="mt-0">
            {/* Disparo Geral */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Disparo Geral</CardTitle>
                <CardDescription>
                  Envie uma mensagem personalizada selecionando por paciente ou por procedimentos realizados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Modo de seleção */}
                <div className="space-y-2 rounded-md border bg-card/60 p-3 text-xs">
                  <p className="font-medium text-foreground">Modo de seleção de destinatários</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={modoSelecao === "paciente" ? "default" : "outline"}
                      className="h-8 px-4 text-xs"
                      onClick={() => {
                        setModoSelecao("paciente");
                        setPacientesSelecionadosIds([]);
                        setResumoLote(null);
                      }}
                    >
                      Por paciente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={modoSelecao === "procedimento" ? "default" : "outline"}
                      className="h-8 px-4 text-xs"
                      onClick={() => {
                        setModoSelecao("procedimento");
                        setPacientesSelecionadosIds([]);
                        setResumoLote(null);
                      }}
                    >
                      Por procedimento
                    </Button>
                  </div>
                </div>

                {/* ═══ MODO PACIENTE ═══ */}
                {modoSelecao === "paciente" && (
                <div className="space-y-2 rounded-md border bg-card/60 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">Destinatários</p>
                      <p className="text-[11px] text-muted-foreground">
                        Selecione os pacientes que devem receber esta mensagem.
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
                )}

                {/* ═══ MODO PROCEDIMENTO ═══ */}
                {modoSelecao === "procedimento" && (
                <div className="space-y-3 rounded-md border bg-card/60 p-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">Seleção por procedimento</p>
                    <p className="text-[11px] text-muted-foreground">
                      Selecione os procedimentos e defina o período de finalização para encontrar os pacientes.
                    </p>
                  </div>

                  {/* Busca e seleção de procedimentos */}
                  <div className="space-y-2">
                    <Label htmlFor="busca-proc-geral" className="text-[11px]">Procedimentos</Label>
                    <Input
                      id="busca-proc-geral"
                      placeholder="Buscar procedimento..."
                      value={buscaProcGeral}
                      onChange={(e) => setBuscaProcGeral(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="max-h-[150px] overflow-y-auto rounded-md border bg-background p-1">
                      {procedimentos
                        .filter((p) => {
                          const termo = buscaProcGeral.trim().toLowerCase();
                          if (!termo) return true;
                          return p.procedimento.toLowerCase().includes(termo);
                        })
                        .map((proc) => {
                          const selecionado = procsSelecionadosGeral.includes(proc.procedimento);
                          return (
                            <label
                              key={proc.id}
                              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/50 ${
                                selecionado ? "bg-primary/5 font-medium" : ""
                              }`}
                            >
                              <Checkbox
                                checked={selecionado}
                                onCheckedChange={(checked) => {
                                  setProcsSelecionadosGeral((prev) =>
                                    checked
                                      ? [...prev, proc.procedimento]
                                      : prev.filter((n) => n !== proc.procedimento)
                                  );
                                  setResumoLote(null);
                                }}
                              />
                              <span className="truncate">{proc.procedimento}</span>
                            </label>
                          );
                        })}
                    </div>
                    {procsSelecionadosGeral.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {procsSelecionadosGeral.map((nome) => (
                          <span
                            key={nome}
                            className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-[10px]"
                          >
                            {nome}
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                setProcsSelecionadosGeral((prev) => prev.filter((n) => n !== nome));
                                setResumoLote(null);
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Range de datas */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="data-inicio-geral" className="text-[11px]">Período início (finalização)</Label>
                      <Input
                        id="data-inicio-geral"
                        type="date"
                        value={dataInicioGeral}
                        onChange={(e) => { setDataInicioGeral(e.target.value); setResumoLote(null); }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="data-fim-geral" className="text-[11px]">Período fim (finalização)</Label>
                      <Input
                        id="data-fim-geral"
                        type="date"
                        value={dataFimGeral}
                        onChange={(e) => { setDataFimGeral(e.target.value); setResumoLote(null); }}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Seleciona pacientes que finalizaram os procedimentos entre essas datas.
                  </p>

                  {/* Botão buscar */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs"
                    disabled={buscandoPacientesProc || procsSelecionadosGeral.length === 0 || !dataInicioGeral || !dataFimGeral}
                    onClick={async () => {
                      try {
                        setBuscandoPacientesProc(true);
                        setResumoLote(null);
                        setPacientesSelecionadosIds([]);

                        // Parse date range
                        const dtInicio = new Date(dataInicioGeral + "T00:00:00");
                        const dtFim = new Date(dataFimGeral + "T23:59:59");

                        // Fetch procedures in date range
                        let procQuery = (supabase as any)
                          .from("procedimentos")
                          .select("nome_paciente, data_finalizacao, procedimento")
                          .in("procedimento", procsSelecionadosGeral);

                        if (!isSuperAdmin || isImpersonating) {
                          if (clinica?.id) procQuery = procQuery.eq("clinica_id", clinica.id);
                        }

                        const { data: procs, error: erroProcs } = await procQuery;
                        if (erroProcs) throw erroProcs;

                        // Group by patient to keep only the latest procedure of the selected type
                        const latestProcMap = new Map<string, Date>();
                        for (const proc of (procs ?? [])) {
                          const nome = (proc.nome_paciente ?? "").trim();
                          if (!nome) continue;

                          const dfStr = (proc.data_finalizacao ?? "").trim();
                          if (!dfStr) continue;
                          const parts = dfStr.split("/");
                          if (parts.length !== 3) continue;
                          const d = new Date(
                            parseInt(parts[2], 10),
                            parseInt(parts[1], 10) - 1,
                            parseInt(parts[0], 10)
                          );
                          if (isNaN(d.getTime())) continue;

                          const existingDate = latestProcMap.get(nome);
                          if (!existingDate || d.getTime() > existingDate.getTime()) {
                            latestProcMap.set(nome, d);
                          }
                        }

                        // Filter by date range (only patients whose LATEST procedure falls in the range)
                        const nomesPacientes = new Set<string>();
                        for (const [nome, latestDate] of latestProcMap.entries()) {
                          if (latestDate >= dtInicio && latestDate <= dtFim) {
                            nomesPacientes.add(nome);
                          }
                        }

                        if (nomesPacientes.size === 0) {
                          setResumoLote({ total: 0, nomes: [] });
                          toast({ variant: "destructive", title: "Nenhum paciente encontrado", description: "Nenhum paciente realizou esses procedimentos no período selecionado." });
                          return;
                        }

                        // Fetch matching clients
                        const nomesArray = Array.from(nomesPacientes);
                        const BATCH = 100;
                        const clientesEncontrados: { id: string; paciente: string }[] = [];
                        for (let i = 0; i < nomesArray.length; i += BATCH) {
                          const batch = nomesArray.slice(i, i + BATCH);
                          let cliQuery = (supabase as any)
                            .from("clientes")
                            .select("id, paciente")
                            .ilike("situacao", "Ativo")
                            .not("telefone", "is", null)
                            .in("paciente", batch);
                          if (!isSuperAdmin || isImpersonating) {
                            if (clinica?.id) cliQuery = cliQuery.eq("clinica_id", clinica.id);
                          }
                          const { data: clis } = await cliQuery;
                          if (clis) clientesEncontrados.push(...clis);
                        }

                        // Deduplicate by id
                        const idsUnicos = Array.from(new Set(clientesEncontrados.map((c) => c.id)));
                        setPacientesSelecionadosIds(idsUnicos);
                        setResumoLote({
                          total: idsUnicos.length,
                          nomes: procsSelecionadosGeral,
                        });

                        if (idsUnicos.length > 0) {
                          toast({ title: "Pacientes encontrados!", description: `${idsUnicos.length} paciente(s) encontrado(s).` });
                        }
                      } catch (err: any) {
                        console.error("Erro ao buscar pacientes por procedimento:", err);
                        toast({ variant: "destructive", title: "Erro na busca", description: err.message ?? "Não foi possível buscar os pacientes." });
                      } finally {
                        setBuscandoPacientesProc(false);
                      }
                    }}
                  >
                    {buscandoPacientesProc ? "Buscando…" : "Buscar pacientes"}
                  </Button>

                  {/* Resumo do lote */}
                  {resumoLote && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <p className="text-xs font-medium text-foreground">📋 Resumo do lote</p>
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        <p>• Pacientes encontrados: <span className="font-semibold text-foreground">{resumoLote.total}</span></p>
                        <p>• Procedimentos: <span className="font-semibold text-foreground">{resumoLote.nomes.join(", ")}</span></p>
                        <p>• Período: <span className="font-semibold text-foreground">
                          {new Date(dataInicioGeral + "T00:00:00").toLocaleDateString("pt-BR")} a {new Date(dataFimGeral + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span></p>
                        {resumoLote.total > 0 && (
                          <p>• Créditos necessários: <span className="font-semibold text-foreground">{resumoLote.total}</span></p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}

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
                        aria-label="Definir envio do disparo geral para agora"
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
                    placeholder="Olá {nome}, estamos com condições especiais para sua próxima consulta…"
                    value={mensagemMassa}
                    onChange={(event) => setMensagemMassa(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {"Use {nome}, {procedimento} e {data_procedimento} para personalizar automaticamente a mensagem."}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{mensagemMassa.length} caracteres</p>
                </div>

                <Button type="button" size="sm" onClick={handleEnviarMassa} className="w-full" disabled={enviandoMassa}>
                  {enviandoMassa ? "Enviando…" : "Enviar"}
                </Button>

                {historicoDisparosMassa.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-foreground">Últimos disparos</p>
                    <div className="space-y-1 rounded-md bg-card p-2 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b pb-1 text-[11px] text-muted-foreground">
                        <span>Data de envio</span>
                        <span>Mensagem</span>
                        <span className="text-right">Qtd. envios</span>
                        <span className="text-right">Total enviados</span>
                      </div>
                      {historicoDisparosMassa.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 py-1"
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
                <p className="text-xs sm:text-xs text-sm text-muted-foreground">
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
                            className="h-9 sm:h-8 text-sm sm:text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Digite parte do nome para filtrar a lista de procedimentos.
                          </p>
                        </div>

                        <div className="mt-2 max-h-72 sm:max-h-60 space-y-1.5 sm:space-y-1 overflow-y-auto rounded-md border bg-background p-3 sm:p-2 text-sm sm:text-xs">
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
                                    className="flex cursor-pointer items-center gap-2.5 sm:gap-2 rounded-sm px-2 sm:px-1 py-1.5 sm:py-0.5 hover:bg-muted active:bg-muted/80"
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
                                    <span className="truncate text-sm sm:text-xs text-foreground">{proc.procedimento}</span>
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
                              clinicaId: proc.clinica_id,
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
                                configsParaAdicionar[id].clinicaId,
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
                                     grupo.config.clinicaId,
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
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-medium text-foreground">Procedimentos desta campanha</p>
                              <div className="flex items-center gap-1">
                                {disponiveisParaAdicionar.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setAddProcAberto((prev) => ({ ...prev, [chaveGrupo]: !prev[chaveGrupo] }))}
                                    title="Adicionar procedimento"
                                  >
                                    <Plus className={`h-3.5 w-3.5 transition-transform ${addProcAberto[chaveGrupo] ? 'rotate-45' : ''}`} />
                                  </Button>
                                )}

                                {grupo.procedimentoIds.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                    onClick={() => void forcarFilaProcedimento(chaveGrupo, nomesProcedimentos)}
                                    disabled={forcandoFila[chaveGrupo]}
                                    title="Forçar ida para a fila agora (evita duplicados)"
                                  >
                                    {forcandoFila[chaveGrupo] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
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
                                       void removerProcedimento(idProcedimento, grupo.config.clinicaId).then(() => {
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

                        {addProcAberto[chaveGrupo] && disponiveisParaAdicionar.length > 0 ? (
                          <div className="space-y-1 rounded-md border border-dashed p-3 bg-muted/20">
                            <p className="text-[11px] font-medium text-foreground">
                              Adicionar procedimento a esta campanha
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                className="h-10 sm:h-8 w-full rounded-md border bg-background px-3 sm:px-2 text-sm sm:text-xs sm:w-64"
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
                                     grupo.config.clinicaId,
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
                              <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={
                                  grupo.config.diasEntreEnvios === 90 ? '90'
                                  : grupo.config.diasEntreEnvios === 180 ? '180'
                                  : grupo.config.diasEntreEnvios === 365 ? '365'
                                  : 'custom'
                                }
                                onChange={(event) => {
                                  const val = event.target.value;
                                  if (val !== 'custom') {
                                    const dias = Number(val);
                                    grupo.procedimentoIds.forEach((idProcedimento) => {
                                      updateProcedimento(idProcedimento, { diasEntreEnvios: dias });
                                    });
                                    void sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, { ...grupo.config, diasEntreEnvios: dias });
                                    grupo.procedimentoIds.forEach((idProcedimento) => {
                                      void salvarCampanhaConfig(
                                        `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${idProcedimento}`,
                                        grupo.config.mensagem,
                                        grupo.config.ativo,
                                        grupo.config.clinicaId,
                                      );
                                    });
                                  }
                                }}
                              >
                                <option value="90">3 meses (90 dias)</option>
                                <option value="180">6 meses (180 dias)</option>
                                <option value="365">1 ano (365 dias)</option>
                                <option value="custom">Personalizado</option>
                              </select>
                              {![90, 180, 365].includes(grupo.config.diasEntreEnvios) && (
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={grupo.config.diasEntreEnvios}
                                    onChange={(event) => {
                                      const novoValor = Number(event.target.value) || 0;
                                      grupo.procedimentoIds.forEach((idProcedimento) => {
                                        updateProcedimento(idProcedimento, {
                                          diasEntreEnvios: novoValor,
                                        });
                                      });
                                    }}
                                    onBlur={() => {
                                      void sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, grupo.config);
                                      grupo.procedimentoIds.forEach((idProcedimento) => {
                                        void salvarCampanhaConfig(
                                          `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${idProcedimento}`,
                                          grupo.config.mensagem,
                                          grupo.config.ativo,
                                          grupo.config.clinicaId,
                                        );
                                      });
                                    }}
                                    className="w-24"
                                  />
                                  <span className="text-sm text-muted-foreground">dias</span>
                                </div>
                              )}
                              <p className="text-[11px] text-muted-foreground">
                                Tempo após a data do procedimento para enviar a mensagem.
                              </p>
                            </div>

                            <div className="space-y-1">
                              <Label>Mensagem para o cliente</Label>
                              <Textarea
                                rows={3}
                                value={grupo.config.mensagem}
                                onChange={(event) => {
                                  const novaMensagem = event.target.value;
                                  grupo.procedimentoIds.forEach((idProcedimento) => {
                                    updateProcedimento(idProcedimento, {
                                      mensagem: novaMensagem,
                                    });
                                  });
                                }}
                                onBlur={() => {
                                  grupo.procedimentoIds.forEach((idProcedimento) => {
                                    void salvarCampanhaConfig(
                                      `${CAMPANHA_CHAVE_PROCEDIMENTO_PREFIX}${idProcedimento}`,
                                      grupo.config.mensagem,
                                      grupo.config.ativo,
                                      grupo.config.clinicaId,
                                    );
                                  });
                                  void sincronizarCampanhaGrupo(chaveGrupo, grupo.procedimentoIds, grupo.config);
                                }}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                {"Use {nome}, {procedimento} e {data_procedimento} para personalizar automaticamente a mensagem."}
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
                          onCheckedChange={(checked) => {
                            setAniversarioDiaAtivo(checked);
                            void salvarCampanhaConfig(CAMPANHA_CHAVE_ANIVERSARIO_DIA, mensagemAniversarioDia, checked);
                          }}
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
                        onBlur={() => void salvarCampanhaConfig(CAMPANHA_CHAVE_ANIVERSARIO_DIA, mensagemAniversarioDia, aniversarioDiaAtivo)}
                      />
                      <p className="text-[11px] text-muted-foreground">{"Use {nome} na mensagem para inserir automaticamente o primeiro nome do paciente."}</p>
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
                          onCheckedChange={(checked) => {
                            setAniversarioMesAtivo(checked);
                            void salvarCampanhaConfig(CAMPANHA_CHAVE_ANIVERSARIO_MES, mensagemAniversarioMes, checked);
                          }}
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
                        onBlur={() => void salvarCampanhaConfig(CAMPANHA_CHAVE_ANIVERSARIO_MES, mensagemAniversarioMes, aniversarioMesAtivo)}
                      />
                      <p className="text-[11px] text-muted-foreground">{"Use {nome} na mensagem para inserir automaticamente o primeiro nome do paciente."}</p>
                    </div>
                  </div>
                </div>

                {/* Lista real de aniversariantes do mês */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Cake className="h-3.5 w-3.5 text-amber-500" />
                      Aniversariantes de {new Date().toLocaleString("pt-BR", { month: "long" })}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {aniversariantesMes.length} paciente{aniversariantesMes.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="space-y-1 rounded-md bg-card border p-2 text-xs max-h-64 overflow-y-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-2 border-b pb-1 text-[11px] text-muted-foreground font-medium">
                      <span>Nome</span>
                      <span>Data</span>
                      <span>Telefone</span>
                    </div>
                    {aniversariantesCarregando && (
                      <p className="text-center text-muted-foreground py-3 text-[11px]">Carregando aniversariantes…</p>
                    )}
                    {!aniversariantesCarregando && aniversariantesMes.length === 0 && (
                      <p className="text-center text-muted-foreground py-3 text-[11px]">Nenhum aniversariante encontrado neste mês.</p>
                    )}
                    {!aniversariantesCarregando && aniversariantesMes.map((paciente) => {
                      const hoje = new Date();
                      const jaPassou = paciente.dia < hoje.getDate();
                      const ehHoje = paciente.dia === hoje.getDate();
                      return (
                        <div
                          key={paciente.id}
                          className={`grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-2 py-1 rounded px-1 ${
                            ehHoje ? "bg-amber-50 dark:bg-amber-950/30 font-medium" : jaPassou ? "opacity-50" : ""
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {ehHoje && <span className="text-amber-500">🎂</span>}
                            {paciente.nome}
                          </span>
                          <span>{paciente.data}</span>
                          <span className="text-muted-foreground">{paciente.telefone}</span>
                        </div>
                      );
                    })}
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
