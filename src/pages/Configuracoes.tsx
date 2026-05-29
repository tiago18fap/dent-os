import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { useClinica } from "@/contexts/ClinicaContext";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, CheckCircle2, Clock, RefreshCcw, LogOut, Edit, Trash2, Plus, Key, Eye, EyeOff, Loader2, Wifi, WifiOff, Send, Settings2, Monitor, Lock } from "lucide-react";
import { createInstance, connectInstance, getConnectionState, disconnectAndDelete, fetchInstanceInfo, sendTextMessage, configureWebhook } from "@/services/evolutionApi";

interface ImportLogItem {
  id: string;
  arquivo: string;
  tipo: string;
  data: string;
  status: string;
  origem: string;
  n8nStatus: string | null;
  n8nPreview: string | null;
}

interface ClinicaAdminItem {
  id: string;
  nome: string;
  plano: string;
  status_pagamento: string;
  limite_mensagens: number;
  limite_procedimentos: number;
  data_fim_teste: string | null;
  created_at: string;
  dias_restantes?: number;
}

// Lista simples de e-mails de super admin.
const SUPER_ADMIN_EMAILS: string[] = ["tiago@dentos.com.br", "admin@dentos.com.br", "tiago18fap@gmail.com", "contato@dentos.com.br", "victorpconti@gmail.com"];

