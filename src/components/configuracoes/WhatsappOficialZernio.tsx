import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";

// WhatsApp oficial (Meta) via Zernio, com coexistência: a clínica continua usando
// o celular e o WhatsApp Web; o DentOS envia os lembretes por modelos aprovados.

type Estado = {
  servidor_configurado: boolean;
  provider: "evolution" | "zernio";
  zernio_account_id: string | null;
  zernio_numero: string | null;
  conectado: boolean;
  pode_vincular: boolean;
};

type Conta = { accountId: string; numero: string | null; nome: string | null; ativo: boolean; clinica_id: string | null };

type Campanha = {
  chave: string;
  titulo: string;
  texto: string;
  ativo: boolean;
  categoria_sugerida: "UTILITY" | "MARKETING";
  texto_livre?: boolean;
  previa_modelo: string;
  avisos: string[];
  modelo: null | {
    nome: string;
    status: string;
    categoria: string;
    motivo: string | null;
    texto_original: string;
    desatualizado: boolean;
  };
};

async function chamar<T>(clinicaId: string, acao: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("zernio-whatsapp", {
    body: { acao, clinica_id: clinicaId, ...extra },
  });
  if (error) {
    let msg = error.message;
    try {
      const corpo = await (error as any).context?.json?.();
      if (corpo?.error) msg = corpo.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

function StatusModelo({ c }: { c: Campanha }) {
  if (!c.modelo) return <Badge variant="outline">Sem modelo</Badge>;
  if (c.modelo.desatualizado) return <Badge className="bg-amber-500 hover:bg-amber-500">Texto mudou: reenviar</Badge>;
  switch (c.modelo.status) {
    case "APPROVED":
      return <Badge className="bg-green-600 hover:bg-green-600">Aprovado</Badge>;
    case "PENDING":
    case "IN_APPEAL":
      return <Badge className="bg-blue-500 hover:bg-blue-500">Em análise na Meta</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Reprovado</Badge>;
    case "PAUSED":
    case "DISABLED":
      return <Badge variant="destructive">Pausado pela Meta</Badge>;
    default:
      return <Badge variant="outline">{c.modelo.status}</Badge>;
  }
}

export function WhatsappOficialZernio({ clinicaId }: { clinicaId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Record<string, "UTILITY" | "MARKETING">>({});
  const [textoMassa, setTextoMassa] = useState("");

  const estado = useQuery({
    queryKey: ["zernio_estado", clinicaId],
    queryFn: () => chamar<Estado>(clinicaId, "estado"),
    enabled: !!clinicaId,
  });
  const ehZernio = estado.data?.provider === "zernio" && !!estado.data?.zernio_account_id;

  const campanhas = useQuery({
    queryKey: ["zernio_campanhas", clinicaId],
    queryFn: async () => (await chamar<{ campanhas: Campanha[] }>(clinicaId, "campanhas")).campanhas,
    enabled: !!clinicaId && ehZernio,
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["zernio_estado", clinicaId] });
    queryClient.invalidateQueries({ queryKey: ["zernio_campanhas", clinicaId] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp_status"] });
  };

  const executar = async (rotulo: string, fn: () => Promise<unknown>, sucesso?: string) => {
    setOcupado(rotulo);
    try {
      await fn();
      if (sucesso) toast({ title: sucesso });
      recarregar();
    } catch (e: any) {
      toast({ title: "Não deu certo", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  if (estado.isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando WhatsApp oficial…
        </CardContent>
      </Card>
    );
  }
  if (estado.isError || !estado.data) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Não foi possível carregar o WhatsApp oficial: {(estado.error as Error)?.message}
        </CardContent>
      </Card>
    );
  }
  const e = estado.data;

  return (
    <Card className="border-green-600/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          WhatsApp oficial (Meta) — mesmo número no celular e no sistema
        </CardTitle>
        <CardDescription>
          Provedor atual:{" "}
          <strong>{ehZernio ? `WhatsApp oficial via Zernio (${e.zernio_numero ?? "número não informado"})` : "Evolution (não oficial)"}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!e.servidor_configurado && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>A chave da Zernio (ZERNIO_API_KEY) ainda não foi configurada no servidor.</span>
          </div>
        )}

        {e.pode_vincular && e.servidor_configurado && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!ocupado}
                onClick={() =>
                  executar("contas", async () => setContas((await chamar<{ contas: Conta[] }>(clinicaId, "contas")).contas))
                }
              >
                {ocupado === "contas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Ver números conectados na Zernio</span>
              </Button>
              {ehZernio && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!ocupado}
                  onClick={() => executar("evolution", () => chamar(clinicaId, "usar_evolution"), "Clínica voltou para a Evolution")}
                >
                  Voltar para a Evolution
                </Button>
              )}
            </div>
            {contas && contas.length === 0 && (
              <p className="text-muted-foreground">
                Nenhum número conectado na Zernio. Conecte o celular da clínica no painel da Zernio (Connections → WhatsApp →
                Use my own number → "Connect existing WhatsApp Business app account").
              </p>
            )}
            {contas?.map((c) => {
              const daOutra = c.clinica_id && c.clinica_id !== clinicaId;
              const desta = c.accountId === e.zernio_account_id;
              return (
                <div key={c.accountId} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <div className="font-medium">{c.numero ?? c.accountId}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.nome ?? "sem nome"} · {c.ativo ? "ativo" : "inativo"}
                      {daOutra ? " · ligado a outra clínica" : ""}
                    </div>
                  </div>
                  {desta ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Em uso
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!!ocupado || !!daOutra}
                      onClick={() =>
                        executar(
                          `vincular-${c.accountId}`,
                          () => chamar(clinicaId, "vincular", { account_id: c.accountId }),
                          "Clínica passou a enviar pelo WhatsApp oficial",
                        )
                      }
                    >
                      Usar este número
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {ehZernio && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Modelos de mensagem aprovados pela Meta</div>
                <p className="text-xs text-muted-foreground">
                  Cada campanha precisa de um modelo aprovado. Use <strong>Utilidade</strong> para lembrete de consulta ou
                  retorno do tratamento (≈ R$ 0,035) e <strong>Marketing</strong> para promoção e reativação (≈ R$ 0,32).
                  Enquanto o modelo não for aprovado, as mensagens da campanha ficam esperando na fila.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!!ocupado}
                onClick={() => executar("status", () => chamar(clinicaId, "atualizar_status"), "Status atualizado")}
              >
                {ocupado === "status" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Atualizar status</span>
              </Button>
            </div>

            {campanhas.isLoading && (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas…
              </p>
            )}
            {campanhas.data?.map((c) => {
              const categoria = categorias[c.chave] ?? (c.modelo?.categoria as any) ?? c.categoria_sugerida;
              const precisaEnviar = !c.modelo || c.modelo.desatualizado || c.modelo.status === "REJECTED";
              return (
                <div key={c.chave} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {c.titulo}
                      {!c.ativo && <span className="ml-2 text-xs text-muted-foreground">(campanha desligada)</span>}
                    </div>
                    <StatusModelo c={c} />
                  </div>
                  {c.texto_livre ? (
                    <Textarea
                      rows={3}
                      placeholder="Texto do disparo geral. Use {nome} para o primeiro nome. O disparo geral só sai pelo WhatsApp oficial com este mesmo texto."
                      value={textoMassa || c.modelo?.texto_original || ""}
                      onChange={(ev) => setTextoMassa(ev.target.value)}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">{c.texto || "(sem texto)"}</p>
                  )}
                  {c.modelo?.status === "REJECTED" && c.modelo.motivo && (
                    <p className="text-xs text-destructive">Motivo da Meta: {c.modelo.motivo}</p>
                  )}
                  {c.avisos.map((a) => (
                    <p key={a} className="text-xs text-amber-700">⚠ {a}</p>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={categoria}
                      onValueChange={(v) => setCategorias((prev) => ({ ...prev, [c.chave]: v as any }))}
                    >
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTILITY">Utilidade (lembrete)</SelectItem>
                        <SelectItem value="MARKETING">Marketing (promoção)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={precisaEnviar ? "default" : "outline"}
                      disabled={!!ocupado || (!c.texto_livre && !c.texto.trim())}
                      onClick={() =>
                        executar(
                          `modelo-${c.chave}`,
                          () =>
                            chamar(clinicaId, "enviar_modelo", {
                              chave: c.chave,
                              categoria,
                              ...(c.texto_livre ? { texto: textoMassa || c.modelo?.texto_original || "" } : {}),
                            }),
                          "Modelo enviado para aprovação da Meta",
                        )
                      }
                    >
                      {ocupado === `modelo-${c.chave}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="ml-1">{c.modelo ? "Reenviar para aprovação" : "Enviar para aprovação"}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WhatsappOficialZernio;
