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
import { QrCode, CheckCircle2, Clock, RefreshCcw, LogOut, Edit, Trash2, Plus, Key, Eye, Loader2, Wifi, WifiOff } from "lucide-react";
import { createInstance, connectInstance, getConnectionState, disconnectAndDelete, fetchInstanceInfo } from "@/services/evolutionApi";

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
    document.title = "Configurações | DentAlerta";

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

          toast({
            title: "WhatsApp conectado!",
            description: number ? `Número ${number} vinculado com sucesso.` : "Conexão realizada com sucesso.",
          });
        }
      } catch (err) {
        console.error("[Polling] Erro:", err);
      }
    }, 5000); // Verificar a cada 5 segundos
  }, [clinica?.id, stopPolling, toast, queryClient]);

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
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="perfil">Dados de perfil</TabsTrigger>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="clientes" disabled={!isSuperAdmin}>
              Gerenciar Clientes
            </TabsTrigger>
            <TabsTrigger value="logs" disabled={!isSuperAdmin}>
              Logs de importação (admin)
            </TabsTrigger>
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

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Preferências de comunicação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="whatsapp-alertas">Alertas por WhatsApp</Label>
                      <p className="text-xs text-muted-foreground">
                        Ative ou pause o envio de lembretes automáticos (controle apenas visual por enquanto).
                      </p>
                    </div>
                    <Switch id="whatsapp-alertas" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="email-relatorios">Resumo semanal por e-mail</Label>
                      <p className="text-xs text-muted-foreground">
                        Receba um resumo das importações e campanhas da semana.
                      </p>
                    </div>
                    <Switch id="email-relatorios" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Conta e segurança</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="space-y-3">
                    <p>
                      Nesta área você poderá gerenciar usuários, permissões e dados da clínica.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground/80">
                      <li>Atualização de dados de cadastro.</li>
                      <li>Configuração de integrações de mensageria.</li>
                      <li>Gerenciamento de equipe e controle de acesso.</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
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
        </Tabs>
      </section>
    </AppLayout>
  );
};

export default Configuracoes;