const Configuracoes = () => {
  const { toast } = useToast();
  const { clinica, isSuperAdmin } = useClinica();
  const whatsappStatus = useWhatsappStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pollingConnection, setPollingConnection] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  // Estados para envio de mensagem de teste
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Esta é uma mensagem de teste enviada a partir da configuração de WhatsApp do DentOS. 🦷");
  const [sendingTest, setSendingTest] = useState(false);

  // Estados de dados do usuário ativo
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [clinicaNome, setClinicaNome] = useState("");

  // Estados de criação de clínica
  const [createClinicaOpen, setCreateClinicaOpen] = useState(false);
  const [newClinicaNome, setNewClinicaNome] = useState("");
  const [newClinicaPlano, setNewClinicaPlano] = useState<"bronze" | "prata" | "ouro" | "ilimitado_premium">("bronze");
  const [newClinicaStatus, setNewClinicaStatus] = useState<"ativo" | "inadimplente" | "teste_gratis" | "cancelado">("teste_gratis");
  const [newClinicaLimiteMsg, setNewClinicaLimiteMsg] = useState(100);
  const [newClinicaLimiteProc, setNewClinicaLimiteProc] = useState(5);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [createClinicaLoading, setCreateClinicaLoading] = useState(false);

  // Estados de edição de clínica
  const [editClinicaOpen, setEditClinicaOpen] = useState(false);
  const [selectedClinica, setSelectedClinica] = useState<ClinicaAdminItem | null>(null);
  const [editClinicaNome, setEditClinicaNome] = useState("");
  const [editClinicaPlano, setEditClinicaPlano] = useState("bronze");
  const [editClinicaStatus, setEditClinicaStatus] = useState("teste_gratis");
  const [editClinicaLimiteMsg, setEditClinicaLimiteMsg] = useState(100);
  const [editClinicaLimiteProc, setEditClinicaLimiteProc] = useState(5);
  const [editClinicaDataFimTeste, setEditClinicaDataFimTeste] = useState("");
  const [editClinicaLoading, setEditClinicaLoading] = useState(false);

  // Estados de exclusão de clínica
  const [deleteClinicaOpen, setDeleteClinicaOpen] = useState(false);
  const [deleteClinicaTarget, setDeleteClinicaTarget] = useState<ClinicaAdminItem | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteClinicaLoading, setDeleteClinicaLoading] = useState(false);

  // Estados de gestão de usuários da clínica selecionada
  const [clinicaUsers, setClinicaUsers] = useState<any[]>([]);
  const [loadingClinicaUsers, setLoadingClinicaUsers] = useState(false);
  const [newClinicaUserEmail, setNewClinicaUserEmail] = useState("");
  const [newClinicaUserPassword, setNewClinicaUserPassword] = useState("");
  const [newClinicaUserFullName, setNewClinicaUserFullName] = useState("");
  const [newClinicaUserRole, setNewClinicaUserRole] = useState("user");
  const [addingClinicaUser, setAddingClinicaUser] = useState(false);
  const [editingUserPasswordId, setEditingUserPasswordId] = useState<string | null>(null);
  const [newPasswordForUser, setNewPasswordForUser] = useState("");
  const [changingUserPassword, setChangingUserPassword] = useState(false);

  // Estados para redirecionamento/triangulação WhatsApp
  const [redirecionarAtivo, setRedirecionarAtivo] = useState(false);
  const [redirecionarNumero, setRedirecionarNumero] = useState("");
  const [redirecionarMensagem, setRedirecionarMensagem] = useState("");
  const [savingRedirect, setSavingRedirect] = useState(false);
  const [hasInitializedRedirect, setHasInitializedRedirect] = useState(false);

  // Estados para configuração da fila de envios
  const [dedupDias, setDedupDias] = useState(30);
  const [horarioInicio, setHorarioInicio] = useState("08:00");
  const [horarioFim, setHorarioFim] = useState("20:00");
  const [savingQueueConfig, setSavingQueueConfig] = useState(false);
  const [hasInitializedQueueConfig, setHasInitializedQueueConfig] = useState(false);

  // Estados para integração Easy Dental
  const SENHA_PLACEHOLDER = "__SENHA_SALVA__";
  const [easydentalUrl, setEasydentalUrl] = useState("");
  const [easydentalUsuario, setEasydentalUsuario] = useState("");
  const [easydentalSenha, setEasydentalSenha] = useState("");
  const [savingEasydental, setSavingEasydental] = useState(false);
  const [hasInitializedEasydental, setHasInitializedEasydental] = useState(false);
  const hasSavedPassword = easydentalSenha === SENHA_PLACEHOLDER;

  // Estados para Mercado Pago (Super Admin)
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpClientId, setMpClientId] = useState("");
  const [mpClientSecret, setMpClientSecret] = useState("");
  const [hasInitializedMp, setHasInitializedMp] = useState(false);
  const [savingMp, setSavingMp] = useState(false);

  useEffect(() => {
    if (whatsappStatus.data && !hasInitializedRedirect) {
      setRedirecionarAtivo(whatsappStatus.data.redirecionar_ativo ?? false);
      setRedirecionarNumero(whatsappStatus.data.redirecionar_numero ?? "");
      setRedirecionarMensagem(
        whatsappStatus.data.redirecionar_mensagem ??
          "Olá! Este número é utilizado apenas para envios automáticos e não recebe mensagens ou ligações. 🤖\n\nPara falar com o nosso atendimento, por favor clique no link abaixo:\n{numero_atendimento}"
      );
      setHasInitializedRedirect(true);
    }
  }, [whatsappStatus.data, hasInitializedRedirect]);

  useEffect(() => {
    if (whatsappStatus.data && !hasInitializedQueueConfig) {
      setDedupDias(whatsappStatus.data.dedup_dias ?? 30);
      setHorarioInicio(whatsappStatus.data.horario_inicio ?? "08:00");
      setHorarioFim(whatsappStatus.data.horario_fim ?? "20:00");
      setHasInitializedQueueConfig(true);
    }
  }, [whatsappStatus.data, hasInitializedQueueConfig]);

  useEffect(() => {
    if (whatsappStatus.data && !hasInitializedEasydental) {
      setEasydentalUrl(whatsappStatus.data.easydental_url ?? "");
      setEasydentalUsuario(whatsappStatus.data.easydental_usuario ?? "");
      // Nunca carrega a senha real — usa placeholder se existe senha salva
      setEasydentalSenha(whatsappStatus.data.easydental_senha ? SENHA_PLACEHOLDER : "");
      setHasInitializedEasydental(true);
    }
  }, [whatsappStatus.data, hasInitializedEasydental]);

  useEffect(() => {
    setHasInitializedRedirect(false);
    setHasInitializedQueueConfig(false);
    setHasInitializedEasydental(false);
  }, [clinica?.id]);

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
      navigate("/auth");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: err.message ?? "Não foi possível desconectar.",
      });
      navigate("/auth");
    } finally {
      setLoadingLogout(false);
    }
  };

  useEffect(() => {
    document.title = "Configurações | DentOS";

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        const email = data.user?.email ?? "";
        setCurrentUserEmail(email);



        if (data.user) {
          const { data: perfilData } = await supabase
            .from("perfis")
            .select("full_name, clinica_id, role")
            .eq("id", data.user.id)
            .maybeSingle();

          if (perfilData) {
            setCurrentUserName(perfilData.full_name ?? "");


            if (perfilData.clinica_id) {
              const { data: clinicaData } = await supabase
                .from("clinicas")
                .select("nome")
                .eq("id", perfilData.clinica_id)
                .maybeSingle();

              if (clinicaData) {
                setClinicaNome(clinicaData.nome ?? "");
              }
            }
          }
        }
      })
      .catch(() => {
        // auth error handled silently
      });
  }, []);

  useEffect(() => {
    if (location.hash === "#whatsapp-config") {
      const el = document.getElementById("whatsapp-config");
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [location.hash]);

  const fetchClinicaUsers = async (clinicaId: string) => {
    try {
      setLoadingClinicaUsers(true);
      const { data, error } = await supabase
        .from("perfis")
        .select("id, full_name, role")
        .eq("clinica_id", clinicaId);
      if (error) throw error;
      setClinicaUsers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar usuários da clínica:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar usuários",
        description: error.message
      });
    } finally {
      setLoadingClinicaUsers(false);
    }
  };

  useEffect(() => {
    if (selectedClinica) {
      fetchClinicaUsers(selectedClinica.id);
    } else {
      setClinicaUsers([]);
    }
  }, [selectedClinica]);

  // Handlers para ações de Super Admin
  const handleCreateClinica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClinicaNome || !newAdminEmail || !newAdminPassword || !newAdminName) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o nome da clínica e os dados do usuário administrador."
      });
      return;
    }

    try {
      setCreateClinicaLoading(true);
      const { error } = await supabase.rpc("create_clinica_with_admin", {
        _clinica_nome: newClinicaNome.trim(),
        _plano: newClinicaPlano,
        _status_pagamento: newClinicaStatus,
        _limite_mensagens: Number(newClinicaLimiteMsg),
        _limite_procedimentos: Number(newClinicaLimiteProc),
        _admin_email: newAdminEmail.trim(),
        _admin_password: newAdminPassword,
        _admin_name: newAdminName.trim()
      });

      if (error) throw error;

      toast({
        title: "Clínica criada",
        description: "Clínica e usuário administrador criados com sucesso!"
      });

      setNewClinicaNome("");
      setNewClinicaPlano("bronze");
      setNewClinicaStatus("teste_gratis");
      setNewClinicaLimiteMsg(100);
      setNewClinicaLimiteProc(5);
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminName("");
      setCreateClinicaOpen(false);

      clientesQuery.refetch();
    } catch (error: any) {
      console.error("Erro ao criar clínica:", error);
      toast({
        variant: "destructive",
        title: "Erro ao criar clínica",
        description: error.message ?? "Não foi possível criar a clínica."
      });
    } finally {
      setCreateClinicaLoading(false);
    }
  };

  const handleSaveClinica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinica) return;

    try {
      setEditClinicaLoading(true);
      const { error } = await supabase
        .from("clinicas")
        .update({
          nome: editClinicaNome.trim(),
          plano: editClinicaPlano,
          status_pagamento: editClinicaStatus,
          limite_mensagens: Number(editClinicaLimiteMsg),
          limite_procedimentos: Number(editClinicaLimiteProc),
          data_fim_teste: editClinicaPlano === "ilimitado_premium" ? null : (editClinicaDataFimTeste ? new Date(editClinicaDataFimTeste).toISOString() : null)
        })
        .eq("id", selectedClinica.id);

      if (error) throw error;

      toast({
        title: "Clínica atualizada",
        description: "Os dados da clínica foram salvos com sucesso!"
      });

      setEditClinicaOpen(false);
      clientesQuery.refetch();
    } catch (error: any) {
      console.error("Erro ao atualizar clínica:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar alterações",
        description: error.message ?? "Não foi possível atualizar a clínica."
      });
    } finally {
      setEditClinicaLoading(false);
    }
  };

  const handleDeleteClinica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteClinicaTarget) return;

    if (deleteConfirmInput.trim().toLowerCase() !== deleteClinicaTarget.nome.trim().toLowerCase()) {
      toast({
        variant: "destructive",
        title: "Nome incorreto",
        description: "O nome digitado não confere com o nome da clínica para confirmação."
      });
      return;
    }

    try {
      setDeleteClinicaLoading(true);
      const { error } = await supabase
        .from("clinicas")
        .delete()
        .eq("id", deleteClinicaTarget.id);

      if (error) throw error;

      toast({
        title: "Clínica excluída",
        description: "A clínica e todos os seus dados associados foram excluídos com sucesso."
      });

      setDeleteClinicaOpen(false);
      setDeleteClinicaTarget(null);
      setDeleteConfirmInput("");
      clientesQuery.refetch();
    } catch (error: any) {
      console.error("Erro ao excluir clínica:", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir clínica",
        description: error.message ?? "Não foi possível excluir a clínica."
      });
    } finally {
      setDeleteClinicaLoading(false);
    }
  };

  const handleAddClinicaUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinica) return;
    if (!newClinicaUserEmail || !newClinicaUserPassword || !newClinicaUserFullName) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha todos os campos do novo usuário."
      });
      return;
    }

    try {
      setAddingClinicaUser(true);
      const { error } = await supabase.rpc("create_auth_user", {
        _email: newClinicaUserEmail.trim(),
        _password: newClinicaUserPassword,
        _full_name: newClinicaUserFullName.trim(),
        _clinica_id: selectedClinica.id,
        _role: newClinicaUserRole
      });

      if (error) throw error;

      toast({
        title: "Usuário criado",
        description: "Novo usuário cadastrado e vinculado com sucesso!"
      });

      setNewClinicaUserEmail("");
      setNewClinicaUserPassword("");
      setNewClinicaUserFullName("");
      setNewClinicaUserRole("user");

      fetchClinicaUsers(selectedClinica.id);
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      toast({
        variant: "destructive",
        title: "Erro ao criar usuário",
        description: error.message ?? "Não foi possível criar o usuário."
      });
    } finally {
      setAddingClinicaUser(false);
    }
  };

  const handleChangeUserPassword = async (userId: string) => {
    if (!newPasswordForUser || newPasswordForUser.length < 6) {
      toast({
        variant: "destructive",
        title: "Senha inválida",
        description: "A senha deve ter no mínimo 6 caracteres."
      });
      return;
    }

    try {
      setChangingUserPassword(true);
      const { error } = await supabase.rpc("change_user_password", {
        _user_id: userId,
        _new_password: newPasswordForUser
      });

      if (error) throw error;

      toast({
        title: "Senha alterada",
        description: "A senha do usuário foi atualizada com sucesso!"
      });

      setEditingUserPasswordId(null);
      setNewPasswordForUser("");
    } catch (error: any) {
      console.error("Erro ao alterar senha:", error);
      toast({
        variant: "destructive",
        title: "Erro ao alterar senha",
        description: error.message ?? "Não foi possível alterar a senha."
      });
    } finally {
      setChangingUserPassword(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userId === userData.user?.id) {
        toast({
          variant: "destructive",
          title: "Ação não permitida",
          description: "Você não pode excluir o seu próprio usuário logado."
        });
        return;
      }
    } catch {}

    if (!confirm("Tem certeza que deseja excluir permanentemente este usuário?")) {
      return;
    }

    try {
      const { error } = await supabase.rpc("delete_auth_user", {
        _user_id: userId
      });

      if (error) throw error;

      toast({
        title: "Usuário excluído",
        description: "O usuário foi excluído do sistema."
      });

      if (selectedClinica) {
        fetchClinicaUsers(selectedClinica.id);
      }
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir usuário",
        description: error.message ?? "Não foi possível excluir o usuário."
      });
    }
  };

  // Limpar polling ao desmontar ou fechar dialog
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPollingConnection(false);
  }, []);

  // Iniciar polling de estado da conexão
  const startPolling = useCallback(() => {
    if (!clinica?.id) return;
    setPollingConnection(true);

    pollingRef.current = setInterval(async () => {
      try {
        const { state } = await getConnectionState(clinica.id);
        
        if (state === "open") {
          stopPolling();
          setConnectDialogOpen(false);
          setQrImage(null);

          // Buscar número conectado
          const { number } = await fetchInstanceInfo(clinica.id);

          // Atualizar whatsapp_config no Supabase
          await (supabase as any)
            .from("whatsapp_config")
            .upsert({
              clinica_id: clinica.id,
              conectado: true,
              numero: number ?? "Conectado",
              updated_at: new Date().toISOString(),
            }, { onConflict: "clinica_id" });

          // Refetch status
          queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });

          // Se o redirecionamento estiver ativo, registra o webhook na Evolution API
          if (redirecionarAtivo) {
            try {
              await configureWebhook(clinica.id, true);
            } catch (webErr) {
              console.error("[Polling] Erro ao registrar webhook na conexão:", webErr);
            }
          }

          toast({
            title: "WhatsApp conectado!",
            description: number ? `Número ${number} vinculado com sucesso.` : "Conexão realizada com sucesso.",
          });
        }
      } catch (err) {
        console.error("[Polling] Erro:", err);
      }
    }, 5000); // Verificar a cada 5 segundos
  }, [clinica?.id, stopPolling, toast, queryClient, redirecionarAtivo]);

  // Limpar polling ao desmontar componente ou fechar dialog
  useEffect(() => {
    if (!connectDialogOpen) {
      stopPolling();
    }
    return () => stopPolling();
  }, [connectDialogOpen, stopPolling]);

  const handleConnectClick = async () => {
    if (!clinica?.id) {
      toast({ variant: "destructive", title: "Erro", description: "Nenhuma clínica selecionada." });
      return;
    }

    try {
      setConnectLoading(true);
      setQrImage(null);

      // 1. Criar instância (ou reconectar se já existe)
      const result = await createInstance(clinica.id);

      if (!result.qrcode) {
        // Se não retornou QR, pode já estar conectado — verificar
        const { state } = await getConnectionState(clinica.id);
        if (state === "open") {
          toast({ title: "WhatsApp já está conectado!", description: "A instância já está ativa." });
          return;
        }
        // Tentar reconectar para pegar novo QR
        const reconnect = await connectInstance(clinica.id);
        if (!reconnect.qrcode) {
          // Último recurso: apagar e recriar
          await disconnectAndDelete(clinica.id);
          const fresh = await createInstance(clinica.id);
          if (!fresh.qrcode) {
            throw new Error("Não foi possível gerar o QR Code. Tente novamente.");
          }
          const src = fresh.qrcode.startsWith("data:image") ? fresh.qrcode : `data:image/png;base64,${fresh.qrcode}`;
          setQrImage(src);
        } else {
          const src = reconnect.qrcode.startsWith("data:image") ? reconnect.qrcode : `data:image/png;base64,${reconnect.qrcode}`;
          setQrImage(src);
        }
      } else {
        const src = result.qrcode.startsWith("data:image") ? result.qrcode : `data:image/png;base64,${result.qrcode}`;
        setQrImage(src);
      }

      setConnectDialogOpen(true);
      // Iniciar polling para detectar quando escanear
      startPolling();
    } catch (error: any) {
      console.error("Erro ao conectar WhatsApp:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar QR Code",
        description: error?.message ?? "Tente novamente em alguns instantes.",
      });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!clinica?.id) return;

    try {
      setDisconnecting(true);

      // Logout + Delete na Evolution API
      await disconnectAndDelete(clinica.id);

      // Atualizar whatsapp_config no Supabase
      await (supabase as any)
        .from("whatsapp_config")
        .upsert({
          clinica_id: clinica.id,
          conectado: false,
          numero: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "clinica_id" });

      // Refetch status
      queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });

      toast({
        title: "WhatsApp desconectado",
        description: "A instância foi removida. Você pode reconectar a qualquer momento.",
      });
    } catch (error: any) {
      console.error("Erro ao desconectar:", error);
      toast({
        variant: "destructive",
        title: "Erro ao desconectar",
        description: error?.message ?? "Tente novamente.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!clinica?.id) return;
    if (!testNumber) {
      toast({
        variant: "destructive",
        title: "Número obrigatório",
        description: "Por favor, informe o número de WhatsApp para teste.",
      });
      return;
    }
    if (!testMessage) {
      toast({
        variant: "destructive",
        title: "Mensagem obrigatória",
        description: "Por favor, digite a mensagem de teste.",
      });
      return;
    }

    try {
      setSendingTest(true);
      const res = await sendTextMessage(clinica.id, testNumber, testMessage);

      if (res.success) {
        toast({
          title: "Mensagem de teste enviada!",
          description: "Verifique o celular de destino para confirmar se chegou.",
        });
        setTestDialogOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "Falha ao enviar mensagem",
          description: res.error || "Erro desconhecido ao tentar enviar.",
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagem de teste:", error);
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSuggestMessage = () => {
    setRedirecionarMensagem(
      "Olá! Este número é utilizado apenas para envios automáticos e não recebe mensagens ou ligações. 🤖\n\nPara falar com o nosso atendimento, por favor clique no link abaixo:\n{numero_atendimento}"
    );
    toast({
      title: "Sugestão aplicada",
      description: "A mensagem padrão sugerida foi colocada no campo."
    });
  };

  const handleSaveRedirectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinica?.id) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Clínica não identificada."
      });
      return;
    }

    const cleanPhone = redirecionarNumero.replace(/\D/g, "");
    if (redirecionarAtivo && (!cleanPhone || cleanPhone.length < 10)) {
      toast({
        variant: "destructive",
        title: "Número inválido",
        description: "Por favor, insira um número de WhatsApp de destino válido com DDI e DDD (ex: 5511999999999)."
      });
      return;
    }

    try {
      setSavingRedirect(true);

      // 1. Atualizar banco de dados
      const { error } = await (supabase as any)
        .from("whatsapp_config")
        .upsert({
          clinica_id: clinica.id,
          redirecionar_ativo: redirecionarAtivo,
          redirecionar_numero: cleanPhone || null,
          redirecionar_mensagem: redirecionarMensagem || null,
          updated_at: new Date().toISOString()
        }, { onConflict: "clinica_id" });

      if (error) throw error;

      // 2. Se estiver conectado, configurar/sincronizar webhook na Evolution API
      if (whatsappStatus.data?.conectado) {
        const webRes = await configureWebhook(clinica.id, redirecionarAtivo);
        if (!webRes.success) {
          console.warn("Aviso ao configurar webhook na Evolution API:", webRes.error);
        }
      }

      toast({
        title: "Configurações salvas!",
        description: "Redirecionamento automático atualizado com sucesso."
      });

      queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });
    } catch (err: any) {
      console.error("Erro ao salvar configurações de redirecionamento:", err);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message ?? "Não foi possível salvar as configurações de redirecionamento."
      });
    } finally {
      setSavingRedirect(false);
    }
  };

  const handleSaveQueueConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinica?.id) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Clínica não identificada."
      });
      return;
    }

    if (dedupDias < 1 || dedupDias > 365) {
      toast({
        variant: "destructive",
        title: "Valor inválido",
        description: "O período de deduplicação deve ser entre 1 e 365 dias."
      });
      return;
    }

    // Validar horários
    const inicioMatch = horarioInicio.match(/^(\d{2}):(\d{2})$/);
    const fimMatch = horarioFim.match(/^(\d{2}):(\d{2})$/);
    if (!inicioMatch || !fimMatch) {
      toast({
        variant: "destructive",
        title: "Horário inválido",
        description: "Use o formato HH:MM para os horários."
      });
      return;
    }

    const inicioMinutos = parseInt(inicioMatch[1]) * 60 + parseInt(inicioMatch[2]);
    const fimMinutos = parseInt(fimMatch[1]) * 60 + parseInt(fimMatch[2]);
    if (inicioMinutos >= fimMinutos) {
      toast({
        variant: "destructive",
        title: "Horário inválido",
        description: "O horário de início deve ser antes do horário de fim."
      });
      return;
    }

    try {
      setSavingQueueConfig(true);

      const { error } = await (supabase as any)
        .from("whatsapp_config")
        .upsert({
          clinica_id: clinica.id,
          dedup_dias: dedupDias,
          horario_inicio: horarioInicio,
          horario_fim: horarioFim,
          updated_at: new Date().toISOString()
        }, { onConflict: "clinica_id" });

      if (error) throw error;

      toast({
        title: "Configurações salvas!",
        description: "Configurações da fila de envios atualizadas com sucesso."
      });

      queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });
    } catch (err: any) {
      console.error("Erro ao salvar configurações da fila:", err);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message ?? "Não foi possível salvar as configurações da fila."
      });
    } finally {
      setSavingQueueConfig(false);
    }
  };

  const logsQuery = useQuery({
    queryKey: ["webhook_logs"],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<ImportLogItem[]> => {
      const { data, error } = await supabase
        .from("importacoes_historico")
        .select("id, file_name, tipo, created_at, status, origem, n8n_status, n8n_response")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        file_name: string;
        tipo: string | null;
        created_at: string;
        status: string | null;
        origem: string | null;
        n8n_status: string | null;
        n8n_response: unknown;
      }>;

      return rows.map((row) => {
        const createdAt = new Date(row.created_at);
        const dataStr = `${createdAt.toLocaleDateString("pt-BR")} ${createdAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

        let n8nPreview: string | null = null;
        if (row.n8n_response != null) {
          try {
            n8nPreview = JSON.stringify(row.n8n_response).slice(0, 160);
          } catch {
            n8nPreview = String(row.n8n_response).slice(0, 160);
          }
        }

        return {
          id: row.id,
          arquivo: row.file_name,
          tipo: row.tipo ?? "-",
          data: dataStr,
          status: row.status ?? "-",
          origem: row.origem ?? "-",
          n8nStatus: row.n8n_status ?? null,
          n8nPreview,
        };
      });
    },
  });

  const logs = (logsQuery.data ?? []) as ImportLogItem[];
  const loadingLogs = logsQuery.isLoading;
  const logsError = logsQuery.error as Error | null;

  const clientesQuery = useQuery({
    queryKey: ["admin_clientes"],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<ClinicaAdminItem[]> => {
      const { data, error } = await supabase
        .from("clinicas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map((c: any) => {
        let dias_restantes = 0;
        if (c.data_fim_teste) {
          const fim = new Date(c.data_fim_teste);
          const diff = Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          dias_restantes = diff > 0 ? diff : 0;
        }
        return {
          id: c.id,
          nome: c.nome,
          plano: c.plano,
          status_pagamento: c.status_pagamento,
          limite_mensagens: c.limite_mensagens,
          limite_procedimentos: c.limite_procedimentos,
          data_fim_teste: c.data_fim_teste,
          created_at: c.created_at,
          dias_restantes
        };
      });
    },
  });

  const clientesData = (clientesQuery.data ?? []) as ClinicaAdminItem[];

  const mpConfigQuery = useQuery({
    queryKey: ["mp_config"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sistema_pagamento_config")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data || {
        mercado_pago_public_key: "",
        mercado_pago_access_token: "",
        mercado_pago_client_id: "",
        mercado_pago_client_secret: ""
      };
    }
  });

  const pedidosQuery = useQuery({
    queryKey: ["admin_pedidos"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_assinaturas")
        .select("*, clinicas(nome)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    }
  });

  useEffect(() => {
    if (mpConfigQuery.data && !hasInitializedMp) {
      setMpPublicKey(mpConfigQuery.data.mercado_pago_public_key ?? "");
      setMpAccessToken(mpConfigQuery.data.mercado_pago_access_token ?? "");
      setMpClientId(mpConfigQuery.data.mercado_pago_client_id ?? "");
      setMpClientSecret(mpConfigQuery.data.mercado_pago_client_secret ?? "");
      setHasInitializedMp(true);
    }
  }, [mpConfigQuery.data, hasInitializedMp]);

  const handleSaveMpConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingMp(true);
      const { data: currentRows } = await supabase
        .from("sistema_pagamento_config")
        .select("id")
        .limit(1);
      
      const rowId = currentRows?.[0]?.id;

      let error;
      if (rowId) {
        const { error: err } = await supabase
          .from("sistema_pagamento_config")
          .update({
            mercado_pago_public_key: mpPublicKey.trim(),
            mercado_pago_access_token: mpAccessToken.trim(),
            mercado_pago_client_id: mpClientId.trim(),
            mercado_pago_client_secret: mpClientSecret.trim(),
            updated_at: new Date().toISOString()
          })
          .eq("id", rowId);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("sistema_pagamento_config")
          .insert({
            mercado_pago_public_key: mpPublicKey.trim(),
            mercado_pago_access_token: mpAccessToken.trim(),
            mercado_pago_client_id: mpClientId.trim(),
            mercado_pago_client_secret: mpClientSecret.trim(),
          });
        error = err;
      }

      if (error) throw error;
      toast({
        title: "Configurações salvas!",
        description: "As chaves do Mercado Pago foram atualizadas no banco de dados."
      });
      mpConfigQuery.refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message ?? "Não foi possível salvar as configurações do Mercado Pago."
      });
    } finally {
      setSavingMp(false);
    }
  };

  return (
    <AppLayout>
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Configurações</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ajuste preferências da plataforma. {currentUserEmail && (
                <span className="font-semibold text-primary block sm:inline sm:ml-1">
                  Conectado como: {currentUserEmail}
                </span>
              )}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive self-start sm:self-center"
            onClick={handleLogout}
            disabled={loadingLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {loadingLogout ? "Saindo..." : "Sair da plataforma"}
          </Button>
        </div>

        <Dialog open={connectDialogOpen} onOpenChange={(open) => { setConnectDialogOpen(open); if (!open) stopPolling(); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Escaneie o QR Code</DialogTitle>
              <DialogDescription>
                Use o WhatsApp do seu celular para ler o código abaixo e concluir a conexão.
              </DialogDescription>
            </DialogHeader>
            {qrImage ? (
              <div className="space-y-4">
                <div className="flex justify-center py-4">
                  <img
                    src={qrImage}
                    alt="QR Code para conectar WhatsApp"
                    className="h-64 w-64 rounded-md bg-white p-2 shadow"
                  />
                </div>
                {pollingConnection && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Aguardando leitura do QR Code...</span>
                  </div>
                )}
                <div className="space-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Abra o WhatsApp no celular → Menu ⋮ → Dispositivos vinculados → Vincular dispositivo.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Após escanear, a conexão será detectada automaticamente.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <RefreshCcw className="mt-0.5 h-4 w-4 text-primary" />
                    <p>
                      Se o QR expirar, feche e clique em
                      <span className="ml-1 font-medium text-foreground">"Conectar Agora"</span> novamente.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Testar Conexão WhatsApp</DialogTitle>
              <DialogDescription>
                Envie uma mensagem de teste para verificar se o WhatsApp da clínica está conectando e enviando corretamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="test-number">Número do Destinatário</Label>
                <Input
                  id="test-number"
                  type="text"
                  placeholder="Ex: 5511999999999"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  disabled={sendingTest}
                />
                <p className="text-[11px] text-muted-foreground">
                  Insira o número com DDI (55 para Brasil), DDD e número, sem espaços ou traços.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-message">Mensagem de Teste</Label>
                <Textarea
                  id="test-message"
                  placeholder="Digite a mensagem de teste..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  disabled={sendingTest}
                  className="resize-none"
                  rows={4}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-[hsl(var(--login-primary))] text-primary-foreground hover:bg-[hsl(var(--login-primary))]/90"
                disabled={sendingTest}
                onClick={handleSendTestMessage}
              >
                {sendingTest ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando teste...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar Mensagem de Teste
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modais de Gerenciamento de Clínicas / Usuários por Super Admin */}
        {createClinicaOpen && (
          <Dialog open={createClinicaOpen} onOpenChange={setCreateClinicaOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Nova Clínica / Cliente</DialogTitle>
                <DialogDescription>
                  Cadastre uma nova clínica e crie a conta do usuário administrador inicial.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateClinica} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newClinicaNome">Nome da Clínica</Label>
                  <Input
                    id="newClinicaNome"
                    value={newClinicaNome}
                    onChange={(e) => setNewClinicaNome(e.target.value)}
                    placeholder="Ex: Clínica Sorriso"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newClinicaPlano">Plano</Label>
                    <select
                      id="newClinicaPlano"
                      value={newClinicaPlano}
                      onChange={(e: any) => setNewClinicaPlano(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="bronze">Bronze</option>
                      <option value="prata">Prata</option>
                      <option value="ouro">Ouro</option>
                      <option value="ilimitado_premium">Ilimitado Premium</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newClinicaStatus">Status do Pagamento</Label>
                    <select
                      id="newClinicaStatus"
                      value={newClinicaStatus}
                      onChange={(e: any) => setNewClinicaStatus(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="teste_gratis">Teste Grátis</option>
                      <option value="ativo">Ativo</option>
                      <option value="inadimplente">Inadimplente</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newClinicaLimiteMsg">Limite Mensagens</Label>
                    <Input
                      id="newClinicaLimiteMsg"
                      type="number"
                      value={newClinicaLimiteMsg}
                      onChange={(e) => setNewClinicaLimiteMsg(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newClinicaLimiteProc">Limite Procedimentos</Label>
                    <Input
                      id="newClinicaLimiteProc"
                      type="number"
                      value={newClinicaLimiteProc}
                      onChange={(e) => setNewClinicaLimiteProc(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm">Dados do Administrador</h4>
                  <div className="space-y-2">
                    <Label htmlFor="newAdminName">Nome Completo</Label>
                    <Input
                      id="newAdminName"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Nome do dentista / admin"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newAdminEmail">E-mail de Acesso</Label>
                    <Input
                      id="newAdminEmail"
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="email@acesso.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newAdminPassword">Senha Inicial</Label>
                    <Input
                      id="newAdminPassword"
                      type="password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateClinicaOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createClinicaLoading}>
                    {createClinicaLoading ? "Criando..." : "Criar Clínica"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {editClinicaOpen && (
          <Dialog open={editClinicaOpen} onOpenChange={setEditClinicaOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar Clínica: {selectedClinica?.nome}</DialogTitle>
                <DialogDescription>
                  Ajuste os dados da clínica, planos, limites e gerencie as contas de acesso (usuários).
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="dados-clinica" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="dados-clinica">Dados da Clínica</TabsTrigger>
                  <TabsTrigger value="usuarios-clinica">Usuários / Acessos</TabsTrigger>
                </TabsList>

                <TabsContent value="dados-clinica" className="mt-4">
                  <form onSubmit={handleSaveClinica} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="editClinicaNome">Nome da Clínica</Label>
                      <Input
                        id="editClinicaNome"
                        value={editClinicaNome}
                        onChange={(e) => setEditClinicaNome(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="editClinicaPlano">Plano</Label>
                        <select
                          id="editClinicaPlano"
                          value={editClinicaPlano}
                          onChange={(e: any) => setEditClinicaPlano(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="bronze">Bronze</option>
                          <option value="prata">Prata</option>
                          <option value="ouro">Ouro</option>
                          <option value="ilimitado_premium">Ilimitado Premium</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editClinicaStatus">Status do Pagamento</Label>
                        <select
                          id="editClinicaStatus"
                          value={editClinicaStatus}
                          onChange={(e: any) => setEditClinicaStatus(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="teste_gratis">Teste Grátis</option>
                          <option value="ativo">Ativo</option>
                          <option value="inadimplente">Inadimplente</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="editClinicaLimiteMsg">Limite Mensagens</Label>
                        <Input
                          id="editClinicaLimiteMsg"
                          type="number"
                          value={editClinicaLimiteMsg}
                          onChange={(e) => setEditClinicaLimiteMsg(Number(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editClinicaLimiteProc">Limite Procedimentos</Label>
                        <Input
                          id="editClinicaLimiteProc"
                          type="number"
                          value={editClinicaLimiteProc}
                          onChange={(e) => setEditClinicaLimiteProc(Number(e.target.value))}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editClinicaDataFimTeste">Data Fim do Teste (se aplicável)</Label>
                      <Input
                        id="editClinicaDataFimTeste"
                        type="date"
                        value={editClinicaDataFimTeste}
                        onChange={(e) => setEditClinicaDataFimTeste(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setEditClinicaOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={editClinicaLoading}>
                        {editClinicaLoading ? "Salvando..." : "Salvar Alterações"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="usuarios-clinica" className="mt-4 space-y-6">
                  {/* Listagem de Usuários da Clínica */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Usuários Cadastrados</h4>
                    <div className="rounded-md border bg-card overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Função (DB)</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingClinicaUsers && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                                Carregando usuários...
                              </TableCell>
                            </TableRow>
                          )}
                          {!loadingClinicaUsers && clinicaUsers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                                Nenhum usuário cadastrado para esta clínica.
                              </TableCell>
                            </TableRow>
                          )}
                          {!loadingClinicaUsers &&
                            clinicaUsers.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="text-xs">
                                  <p className="font-medium text-foreground">{user.full_name || "(Sem nome)"}</p>
                                  <span className="text-[10px] text-muted-foreground block font-mono mt-0.5">ID: {user.id}</span>
                                </TableCell>
                                <TableCell className="text-xs uppercase font-medium">
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {user.role}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {editingUserPasswordId === user.id ? (
                                    <div className="inline-flex gap-1.5 items-center justify-end">
                                      <Input
                                        type="password"
                                        placeholder="Nova senha"
                                        value={newPasswordForUser}
                                        onChange={(e) => setNewPasswordForUser(e.target.value)}
                                        className="h-7 w-28 text-xs bg-background"
                                        minLength={6}
                                      />
                                      <Button
                                        size="sm"
                                        className="h-7 px-2 text-[10px] bg-primary text-primary-foreground"
                                        onClick={() => handleChangeUserPassword(user.id)}
                                        disabled={changingUserPassword}
                                      >
                                        Salvar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-[10px]"
                                        onClick={() => {
                                          setEditingUserPasswordId(null);
                                          setNewPasswordForUser("");
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1 justify-end">
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        title="Alterar Senha"
                                        onClick={() => {
                                          setEditingUserPasswordId(user.id);
                                          setNewPasswordForUser("");
                                        }}
                                      >
                                        <Key className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="destructive"
                                        className="h-7 w-7"
                                        title="Excluir Usuário"
                                        onClick={() => handleDeleteUser(user.id)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Formulário para Adicionar Usuário à Clínica */}
                  <Card className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-xs font-semibold">Adicionar Novo Usuário à Clínica</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <form onSubmit={handleAddClinicaUser} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="newUserFullName" className="text-xs">Nome Completo</Label>
                            <Input
                              id="newUserFullName"
                              placeholder="Ex: Maria Souza"
                              value={newClinicaUserFullName}
                              onChange={(e) => setNewClinicaUserFullName(e.target.value)}
                              className="h-8 text-xs bg-background"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="newUserRole" className="text-xs">Função (Role)</Label>
                            <select
                              id="newUserRole"
                              value={newClinicaUserRole}
                              onChange={(e: any) => setNewClinicaUserRole(e.target.value)}
                              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="admin">Administrador (Clínica)</option>
                              <option value="user">Colaborador / Recepção</option>
                              <option value="super_admin">Super Administrador (Geral)</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="newUserEmail" className="text-xs">E-mail</Label>
                            <Input
                              id="newUserEmail"
                              type="email"
                              placeholder="email@acesso.com"
                              value={newClinicaUserEmail}
                              onChange={(e) => setNewClinicaUserEmail(e.target.value)}
                              className="h-8 text-xs bg-background"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="newUserPassword" className="text-xs">Senha</Label>
                            <Input
                              id="newUserPassword"
                              type="password"
                              placeholder="Mínimo 6 chars"
                              value={newClinicaUserPassword}
                              onChange={(e) => setNewClinicaUserPassword(e.target.value)}
                              className="h-8 text-xs bg-background"
                              minLength={6}
                              required
                            />
                          </div>
                        </div>
                        <div className="flex justify-end pt-1 pb-1">
                          <Button type="submit" size="sm" className="text-xs flex items-center gap-1" disabled={addingClinicaUser}>
                            <Plus className="h-3.5 w-3.5" />
                            {addingClinicaUser ? "Adicionando..." : "Adicionar Usuário"}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end pt-2">
                    <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setEditClinicaOpen(false)}>
                      Fechar
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        {deleteClinicaOpen && deleteClinicaTarget && (
          <Dialog open={deleteClinicaOpen} onOpenChange={setDeleteClinicaOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Excluir Clínica
                </DialogTitle>
                <DialogDescription>
                  Esta ação é irreversível e excluirá permanentemente a clínica <strong>{deleteClinicaTarget.nome}</strong>, todos os seus pacientes, procedimentos, configurações de WhatsApp e usuários de acesso.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleDeleteClinica} className="space-y-4 pt-2">
                <div className="space-y-2 text-sm">
                  <p>Para confirmar, digite o nome completo da clínica abaixo:</p>
                  <p className="font-mono bg-muted p-2 rounded text-center select-none text-foreground font-semibold">
                    {deleteClinicaTarget.nome}
                  </p>
                  <Input
                    placeholder="Digite o nome da clínica exatamente como acima"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeleteClinicaOpen(false);
                      setDeleteClinicaTarget(null);
                      setDeleteConfirmInput("");
                    }}
                    disabled={deleteClinicaLoading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={deleteClinicaLoading || deleteConfirmInput.trim().toLowerCase() !== deleteClinicaTarget.nome.trim().toLowerCase()}
                  >
                    {deleteClinicaLoading ? "Excluindo..." : "Sim, excluir tudo"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        <Tabs
          defaultValue={(new URLSearchParams(location.search).get("tab") as "perfil" | "geral" | "logs") ?? "perfil"}
          className="w-full"
        >
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="perfil">Dados de perfil</TabsTrigger>
            <TabsTrigger value="geral">WhatsApp</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="clientes">
                Gerenciar Clientes
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="logs">
                Logs de importação
              </TabsTrigger>
            )}
            <TabsTrigger value="sistema">
              Sistema
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="mercado-pago">
                Configuração Mercado Pago
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="pedidos">
                Pedidos & Cobrança
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="perfil" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Dados de perfil</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo</Label>
                    <Input id="nome" name="nome" placeholder="Digite seu nome" value={currentUserName} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" placeholder="seuemail@clinica.com" value={currentUserEmail} readOnly />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="clinica">Nome da clínica</Label>
                    <Input id="clinica" name="clinica" placeholder="Nome fantasia da clínica" value={clinicaNome} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone da clínica</Label>
                    <Input id="telefone" name="telefone" type="tel" placeholder="(00) 0000-0000" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp de contato</Label>
                    <Input id="whatsapp" name="whatsapp" type="tel" placeholder="(00) 00000-0000" disabled />
                  </div>
                  <p className="col-span-full text-xs text-muted-foreground">
                    Estes dados são carregados a partir da sua conta Supabase ativa.
                  </p>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geral" className="mt-4 space-y-4">
            <Card id="whatsapp-config">
              <CardHeader className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Status da integração WhatsApp</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {(whatsappStatus.data?.conectado ?? false) && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setTestDialogOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full border-green-500/50 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50/50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Testar Conexão</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disconnecting}
                        onClick={handleDisconnectWhatsApp}
                        className="inline-flex items-center gap-1.5 rounded-full border-destructive/50 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-70"
                      >
                        {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WifiOff className="h-3.5 w-3.5" />}
                        <span>{disconnecting ? "Desconectando..." : "Desconectar"}</span>
                      </Button>
                    </>
                  )}
                  {!(whatsappStatus.data?.conectado ?? false) && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={connectLoading}
                      onClick={handleConnectClick}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--login-primary))] px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm shadow-[hsl(var(--login-primary))]/60 transition hover:shadow-md disabled:opacity-70"
                    >
                      {connectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                      <span>{connectLoading ? "Gerando QR Code..." : "Conectar Agora"}</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Veja abaixo se o WhatsApp da clínica está conectado. Ao desconectar, a instância é removida e um novo QR Code será gerado na próxima conexão.
                </p>
                <div className="overflow-x-auto rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Última atualização</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whatsappStatus.isLoading && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                            Carregando status do WhatsApp…
                          </TableCell>
                        </TableRow>
                      )}

                      {whatsappStatus.isError && !whatsappStatus.isLoading && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-destructive">
                            Erro ao carregar status. Tente novamente em alguns instantes.
                          </TableCell>
                        </TableRow>
                      )}

                      {!whatsappStatus.isLoading && !whatsappStatus.isError && !whatsappStatus.data && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                            Nenhum WhatsApp conectado. Clique em "Conectar Agora" para vincular.
                          </TableCell>
                        </TableRow>
                      )}

                      {!whatsappStatus.isLoading && !whatsappStatus.isError && whatsappStatus.data && (
                        <TableRow>
                          <TableCell className="text-xs text-foreground/80">
                            {whatsappStatus.data.numero ?? "Não informado"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant={whatsappStatus.data.conectado ? "default" : "destructive"}
                              className={`text-[10px] font-normal ${whatsappStatus.data.conectado ? 'bg-green-500 hover:bg-green-600' : ''}`}
                            >
                              {whatsappStatus.data.conectado ? (
                                <><Wifi className="mr-1 h-3 w-3" /> Conectado</>
                              ) : (
                                <><WifiOff className="mr-1 h-3 w-3" /> Desconectado</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {whatsappStatus.data.updated_at
                              ? new Date(whatsappStatus.data.updated_at).toLocaleString("pt-BR")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-primary" />
                  <span>Redirecionamento Automático e Triangulação (WhatsApp sem Atendimento)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Se este número de WhatsApp não possui atendimento humano, ative o redirecionamento.
                  Quando um cliente enviar qualquer mensagem ou áudio, o sistema responderá automaticamente direcionando-o para o número correto via link clicável, e enviará uma notificação ao seu atendimento para alertá-los sobre o contato.
                </p>

                <form onSubmit={handleSaveRedirectSettings} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="redirect-ativo" className="text-sm font-medium">
                        Ativar Redirecionamento Automático
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Responde ao cliente após 7 a 15 segundos e encaminha a notificação ao atendimento.
                      </p>
                    </div>
                    <Switch
                      id="redirect-ativo"
                      checked={redirecionarAtivo}
                      onCheckedChange={setRedirecionarAtivo}
                    />
                  </div>

                  {redirecionarAtivo && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label htmlFor="redirect-numero" className="text-sm font-medium">
                          Número de WhatsApp para Atendimento (Destino)
                        </Label>
                        <Input
                          id="redirect-numero"
                          type="tel"
                          placeholder="Ex: 5511999999999"
                          value={redirecionarNumero}
                          onChange={(e) => setRedirecionarNumero(e.target.value)}
                          className="max-w-md"
                          required={redirecionarAtivo}
                        />
                        <p className="text-xs text-muted-foreground">
                          Digite o número completo com DDI (55 para Brasil) e DDD. Somente números.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="redirect-mensagem" className="text-sm font-medium">
                            Frase / Mensagem de Redirecionamento
                          </Label>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="text-xs h-auto p-0"
                            onClick={handleSuggestMessage}
                          >
                            Restaurar Sugestão Padrão
                          </Button>
                        </div>
                        <Textarea
                          id="redirect-mensagem"
                          rows={4}
                          placeholder="Digite a mensagem automática de redirecionamento..."
                          value={redirecionarMensagem}
                          onChange={(e) => setRedirecionarMensagem(e.target.value)}
                          required={redirecionarAtivo}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use a tag <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">{`{numero_atendimento}`}</code> no local onde deseja exibir o link direto para o novo WhatsApp.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingRedirect} size="sm">
                      {savingRedirect ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Configurações de Redirecionamento</span>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <span>Configurações da Fila de Envios</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Configure as regras de envio automático de mensagens. O sistema gera a fila de envios automaticamente todos os dias às 7h da manhã e inicia o disparo às 8h, com intervalo de 1 a 2 minutos entre cada mensagem para evitar bloqueios.
                </p>

                <form onSubmit={handleSaveQueueConfig} className="space-y-5">
                  {/* Dedup */}
                  <div className="space-y-2">
                    <Label htmlFor="dedup-dias" className="text-sm font-medium">
                      Período de proteção contra duplicatas
                    </Label>
                    <div className="flex items-center gap-2 max-w-xs">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Não enviar para a mesma pessoa dentro de</span>
                      <Input
                        id="dedup-dias"
                        type="number"
                        min={1}
                        max={365}
                        value={dedupDias}
                        onChange={(e) => setDedupDias(parseInt(e.target.value) || 30)}
                        className="w-20 text-center"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">dias</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Impede que o mesmo paciente receba múltiplas mensagens dentro do período definido, independente da campanha.
                    </p>
                  </div>

                  {/* Janela de horário */}
                  <div className="space-y-2 border-t pt-4">
                    <Label className="text-sm font-medium">
                      Janela de horário para envios
                    </Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Enviar mensagens apenas entre</span>
                      <Input
                        id="horario-inicio"
                        type="time"
                        value={horarioInicio}
                        onChange={(e) => setHorarioInicio(e.target.value)}
                        className="w-28 text-center"
                      />
                      <span className="text-xs text-muted-foreground">e</span>
                      <Input
                        id="horario-fim"
                        type="time"
                        value={horarioFim}
                        onChange={(e) => setHorarioFim(e.target.value)}
                        className="w-28 text-center"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Mensagens programadas fora desta janela serão enviadas automaticamente quando o horário permitido iniciar no próximo dia.
                    </p>
                  </div>

                  {/* Info box */}
                  <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Como funciona o agendamento automático
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                      <li>Todos os dias às <strong>7h da manhã</strong>, o sistema verifica campanhas ativas e agenda envios para os próximos 30 dias</li>
                      <li>O disparo inicia às <strong>{horarioInicio || "08:00"}</strong> e encerra às <strong>{horarioFim || "20:00"}</strong></li>
                      <li>Cada mensagem é enviada com intervalo de <strong>1 a 2 minutos</strong> para evitar bloqueios do WhatsApp</li>
                      <li>Pacientes que receberam mensagem nos últimos <strong>{dedupDias} dias</strong> são ignorados automaticamente</li>
                    </ul>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingQueueConfig} size="sm">
                      {savingQueueConfig ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Configurações da Fila</span>
                      )}
                    </Button>
                  </div>
                </form>

                {/* ═══ BOTÃO GERAR FILA AGORA ═══ */}
                <GerarFilaSection />
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="clientes" className="mt-4">
            {!isSuperAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Acesso restrito</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Acesso exclusivo para Super Admins.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground font-sans">Gestão de Clientes</h2>
                    <p className="text-xs text-muted-foreground">Crie e edite clínicas e seus respectivos usuários.</p>
                  </div>
                  <Button 
                    size="sm" 
                    className="flex items-center gap-1 text-xs px-3 h-8 bg-primary text-primary-foreground"
                    onClick={() => setCreateClinicaOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Nova Clínica</span>
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total de Clínicas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{clientesData.length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Planos Pagos Ativos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-primary">{clientesData.filter(c => c.status_pagamento === 'ativo').length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Em Período de Teste</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-secondary">{clientesData.filter(c => c.status_pagamento === 'teste_gratis').length}</div>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Todas as Clínicas (Dashboard Admin)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md border bg-card">
                      <ScrollArea className="h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Clínica</TableHead>
                              <TableHead className="hidden sm:table-cell">Cadastro</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden md:table-cell">Plano</TableHead>
                              <TableHead className="hidden md:table-cell">Fim do Trial</TableHead>
                              <TableHead className="hidden lg:table-cell">Mensagens / Proc.</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientesQuery.isLoading && (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">Carregando clientes...</TableCell>
                              </TableRow>
                            )}
                            {!clientesQuery.isLoading && clientesData.map((cliente) => (
                              <TableRow key={cliente.id}>
                                <TableCell className="font-medium text-xs">
                                  <p>{cliente.nome}</p>
                                  <span className="text-[9px] text-muted-foreground font-mono block mt-0.5">{cliente.id}</span>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                                  {new Date(cliente.created_at).toLocaleDateString("pt-BR")}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={cliente.status_pagamento === 'ativo' ? 'default' : cliente.status_pagamento === 'inadimplente' ? 'destructive' : 'secondary'}
                                    className="text-[10px] font-normal"
                                  >
                                    {cliente.status_pagamento.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                </TableCell>
                                 <TableCell className="hidden md:table-cell text-xs font-medium">
                                   {cliente.plano === 'ilimitado_premium' ? 'Ilimitado Premium' : 
                                    (cliente.plano === 'bronze' ? 'Bronze' : 
                                     (cliente.plano === 'prata' ? 'Prata' : 
                                      (cliente.plano === 'ouro' ? 'Ouro' : cliente.plano.toUpperCase())))}
                                 </TableCell>
                                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                  {cliente.data_fim_teste ? (
                                    <>
                                      {new Date(cliente.data_fim_teste).toLocaleDateString("pt-BR")}
                                      {cliente.status_pagamento === 'teste_gratis' && (
                                        <span className={`ml-2 font-medium text-[10px] ${cliente.dias_restantes! > 0 ? 'text-secondary' : 'text-destructive'}`}>
                                          ({cliente.dias_restantes} dias)
                                        </span>
                                      )}
                                    </>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                                  {cliente.limite_mensagens} / {cliente.limite_procedimentos}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      variant="outline"
                                      className="h-7 px-2.5 text-xs flex gap-1 items-center justify-center border-primary/50 text-primary hover:bg-primary/10"
                                      onClick={() => {
                                        localStorage.setItem("impersonated_clinica_id", cliente.id);
                                        toast({
                                          title: "Visualizando clínica",
                                          description: `Você agora está visualizando o painel de ${cliente.nome}.`
                                        });
                                        setTimeout(() => {
                                          navigate("/app");
                                          window.location.reload();
                                        }, 1000);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      Visualizar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="h-7 px-2.5 text-xs flex gap-1 items-center justify-center"
                                      onClick={() => {
                                        setSelectedClinica(cliente);
                                        setEditClinicaNome(cliente.nome);
                                        setEditClinicaPlano(cliente.plano);
                                        setEditClinicaStatus(cliente.status_pagamento);
                                        setEditClinicaLimiteMsg(cliente.limite_mensagens);
                                        setEditClinicaLimiteProc(cliente.limite_procedimentos);
                                        setEditClinicaDataFimTeste(cliente.data_fim_teste ? cliente.data_fim_teste.split("T")[0] : "");
                                        setEditClinicaOpen(true);
                                      }}
                                    >
                                      <Edit className="h-3 w-3" />
                                      Editar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="h-7 px-2.5 text-xs flex gap-1 items-center justify-center border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => {
                                        setDeleteClinicaTarget(cliente);
                                        setDeleteConfirmInput("");
                                        setDeleteClinicaOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Excluir
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            {!isSuperAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Acesso restrito</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Apenas usuários super admin podem visualizar os logs detalhados de importação e chamadas ao
                    webhook.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Logs de importação e chamadas ao webhook</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Cada linha representa um clique no botão de importação (clientes/procedimentos), com o arquivo
                    enviado, origem, status interno e o status retornado pelo webhook (quando disponível).
                  </p>
                  <div className="mt-2 overflow-x-auto rounded-md border bg-card">
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Arquivo</TableHead>
                            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                            <TableHead className="hidden sm:table-cell">Origem</TableHead>
                            <TableHead className="hidden md:table-cell">Status interno</TableHead>
                            <TableHead className="hidden md:table-cell">Status n8n</TableHead>
                            <TableHead className="hidden lg:table-cell">Prévia da resposta</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingLogs && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                Carregando logs de importação…
                              </TableCell>
                            </TableRow>
                          )}
                          {logsError && !loadingLogs && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-xs text-destructive">
                                Erro ao carregar logs. Tente novamente em alguns instantes.
                              </TableCell>
                            </TableRow>
                          )}
                          {!loadingLogs && !logsError && (!logs || logs.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                Nenhum log registrado ainda.
                              </TableCell>
                            </TableRow>
                          )}
                          {!loadingLogs && !logsError && logs &&
                            logs.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="whitespace-nowrap text-xs">{item.data}</TableCell>
                                <TableCell className="max-w-[220px] truncate text-xs" title={item.arquivo}>
                                  {item.arquivo}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-xs">{item.tipo}</TableCell>
                                <TableCell className="hidden sm:table-cell text-xs">{item.origem}</TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <Badge
                                    variant={item.status.toLowerCase().startsWith("erro") ? "destructive" : "default"}
                                    className="text-[10px] font-normal"
                                  >
                                    {item.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-xs">
                                  {item.n8nStatus ? (
                                    <Badge
                                      variant={item.n8nStatus.startsWith("2") ? "default" : "destructive"}
                                      className="text-[10px] font-normal"
                                    >
                                      {item.n8nStatus}
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell max-w-[260px] truncate text-[11px] text-muted-foreground" title={
                                  item.n8nPreview ?? undefined
                                }>
                                  {item.n8nPreview ?? "(sem conteúdo registrado)"}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sistema" className="mt-4">
            <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  <span>Integração Easy Dental</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 space-y-1">
                  <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Conexão segura com Easy Dental Cloud
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Suas credenciais são armazenadas de forma segura e utilizadas apenas para baixar automaticamente os relatórios de clientes e procedimentos do Easy Dental.
                  </p>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!clinica?.id) {
                    toast({ variant: "destructive", title: "Erro", description: "Clínica não identificada." });
                    return;
                  }
                  if (!easydentalUsuario.trim() || !easydentalSenha) {
                    toast({ variant: "destructive", title: "Campos obrigatórios", description: "Preencha o email e a senha do Easy Dental." });
                    return;
                  }
                  try {
                    setSavingEasydental(true);
                    const updateData: any = {
                      clinica_id: clinica.id,
                      easydental_url: "https://app.easydentalcloud.com.br/",
                      easydental_usuario: easydentalUsuario.trim(),
                      updated_at: new Date().toISOString()
                    };
                    // Só envia a senha se foi alterada (não é o placeholder)
                    if (easydentalSenha !== SENHA_PLACEHOLDER) {
                      updateData.easydental_senha = easydentalSenha;
                    }
                    const { error } = await (supabase as any)
                      .from("whatsapp_config")
                      .upsert(updateData, { onConflict: "clinica_id" });
                    if (error) throw error;
                    toast({ title: "Credenciais salvas!", description: "Dados do Easy Dental salvos com sucesso." });
                    // Resetar para placeholder após salvar
                    if (easydentalSenha !== SENHA_PLACEHOLDER) {
                      setEasydentalSenha(SENHA_PLACEHOLDER);
                    }
                    queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });
                  } catch (err: any) {
                    console.error("Erro ao salvar Easy Dental:", err);
                    toast({ variant: "destructive", title: "Erro ao salvar", description: err.message ?? "Não foi possível salvar." });
                  } finally {
                    setSavingEasydental(false);
                  }
                }} className="space-y-4">

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/50 rounded-md px-3 py-2">
                    <Monitor className="h-3.5 w-3.5" />
                    <span className="font-mono">https://app.easydentalcloud.com.br/</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="easydental-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="easydental-email"
                        type="email"
                        placeholder="seuemail@clinica.com.br"
                        value={easydentalUsuario}
                        onChange={(e) => setEasydentalUsuario(e.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="easydental-senha" className="text-sm font-medium">
                        Senha
                      </Label>
                      <Input
                        id="easydental-senha"
                        type="password"
                        placeholder={hasSavedPassword ? "Senha salva — clique para alterar" : "••••••••"}
                        value={hasSavedPassword ? "" : easydentalSenha}
                        onChange={(e) => setEasydentalSenha(e.target.value)}
                        onFocus={() => { if (hasSavedPassword) setEasydentalSenha(""); }}
                        autoComplete="new-password"
                      />
                      {hasSavedPassword && (
                        <p className="text-[10px] text-muted-foreground">✓ Senha salva. Digite uma nova senha apenas se quiser alterá-la.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="submit" disabled={savingEasydental} size="sm">
                      {savingEasydental ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Credenciais</span>
                      )}
                    </Button>
                  </div>
                </form>

                {easydentalUsuario && easydentalSenha && (
                  <SyncNowSection clinicaId={whatsappStatus.data?.clinica_id} ultimaSync={whatsappStatus.data?.ultima_sync_sucesso} />
                )}

                {/* ═══ LOGS DE INTEGRAÇÃO ═══ */}
                {easydentalUsuario && easydentalSenha && (
                  <SyncLogsSection clinicaId={whatsappStatus.data?.clinica_id} ultimaSync={whatsappStatus.data?.ultima_sync_sucesso} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="mercado-pago" className="mt-4">
              <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <span>Configuração do Mercado Pago (Gateway)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" />
                      Credenciais da Plataforma
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Estas credenciais são usadas para receber pagamentos de assinaturas mensais e pagamentos avulsos das clínicas.
                    </p>
                  </div>

                  <form onSubmit={handleSaveMpConfig} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="mp-public-key" className="text-sm font-medium">
                          Public Key
                        </Label>
                        <Input
                          id="mp-public-key"
                          placeholder="APP_USR-..."
                          value={mpPublicKey}
                          onChange={(e) => setMpPublicKey(e.target.value)}
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mp-access-token" className="text-sm font-medium">
                          Access Token
                        </Label>
                        <Input
                          id="mp-access-token"
                          type="password"
                          placeholder="APP_USR-..."
                          value={mpAccessToken}
                          onChange={(e) => setMpAccessToken(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={savingMp} size="sm">
                        {savingMp ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <span>Salvar Configurações</span>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="pedidos" className="mt-4">
              <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <span>Pedidos e Faturamento Geral</span>
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs"
                    onClick={() => pedidosQuery.refetch()}
                  >
                    <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                    Atualizar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pedidosQuery.isLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-md border bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Clínica</TableHead>
                            <TableHead>Plano</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>IDs Mercado Pago</TableHead>
                            <TableHead>Data Pagamento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pedidosQuery.data?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground p-8">
                                Nenhum pedido encontrado no sistema.
                              </TableCell>
                            </TableRow>
                          ) : (
                            pedidosQuery.data?.map((p: any) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium text-xs">
                                  {p.clinicas?.nome || "Desconhecida"}
                                </TableCell>
                                <TableCell className="text-xs capitalize">{p.plano}</TableCell>
                                <TableCell className="text-xs font-semibold">
                                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.valor)}
                                </TableCell>
                                <TableCell className="text-xs capitalize">{p.metodo_pagamento || "—"}</TableCell>
                                <TableCell>
                                  <Badge 
                                    className="text-[10px]"
                                    variant={p.status === "pago" || p.status === "approved" ? "default" : "destructive"}
                                  >
                                    {p.status === "pago" || p.status === "approved" ? "Pago" : p.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] font-mono max-w-[200px] truncate">
                                  <div className="flex flex-col gap-0.5">
                                    {p.id_transacao_mp && (
                                      <div><span className="text-muted-foreground">Trans:</span> {p.id_transacao_mp}</div>
                                    )}
                                    {p.id_assinatura_mp && (
                                      <div><span className="text-muted-foreground">Assin:</span> {p.id_assinatura_mp}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {p.data_pagamento ? new Date(p.data_pagamento).toLocaleString("pt-BR") : new Date(p.created_at).toLocaleString("pt-BR")}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </section>
    </AppLayout>
  );
};

// ══════════════════════════════════════════════════════════════
// Componente — Botão Gerar Fila Agora
// ══════════════════════════════════════════════════════════════

interface FilaResult {
  status: 'idle' | 'generating' | 'success' | 'error';
  message?: string;
  procedimentos?: number;
  aniversario_dia?: number;
  aniversario_mes?: number;
  total?: number;
}

function GerarFilaSection() {
  const [result, setResult] = useState<FilaResult>({ status: 'idle' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleGerar = async () => {
    if (result.status === 'generating') return;
    setResult({ status: 'generating', message: 'Analisando campanhas ativas...' });

    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(
        'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/gerar-fila-diaria',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6YmVvcmZrdWFsYWxvY3J2b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MjIyMTUsImV4cCI6MjA4MjE5ODIxNX0.CbV28UokExWE0XtqJx-fwgdMN7qtd-x_-K77j2bBeqc'}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        const clinica = data.clinicas?.[0] || {};
        setResult({
          status: 'success',
          procedimentos: clinica.procedimentos || 0,
          aniversario_dia: clinica.aniversario_dia || 0,
          aniversario_mes: clinica.aniversario_mes || 0,
          total: data.total_mensagens || 0,
        });
        toast({ title: `✅ Fila gerada: ${data.total_mensagens} mensagens` });
        queryClient.invalidateQueries({ queryKey: ['fila_envios'] });
      } else {
        setResult({ status: 'error', message: data.error || 'Erro na geração' });
        toast({ title: '❌ Erro ao gerar fila', variant: 'destructive' });
      }
    } catch (err: any) {
      setResult({ status: 'error', message: err.message });
      toast({ title: '❌ Falha na conexão', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Gerar Fila Manualmente</p>
          <p className="text-[11px] text-muted-foreground">
            Força a geração de envios para os próximos 30 dias baseado nas campanhas ativas.
          </p>
        </div>
        <Button
          size="sm"
          variant={result.status === 'generating' ? 'secondary' : 'outline'}
          disabled={result.status === 'generating'}
          onClick={handleGerar}
          className="shrink-0"
        >
          {result.status === 'generating' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Gerar Fila Agora
            </>
          )}
        </Button>
      </div>

      {result.status === 'generating' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 animate-pulse">
          <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {result.message}
          </p>
        </div>
      )}

      {result.status === 'success' && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 space-y-2">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Fila gerada — {result.total} mensagens agendadas
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{result.procedimentos}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Procedimentos</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{result.aniversario_dia}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Aniv. Dia</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{result.aniversario_mes}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Aniv. Mês</p>
            </div>
          </div>
        </div>
      )}

      {result.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400 font-medium">⚠️ Erro: {result.message}</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Componente — Botão Sincronizar Agora + Resultado
// ══════════════════════════════════════════════════════════════

interface SyncResult {
  status: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
  pacientesNovos?: number;
  pacientesAtualizados?: number;
  procedimentos?: number;
  duracao?: number;
}

function SyncNowSection({ clinicaId, ultimaSync }: { clinicaId?: string; ultimaSync?: string | null }) {
  const [syncResult, setSyncResult] = useState<SyncResult>({ status: 'idle' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSync = async () => {
    if (!clinicaId || syncResult.status === 'syncing') return;
    setSyncResult({ status: 'syncing', message: 'Conectando ao Easy Dental...' });

    try {
      const res = await fetch(
        'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/easydental-sync',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ clinica_id: clinicaId }),
        }
      );

      const data = await res.json();

      if (res.ok && data.status === 'sucesso') {
        setSyncResult({
          status: 'success',
          pacientesNovos: data.pacientes_novos || 0,
          pacientesAtualizados: data.pacientes_atualizados || 0,
          procedimentos: data.procedimentos || 0,
          duracao: data.duracao || 0,
        });
        toast({ title: '✅ Sincronização concluída!' });
        // Revalidar dados
        queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
      } else {
        setSyncResult({
          status: 'error',
          message: data.error || data.message || 'Erro desconhecido na sincronização',
        });
        toast({ title: '❌ Erro na sincronização', description: data.error || 'Tente novamente', variant: 'destructive' });
      }
    } catch (err: any) {
      setSyncResult({
        status: 'error',
        message: err.message || 'Falha na conexão',
      });
      toast({ title: '❌ Falha na conexão', variant: 'destructive' });
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch { return d; }
  };

  return (
    <div className="space-y-3">
      {/* Status + Botão */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Credenciais configuradas
          </p>
          {ultimaSync && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Última sync: {formatDate(ultimaSync)}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant={syncResult.status === 'syncing' ? 'secondary' : 'default'}
          disabled={syncResult.status === 'syncing'}
          onClick={handleSync}
          className="shrink-0"
        >
          {syncResult.status === 'syncing' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Sincronizar Agora
            </>
          )}
        </Button>
      </div>

      {/* Progresso */}
      {syncResult.status === 'syncing' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 animate-pulse">
          <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {syncResult.message || 'Processando...'}
          </p>
          <p className="text-[10px] text-blue-600/60 dark:text-blue-400/50 mt-1">
            Isso pode levar até 1 minuto. Fazendo login, baixando e importando dados...
          </p>
        </div>
      )}

      {/* Resultado Sucesso */}
      {syncResult.status === 'success' && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 space-y-2">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Sincronização concluída!
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{syncResult.pacientesNovos}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Pacientes novos</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{syncResult.pacientesAtualizados}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Atualizados</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-100 dark:border-green-800 p-2 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{syncResult.procedimentos}</p>
              <p className="text-[10px] text-green-600/70 dark:text-green-400/60">Procedimentos</p>
            </div>
          </div>
          {syncResult.duracao !== undefined && (
            <p className="text-[10px] text-green-600/60 dark:text-green-400/40 text-right">
              Concluído em {syncResult.duracao}s
            </p>
          )}
        </div>
      )}

      {/* Resultado Erro */}
      {syncResult.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
          <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5 font-medium">
            ⚠️ Erro na sincronização
          </p>
          <p className="text-[10px] text-red-600/70 dark:text-red-400/60 mt-1">
            {syncResult.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Componente — Logs de Integração Easy Dental
// ══════════════════════════════════════════════════════════════

interface SyncLog {
  id: string;
  tipo: string;
  status: string;
  pacientes_importados: number;
  procedimentos_importados: number;
  erro_mensagem: string | null;
  duracao_segundos: number | null;
  created_at: string;
}

function SyncLogsSection({ clinicaId, ultimaSync }: { clinicaId?: string; ultimaSync?: string | null }) {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("sync_logs")
        .select("*")
        .eq("clinica_id", clinicaId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (!error && data) setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!showLogs) loadLogs();
    setShowLogs(!showLogs);
  };

  // Calcular dias desde última sync
  const diasSemSync = ultimaSync
    ? Math.floor((Date.now() - new Date(ultimaSync).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch { return d; }
  };

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
      {/* Indicador de última sincronização */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Última sincronização</span>
        </div>
        <div className="flex items-center gap-2">
          {ultimaSync ? (
            <>
              <Badge variant={diasSemSync !== null && diasSemSync >= 7 ? "destructive" : "secondary"} className="text-xs">
                {diasSemSync !== null && diasSemSync >= 7
                  ? `⚠️ ${diasSemSync} dias atrás`
                  : diasSemSync === 0
                    ? "Hoje"
                    : diasSemSync === 1
                      ? "Ontem"
                      : `${diasSemSync} dias atrás`}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(ultimaSync)}</span>
            </>
          ) : (
            <Badge variant="outline" className="text-xs">Nunca sincronizado</Badge>
          )}
        </div>
      </div>

      {/* Alerta de integração parada */}
      {diasSemSync !== null && diasSemSync >= 7 && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3">
          <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5 font-medium">
            ⚠️ A integração está parada há {diasSemSync} dias. Verifique se as credenciais estão corretas.
          </p>
        </div>
      )}

      {/* Botão Ver Logs */}
      <Button variant="outline" size="sm" onClick={handleToggle} className="w-full">
        <Clock className="mr-2 h-4 w-4" />
        {showLogs ? "Ocultar Logs" : "Ver Logs de Integração"}
      </Button>

      {/* Tabela de Logs */}
      {showLogs && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <ScrollArea className="max-h-[350px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[140px]">Data/Hora</TableHead>
                  <TableHead className="text-xs w-[80px]">Status</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">Pacientes</TableHead>
                  <TableHead className="text-xs w-[100px] text-center">Procedimentos</TableHead>
                  <TableHead className="text-xs w-[60px] text-center">Tempo</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                      Nenhum log de integração encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{formatDate(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={log.status === "sucesso" ? "default" : log.status === "parcial" ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {log.status === "sucesso" ? "✅ Sucesso" : log.status === "parcial" ? "⚠️ Parcial" : "❌ Erro"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-center">{log.pacientes_importados}</TableCell>
                      <TableCell className="text-xs text-center">{log.procedimentos_importados}</TableCell>
                      <TableCell className="text-xs text-center">
                        {log.duracao_segundos ? `${Math.round(log.duracao_segundos)}s` : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-red-500 max-w-[200px] truncate" title={log.erro_mensagem || ""}>
                        {log.erro_mensagem || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          {logs.length > 0 && (
            <div className="px-3 py-2 border-t text-[10px] text-muted-foreground bg-muted/30">
              Mostrando últimos {logs.length} registros • Sincronização automática: diariamente às 6h
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Configuracoes;

