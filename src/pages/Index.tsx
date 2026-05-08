import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Upload, Megaphone, Gift, FileSpreadsheet, Calendar } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Dashboard DentAlerta";
  }, []);

  const today = new Date();
  const aniversariantesMes = 42;

  return (
    <AppLayout>
      <section className="grid gap-4 md:grid-cols-4" aria-label="Resumo principal">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Importações recentes</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">3 arquivos</p>
            <p className="text-xs text-muted-foreground">Últimos 7 dias (dados de exemplo)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campanhas do mês</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">4 campanhas</p>
            <p className="text-xs text-muted-foreground">1200 mensagens simuladas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indicações</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">5 convertidas</p>
            <p className="text-xs text-muted-foreground">R$ 500,00 em desconto simulado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aniversariantes do mês</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{aniversariantesMes}</p>
            <p className="text-xs text-muted-foreground">Pacientes com aniversário neste mês (exemplo)</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[2fr,1fr]" aria-label="Ações rápidas">
        <Card>
          <CardHeader>
            <CardTitle>Bem-vindo ao DentAlerta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Conecte o seu ERP odontológico ao DentAlerta para importar clientes e procedimentos e automatizar a
              comunicação com seus pacientes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" onClick={() => navigate("/importacoes")}>
                <Upload className="mr-2 h-4 w-4" />
                Importar dados agora
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/campanhas")}>
                <Megaphone className="mr-2 h-4 w-4" />
                Criar campanha
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card aria-label="Próximos passos simulados">
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
              <div>
                <p className="font-medium text-foreground">Configurar fluxo de importação</p>
                <p>Garanta que o .xlsx exportado do ERP contém as colunas esperadas.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
              <div>
                <p className="font-medium text-foreground">Criar modelo de mensagem</p>
                <p>Defina o tom de voz da sua clínica para as campanhas automáticas.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="pt-2 text-[11px]">
              Data de hoje: {today.toLocaleDateString("pt-BR")} — Todos os números exibidos são apenas exemplos.
            </p>
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  );
};

export default Index;
