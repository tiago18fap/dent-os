import logoDentalertaNew from "@/assets/logo-dentalerta-new.png";
import heroDentalBanner from "@/assets/hero-dental-banner-3.png";
import headerTopo from "@/assets/header-topo-2.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Facebook, Instagram, Linkedin, LogIn, MessageCircle, Shield, Star, UserPlus, Zap } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "DentAlerta | Alertas por WhatsApp para dentistas";
  }, []);

  const handleStartTrial = () => {
    navigate("/app");
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/5 text-foreground"
      style={{ "--secondary": "126 79% 68%", "--hero-highlight": "126 79% 68%" } as CSSProperties}
    >
      <header
        className="border-b border-border/60 bg-background/80 backdrop-blur"
        style={{
          backgroundImage: `url(${headerTopo})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top center",
          backgroundSize: "100% auto",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <img
              src={logoDentalertaNew}
              alt="Logo DentAlerta completo"
              className="h-12 w-auto object-contain"
            />
          </div>
          <div className="flex items-center gap-2 text-xs md:text-sm">
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth?mode=login")} className="hover-scale">
              <LogIn className="mr-1.5 h-4 w-4" />
              Login
            </Button>
            <button
              type="button"
              onClick={() => navigate("/auth?mode=signup")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground hover:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 md:text-sm"
            >
              <UserPlus className="h-4 w-4" />
              Cadastro
            </button>
            <Button
              size="sm"
              className="hover-scale"
              variant="secondary"
              onClick={() => window.open("https://wa.me/55", "_blank")}
            >
              Contato
            </Button>
          </div>
        </div>
      </header>

      <main className="pb-10 md:pb-16">
        {/* Hero / Banner principal */}
        <section
          className="relative grid gap-10 overflow-hidden bg-cover bg-center px-6 py-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center md:px-10 md:py-16"
          style={{ backgroundImage: `url(${heroDentalBanner})` }}
        >
          {/* Coluna esquerda: texto do banner */}
          <div className="space-y-6 animate-fade-in">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 text-xs font-medium text-primary-foreground ring-1 ring-secondary/30">
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                Teste grátis por 7 dias
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-primary-foreground sm:inline-block" aria-hidden="true" />
              <span className="text-[11px] text-primary-foreground">Feito para dentistas que usam WhatsApp</span>
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-hero md:text-4xl lg:text-5xl">
               Alertas por procedimento e retornos programados no WhatsApp.
             </h1>

            <p className="max-w-xl text-sm text-primary-foreground md:text-base">
              O DentAlerta agenda mensagens automáticas por procedimento e data de retorno, lembrando seus pacientes na
              hora certa para voltarem à clínica, enquanto você foca apenas no atendimento.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="hover-scale bg-hero text-white hover:bg-hero/90" onClick={() => navigate("/auth?mode=signup")}>
                Começar teste grátis de 7 dias
              </Button>
              <Button size="lg" variant="outline" className="hover-scale" onClick={() => navigate("/auth?mode=login")}>
                Fazer login
              </Button>
              <p className="w-full text-xs text-primary-foreground md:w-auto">
                Sem cartão de crédito • Planos a partir de R$ 99/mês.
              </p>
            </div>

            <div className="grid gap-3 text-xs text-primary-foreground sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-secondary" />
                <span>Lembretes de consulta, retorno e manutenção automática.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-secondary" />
                <span>Fluxos pensados para a rotina de dentistas e recepção.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-secondary" />
                <span>Envios oficiais pelo WhatsApp, com histórico e controle.</span>
              </div>
            </div>
          </div>

          {/* Coluna direita: cartão visual que remete a consultório + alertas */}
          <div className="relative flex flex-col gap-4 rounded-2xl bg-gradient-to-b from-primary/10 via-background to-secondary/10 p-5 shadow-xl shadow-primary/10 ring-1 ring-border/80 animate-scale-in">
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_55%),_radial-gradient(circle_at_bottom,_hsl(var(--secondary)/0.16),_transparent_55%)]" />

            <div className="flex items-center justify-between gap-2 pb-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/80">
              <span>WhatsApp do paciente</span>
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                Retorno programado automaticamente
              </span>
            </div>

            <div className="space-y-3 rounded-xl bg-card/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Hoje · 09:12</span>
                <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                  Paciente: João Silva
                </span>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
                  Mensagem chegando agora
                </p>

                <div className="space-y-1.5">
                  <div className="inline-flex max-w-[90%] flex-col rounded-2xl rounded-bl-sm bg-muted/80 px-3 py-2 text-left text-[11px] text-foreground shadow-sm">
                    <span className="mb-1 text-[11px] font-medium text-foreground">DentAlerta · Clínica Sorriso</span>
                    <span>
                      Olá, João! Tudo bem? 😊
                      <br />
                      Vimos aqui que já se passaram 6 meses da sua profilaxia. Está na hora do seu retorno de limpeza.
                    </span>
                    <span className="mt-1 text-[10px] text-muted-foreground">
                      Esta mensagem foi agendada automaticamente no dia da sua última consulta.
                    </span>
                  </div>

                  <div className="ml-auto inline-flex max-w-[80%] flex-col items-end rounded-2xl rounded-br-sm bg-secondary/90 px-3 py-2 text-right text-[11px] text-secondary-foreground shadow-sm">
                    <span>Oi, tudo bem! Pode ser na próxima semana?</span>
                    <span className="mt-1 text-[10px] text-secondary-foreground/80">Visto · 09:14</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between rounded-xl bg-secondary/10 px-4 py-3 text-xs">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  Alertas inteligentes por procedimento
                </p>
                <p className="text-muted-foreground">
                  O DentAlerta agenda mensagens de retorno por procedimento e lembra seus pacientes após alguns dias.
                </p>
              </div>
              <MessageCircle className="hidden h-9 w-9 text-secondary sm:block" />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mx-auto mt-16 max-w-6xl space-y-6 px-4">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Planos pensados para sua clínica</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Comece com 7 dias grátis. Sem fidelidade, cancele quando quiser.
            </p>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {/* Basic */}
            <Card className="flex flex-col border-border/80 bg-card/90 hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Plano Básico</span>
                  <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    Ideal para começar
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 text-sm">
                <div className="space-y-2">
                  <p className="text-2xl font-semibold">
                    R$ 99<span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Até 1.000 contatos ativos.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Lembretes básicos de consulta.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Suporte por e-mail.</span>
                    </li>
                  </ul>
                </div>
                <Button className="w-full" onClick={handleStartTrial}>
                  Testar grátis
                </Button>
              </CardContent>
            </Card>

            {/* Premium */}
            <Card className="flex flex-col border-secondary/70 bg-gradient-to-b from-secondary/15 via-background to-background shadow-lg shadow-secondary/20 hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Plano Premium</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                    Mais usado
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 text-sm">
                <div className="space-y-2">
                  <p className="text-2xl font-semibold">
                    R$ 179<span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Até 5.000 contatos ativos.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Campanhas por procedimento e aniversariantes.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Módulo Indique e Ganhe.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Suporte prioritário por WhatsApp.</span>
                    </li>
                  </ul>
                </div>
                <Button className="w-full" onClick={handleStartTrial}>
                  Começar no Premium
                </Button>
              </CardContent>
            </Card>

            {/* Enterprise */}
            <Card className="flex flex-col border-border/80 bg-card/90 hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Plano Enterprise</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Sob consulta
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 text-sm">
                <div className="space-y-2">
                  <p className="text-2xl font-semibold">
                    Preço sob consulta
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Clínicas e redes com alto volume.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Onboarding dedicado e consultoria.</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 text-secondary" />
                      <span>Integrações avançadas e SLA personalizado.</span>
                    </li>
                  </ul>
                </div>
                <Button variant="outline" className="w-full" onClick={() => window.open("https://wa.me/55", "_blank") }>
                  Falar com time comercial
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mt-16 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Dentistas que já contam com o DentAlerta</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Veja como os lembretes automáticos de retorno ajudam no dia a dia do consultório.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/90">
              <CardContent className="flex flex-col gap-3 p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src="https://images.pexels.com/photos/3845762/pexels-photo-3845762.jpeg" alt="Foto de Dr. Gustavo Eufrazio" />
                    <AvatarFallback>GE</AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5 text-left">
                    <p className="text-sm font-semibold">Dr. Gustavo Eufrazio</p>
                    <p className="text-[11px] text-muted-foreground">Ortodontista · Clínica Eufrazio Odontologia</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 text-secondary">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-3.5 w-3.5 fill-secondary text-secondary" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  "Com os retornos programados, a recepção não precisa mais ficar lembrando quem deve voltar. O sistema avisa o paciente sozinho e nossa agenda de manutenção ficou muito mais organizada."
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardContent className="flex flex-col gap-3 p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src="https://images.pexels.com/photos/3760852/pexels-photo-3760852.jpeg" alt="Foto da Dra. Marina Ribeiro" />
                    <AvatarFallback>MR</AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5 text-left">
                    <p className="text-sm font-semibold">Dra. Marina Ribeiro</p>
                    <p className="text-[11px] text-muted-foreground">Clínica geral · Odonto Centro</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 text-secondary">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-3.5 w-3.5 fill-secondary text-secondary" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  "Antes muitos pacientes esqueciam de retornar para a limpeza semestral. Agora, com os lembretes automáticos, quase todos confirmam pelo próprio WhatsApp."
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardContent className="flex flex-col gap-3 p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src="https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg" alt="Foto do Dr. Paulo Nogueira" />
                    <AvatarFallback>PN</AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5 text-left">
                    <p className="text-sm font-semibold">Dr. Paulo Nogueira</p>
                    <p className="text-[11px] text-muted-foreground">Implantodontista · Nogueira &amp; Associados</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 text-secondary">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-3.5 w-3.5 fill-secondary text-secondary" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  "Os retornos de implante são críticos. Ter mensagens agendadas por procedimento me dá segurança de que ninguém fica sem acompanhamento após a cirurgia."
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-border/70 bg-background/80 py-8 text-xs text-muted-foreground">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 md:flex-row md:items-start md:justify-between">
            {/* Brand + Social */}
            <div className="space-y-3 md:max-w-xs">
              <div className="flex items-center gap-2">
                <img src={logoDentalertaNew} alt="Logo DentAlerta" className="h-8 w-auto object-contain" />
                <span className="text-sm font-semibold text-foreground">DentAlerta</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                SaaS especializado em lembretes por WhatsApp para clínicas odontológicas, focado em retornos de
                procedimentos e relacionamento contínuo com o paciente.
              </p>
              <div className="flex items-center gap-3 text-foreground/80">
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram DentAlerta"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook DentAlerta"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Facebook className="h-4 w-4" />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn DentAlerta"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Sitemap */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">Mapa do site</h3>
              <nav className="flex flex-col gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-left text-muted-foreground hover:text-foreground"
                >
                  Início
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/auth?mode=login")}
                  className="text-left text-muted-foreground hover:text-foreground"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/auth?mode=signup")}
                  className="text-left text-muted-foreground hover:text-foreground"
                >
                  Criar conta
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/app")}
                  className="text-left text-muted-foreground hover:text-foreground"
                >
                  Dashboard
                </button>
              </nav>
            </div>

            {/* Legal */}
            <div className="space-y-3 md:max-w-xs">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">Política de privacidade</h3>
              <p className="text-[11px] leading-relaxed">
                O DentAlerta armazena apenas os dados necessários para o envio de lembretes, campanhas e registro de
                retornos. As informações dos pacientes são protegidas, não são compartilhadas com terceiros não
                autorizados e podem ser removidas a qualquer momento mediante solicitação da clínica.
              </p>
              <p className="text-[11px] leading-relaxed">
                Os dados de acesso ao sistema são usados para segurança, análise de uso e melhoria contínua do serviço.
                Não enviamos spam e todas as comunicações podem ser gerenciadas pelas configurações da conta.
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-border/60 pt-4">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 md:flex-row">
              <p>© {new Date().getFullYear()} DentAlerta. Todos os direitos reservados.</p>
              <p>Teste gratuito de 7 dias · Cancelamento a qualquer momento.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Landing;
