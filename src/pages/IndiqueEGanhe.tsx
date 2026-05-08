import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const indicacoesFake = [
  { nome: "Clínica Sorriso Mais", data: "01/10/2025", status: "Convertido" },
  { nome: "Odonto Vida", data: "05/10/2025", status: "Em teste" },
  { nome: "Sorrir Bem", data: "08/10/2025", status: "Cancelado" },
];

const TOTAL_CONVERTIDAS = indicacoesFake.filter((i) => i.status === "Convertido").length;
const VALOR_POR_INDICACAO = 100;
const TOTAL_DESCONTO = TOTAL_CONVERTIDAS * VALOR_POR_INDICACAO;

const IndiqueEGanhe = () => {
  const { toast } = useToast();
  const codigoIndicacao = "DENTAL-123ABC";

  useEffect(() => {
    document.title = "Indique e Ganhe DentAlerta";
  }, []);

  const handleCopiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(codigoIndicacao);
      toast({ title: "Código copiado", description: "Cole o código onde preferir para indicar o DentAlerta." });
    } catch (error) {
      console.error("Erro ao copiar código de indicação", error);
      toast({
        variant: "destructive",
        title: "Não foi possível copiar",
        description: "Copie o código manualmente se o botão não funcionar.",
      });
    }
  };

  const handleCompartilharWhatsapp = () => {
    const mensagem = `Olá! Estou indicando o DentAlerta para sua clínica. Use meu código ${codigoIndicacao} e ganhe condições especiais.`;
    const url = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppLayout>
      <section className="grid gap-4 md:grid-cols-[2fr,1fr]" aria-label="Programa de indicação">
        <Card>
          <CardHeader>
            <CardTitle>Indique e ganhe</CardTitle>
            <CardDescription>
              Indique o DentAlerta para outras clínicas e ganhe descontos na sua mensalidade (dados simulados).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Seu código de indicação</p>
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-mono">
                <span className="mr-2 font-semibold text-foreground">{codigoIndicacao}</span>
                <Button type="button" size="sm" variant="outline" onClick={handleCopiarCodigo}>
                  Copiar código
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleCompartilharWhatsapp}>
                  Compartilhar no WhatsApp
                </Button>
              </div>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-md bg-card p-3">
                <p className="text-xs text-muted-foreground">Indicações convertidas (exemplo)</p>
                <p className="text-2xl font-semibold text-foreground">{TOTAL_CONVERTIDAS}</p>
              </div>
              <div className="rounded-md bg-card p-3">
                <p className="text-xs text-muted-foreground">Desconto acumulado simulado</p>
                <p className="text-2xl font-semibold text-foreground">R$ {TOTAL_DESCONTO.toFixed(2)}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Cada indicação que fecha contrato com o DentAlerta gera R$ {VALOR_POR_INDICACAO.toFixed(2)} de desconto
              na sua mensalidade (valores de exemplo).
            </p>
          </CardContent>
        </Card>

        <Card aria-label="Histórico de indicações simuladas">
          <CardHeader>
            <CardTitle>Indicações recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="overflow-hidden rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clínica indicada</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indicacoesFake.map((ind) => (
                    <TableRow key={ind.nome}>
                      <TableCell className="font-medium">{ind.nome}</TableCell>
                      <TableCell>{ind.data}</TableCell>
                      <TableCell>{ind.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">Todos os dados exibidos nesta tela são apenas exemplos.</p>
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  );
};

export default IndiqueEGanhe;
