import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode, CheckCircle2, Clock, RefreshCcw } from "lucide-react";

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

// Lista simples de e-mails de super admin.
// Para máxima segurança, o ideal é combinar isso com RLS usando tabela de roles no banco.
const SUPER_ADMIN_EMAILS: string[] = [];

const Configuracoes = () => {
  const { toast } = useToast();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const whatsappStatus = useWhatsappStatus();
  const location = useLocation();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Configurações | DentAlerta";

    // Verifica usuário atual para habilitar aba de logs apenas para super admin
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const email = data.user?.email?.toLowerCase() ?? "";
        if (email && SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
          setIsSuperAdmin(true);
        }
      })
      .catch(() => {
        setIsSuperAdmin(false);
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

  const handleConnectClick = async () => {
    try {
      setConnectLoading(true);
      setQrImage(null);

      const response = await fetch("https://n8n.vendii.com.br/webhook/qrcode");
      if (!response.ok) {
        throw new Error(`Erro ao buscar QR Code (status ${response.status})`);
      }

      const data = await response.json();
      const base64: string | undefined = data?.base64;

      if (!base64) {
        throw new Error("Resposta do webhook não contém o campo 'base64'.");
      }

      const imageSrc = base64.startsWith("data:image") ? base64 : `data:image/png;base64,${base64}`;
      setQrImage(imageSrc);
      setConnectDialogOpen(true);
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

  return (
    <AppLayout>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Ajuste preferências da plataforma e, se for super admin, acompanhe os logs de importação e chamadas ao
            webhook.
          </p>
        </div>

        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
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
                <div className="space-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Verifique no seu celular se a conexão foi concluída com sucesso.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 text-primary" />
                    <p>O tempo estimado para conexão é de até 10 segundos.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <RefreshCcw className="mt-0.5 h-4 w-4 text-primary" />
                    <p>
                      Se não conectar, feche este popup e clique em
                      <span className="ml-1 font-medium text-foreground">"Conectar Agora"</span> novamente.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum QR Code carregado ainda.</p>
            )}
          </DialogContent>
        </Dialog>

        <Tabs
          defaultValue={(new URLSearchParams(location.search).get("tab") as "perfil" | "geral" | "logs") ?? "perfil"}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="perfil">Dados de perfil</TabsTrigger>
            <TabsTrigger value="geral">Geral</TabsTrigger>
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
                    <Input id="nome" name="nome" placeholder="Digite seu nome" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" placeholder="seuemail@clinica.com" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="clinica">Nome da clínica</Label>
                    <Input id="clinica" name="clinica" placeholder="Nome fantasia da clínica" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone da clínica</Label>
                    <Input id="telefone" name="telefone" type="tel" placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp de contato</Label>
                    <Input id="whatsapp" name="whatsapp" type="tel" placeholder="(00) 00000-0000" />
                  </div>
                  <p className="col-span-full text-xs text-muted-foreground">
                    Em breve você poderá salvar e atualizar estes dados diretamente pela plataforma.
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
                {!(whatsappStatus.data?.conectado ?? false) && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={connectLoading}
                    onClick={handleConnectClick}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--login-primary))] px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm shadow-[hsl(var(--login-primary))]/60 transition hover:shadow-md disabled:opacity-70"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    <span>{connectLoading ? "Gerando QR Code..." : "Conectar Agora"}</span>
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Veja abaixo se o WhatsApp da clínica está conectado. Este status é o mesmo exibido no topo do
                  dashboard.
                </p>
                <div className="overflow-hidden rounded-md border bg-card">
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
                            Nenhum status configurado ainda.
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
                              className="text-[10px] font-normal"
                            >
                              {whatsappStatus.data.conectado ? "Conectado" : "Desconectado"}
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
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Nesta área você poderá, no futuro, gerenciar usuários, permissões e dados da clínica. Por enquanto,
                    as opções são apenas ilustrativas para o layout.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    <li>Atualizar dados da clínica.</li>
                    <li>Configurar integrações com ERP.</li>
                    <li>Gerenciar equipe da recepção.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
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
                  <div className="mt-2 overflow-hidden rounded-md border bg-card">
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Arquivo</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Origem</TableHead>
                            <TableHead>Status interno</TableHead>
                            <TableHead>Status n8n</TableHead>
                            <TableHead>Prévia da resposta</TableHead>
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
                                <TableCell className="text-xs">{item.tipo}</TableCell>
                                <TableCell className="text-xs">{item.origem}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={item.status.toLowerCase().startsWith("erro") ? "destructive" : "default"}
                                    className="text-[10px] font-normal"
                                  >
                                    {item.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">
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
                                <TableCell className="max-w-[260px] truncate text-[11px] text-muted-foreground" title={
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
