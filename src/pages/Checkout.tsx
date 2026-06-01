import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import logoFull from "@/assets/logo-dentos.svg";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email({ message: "Informe um email válido." })
  .max(255, { message: "O email deve ter no máximo 255 caracteres." });

const PLANO_INFO: Record<string, { nome: string; preco: string; precoNum: number; mensagens: string; procedimentos: string; suporte: string; cor: string }> = {
  bronze: { nome: "Bronze", preco: "R$ 89,00", precoNum: 89, mensagens: "100 mensagens/mês", procedimentos: "Até 10 campanhas", suporte: "Suporte em até 48h", cor: "from-amber-500/10 to-amber-600/5" },
  prata: { nome: "Prata", preco: "R$ 139,00", precoNum: 139, mensagens: "1.000 mensagens/mês", procedimentos: "Até 30 campanhas", suporte: "Suporte em até 24h", cor: "from-slate-400/10 to-slate-500/5" },
  ouro: { nome: "Ouro", preco: "Sob Consulta", precoNum: 0, mensagens: "Volume Personalizado", procedimentos: "Campanhas Ilimitadas", suporte: "Gerente Dedicado", cor: "from-yellow-500/10 to-yellow-600/5" },
};

const Checkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plano: planoParam } = useParams<{ plano: string }>();
  const [searchParams] = useSearchParams();

  // Suporte tanto /checkout/bronze quanto /checkout?plano=bronze
  const plano = planoParam || searchParams.get("plano") || "bronze";
  const planoInfo = PLANO_INFO[plano] || PLANO_INFO.bronze;

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [clinicaNome, setClinicaNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [cnpjChecking, setCnpjChecking] = useState(false);

  // Payment states
  const [iniciarTrial, setIniciarTrial] = useState(false);
  const [paymentType, setPaymentType] = useState<'assinatura' | 'avulso'>('assinatura');
  const [cardNum, setCardNum] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [mpPublicKey, setMpPublicKey] = useState("");

  // Check if user is already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // If logged in, go to the subscription management page
        navigate(`/assinatura?checkout=true&plano=${plano}`);
      }
    });
  }, [navigate, plano]);

  // Load Mercado Pago public key
  useEffect(() => {
    const fetchKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mercadopago-public-key");
        if (!error && data?.publicKey) {
          setMpPublicKey(data.publicKey);
        }
      } catch (e) {
        console.error("Failed to load public key", e);
      }
    };
    fetchKey();
  }, []);

  // Load Mercado Pago SDK
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    document.title = `Checkout - Plano ${planoInfo.nome} | DentOS`;
    localStorage.setItem("pending_checkout_plano", plano);
  }, [plano, planoInfo.nome]);

  // ──── Formatters ────
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
  };

  const formatCardExpiry = (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
  };

  // ──── Check CNPJ on blur ────
  const checkCnpjExists = async (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length !== 14) {
      setCnpjError(null);
      return;
    }
    setCnpjChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-cnpj", {
        body: { cnpj: clean },
      });
      if (!error && data?.exists) {
        setCnpjError(`Este CNPJ já está cadastrado${data.clinicaNome ? ` (${data.clinicaNome})` : ""}. Faça login para acessar.`);
      } else {
        setCnpjError(null);
      }
    } catch {
      setCnpjError(null);
    } finally {
      setCnpjChecking(false);
    }
  };

  // ──── Tokenize Card ────
  const tokenizeCard = async () => {
    if (!mpPublicKey || mpPublicKey === "APP_USR-dummy-public-key" || !(window as any).MercadoPago) {
      console.warn("Mercado Pago SDK não carregado ou chave dummy. Usando token simulado.");
      return `mock_token_${Date.now()}`;
    }
    try {
      const mp = new (window as any).MercadoPago(mpPublicKey);
      const response = await mp.createCardToken({
        cardNumber: cardNum.replace(/\s+/g, ""),
        cardholderName: cardName,
        cardExpirationMonth: cardExpiry.split("/")[0],
        cardExpirationYear: "20" + cardExpiry.split("/")[1],
        securityCode: cardCvv,
      });
      return response.id;
    } catch (e) {
      console.error("Erro na tokenização do cartão:", e);
      return `mock_token_${Date.now()}`;
    }
  };

  // ──── Handle Checkout Submit ────
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({ variant: "destructive", title: "Nome obrigatório", description: "Por favor, informe seu nome completo." });
      return;
    }
    if (!clinicaNome.trim()) {
      toast({ variant: "destructive", title: "Nome da clínica obrigatório", description: "Por favor, informe o nome da sua clínica." });
      return;
    }
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      toast({ variant: "destructive", title: "CNPJ inválido", description: "Por favor, informe um CNPJ válido com 14 dígitos." });
      return;
    }
    if (cnpjError) {
      toast({ variant: "destructive", title: "CNPJ já cadastrado", description: "Este CNPJ já possui uma clínica cadastrada. Faça login." });
      return;
    }
    if (!iniciarTrial && (!cardNum || !cardName || !cardExpiry || !cardCvv)) {
      toast({ variant: "destructive", title: "Dados de cartão incompletos", description: "Preencha todos os campos do cartão de crédito." });
      return;
    }

    setLoading(true);

    try {
      const parsedEmail = emailSchema.parse(email);
      const redirectUrl = `${window.location.origin}/`;

      // Check if email already exists
      const { data: existingEmailData, error: existingEmailError } = await supabase.functions.invoke("check-email", {
        body: { email: parsedEmail },
      });

      if (!existingEmailError && existingEmailData && (existingEmailData as { exists?: boolean }).exists) {
        toast({ variant: "destructive", title: "Email já cadastrado", description: "Este email já possui uma conta. Faça login para acessar o sistema." });
        setLoading(false);
        return;
      }

      // Tokenize card if paying
      let cardToken = "";
      if (!iniciarTrial) {
        cardToken = await tokenizeCard();
      }

      // Create account
      const { error } = await supabase.auth.signUp({
        email: parsedEmail,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName.trim(),
            clinica_nome: clinicaNome.trim(),
            plano_pretendido: plano,
            cnpj: cleanCnpj,
          },
        },
      });

      if (error) {
        let description = error.message;
        if (error.message === "User already registered" || error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")) {
          description = "Este email já está cadastrado. Faça login.";
        } else if (error.message.includes("Email address") || error.message.includes("email_address_invalid")) {
          description = "O endereço de email é inválido. Verifique ou utilize outro.";
        }
        toast({ variant: "destructive", title: "Erro ao criar conta", description });
      } else {
        if (!iniciarTrial) {
          toast({ title: "Conta criada!", description: "Processando o pagamento da sua assinatura..." });

          const { data: payData, error: payError } = await supabase.functions.invoke("mercadopago-transparent", {
            body: { planoId: plano, tipo: paymentType, token: cardToken },
          });

          if (payError || !payData?.success) {
            toast({ variant: "warning" as any, title: "Assinatura pendente", description: "Conta criada, mas o pagamento falhou. Liberamos 7 dias de teste para regularizar." });
          } else {
            toast({ title: "Assinatura ativa!", description: "Seu plano foi ativado com sucesso!" });
          }
        } else {
          toast({ title: "Conta criada!", description: "Seu teste grátis de 7 dias foi iniciado com sucesso." });
        }
        navigate("/app");
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast({ variant: "destructive", title: "Email inválido", description: err.errors[0]?.message ?? "Verifique o email." });
      } else {
        toast({ variant: "destructive", title: "Erro ao criar conta", description: err?.message ?? "Ocorreu um erro inesperado." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-muted/20">
      {/* ═══════ HEADER ═══════ */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img src={logoFull} alt="DentOS" className="h-9 w-auto" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
            <span className="font-medium text-foreground">Checkout</span>
            <span className="mx-1 text-muted-foreground/40">→</span>
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">2</span>
            <span>Confirmação</span>
          </div>
        </div>
      </header>

      {/* ═══════ MAIN ═══════ */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Finalizar Assinatura</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie sua conta e ative o plano selecionado em poucos minutos.</p>
        </div>

        <form onSubmit={handleCheckout}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">

            {/* ═══════ COLUNA ESQUERDA: FORMULÁRIO ═══════ */}
            <div className="space-y-5">

              {/* ── Seção 1: Dados de Acesso ── */}
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                    Dados de Acesso
                  </CardTitle>
                  <CardDescription className="text-xs">E-mail e senha para entrar no sistema.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="checkout-fullName" className="text-xs">Nome completo</Label>
                    <Input id="checkout-fullName" type="text" placeholder="Seu nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required disabled={loading} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-email" className="text-xs">E-mail</Label>
                      <Input id="checkout-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-password" className="text-xs">Senha</Label>
                      <Input id="checkout-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} minLength={6} />
                      <p className="text-[10px] text-muted-foreground">Mínimo 6 caracteres.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Seção 2: Dados da Clínica ── */}
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                    Dados da Clínica
                  </CardTitle>
                  <CardDescription className="text-xs">Informações de faturamento e identificação.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-clinicaNome" className="text-xs">Nome da Clínica</Label>
                      <Input id="checkout-clinicaNome" type="text" placeholder="Nome da sua clínica" value={clinicaNome} onChange={(e) => setClinicaNome(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-cnpj" className="text-xs">CNPJ</Label>
                      <Input
                        id="checkout-cnpj"
                        type="text"
                        placeholder="00.000.000/0000-00"
                        value={cnpj}
                        onChange={(e) => { setCnpj(formatCnpj(e.target.value)); setCnpjError(null); }}
                        onBlur={() => checkCnpjExists(cnpj)}
                        required
                        disabled={loading}
                        className={cnpjError ? "border-red-500 focus-visible:ring-red-500" : ""}
                      />
                      {cnpjChecking && <p className="text-[10px] text-muted-foreground">Verificando CNPJ...</p>}
                      {cnpjError && (
                        <div className="rounded-md bg-red-50 border border-red-200 p-2 mt-1">
                          <p className="text-[11px] text-red-700 font-medium">⚠️ {cnpjError}</p>
                          <button type="button" onClick={() => navigate("/auth?mode=login")} className="text-[11px] text-red-600 font-bold underline underline-offset-2 mt-0.5 hover:text-red-800">
                            Ir para o login →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Seção 3: Pagamento ── */}
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                    Pagamento
                  </CardTitle>
                  <CardDescription className="text-xs">Escolha como deseja pagar a assinatura.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* ── Checkbox Trial (ACIMA dos métodos) ── */}
                  <div
                    className={`flex items-center gap-2.5 rounded-lg border-2 p-3 cursor-pointer select-none transition-all ${
                      iniciarTrial
                        ? "border-green-500 bg-green-500/10"
                        : "border-dashed border-green-500/40 bg-green-500/5 hover:border-green-500/60"
                    }`}
                    onClick={() => setIniciarTrial(!iniciarTrial)}
                  >
                    <input
                      id="checkout-trial-cb"
                      type="checkbox"
                      checked={iniciarTrial}
                      onChange={(e) => { e.stopPropagation(); setIniciarTrial(e.target.checked); }}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer accent-green-600 shrink-0"
                    />
                    <div>
                      <label htmlFor="checkout-trial-cb" className="text-xs font-bold text-green-700 cursor-pointer block">🎁 Iniciar com 7 dias grátis</label>
                      <span className="text-[10px] text-muted-foreground leading-tight">Teste a plataforma sem compromisso. Nenhum cartão necessário agora.</span>
                    </div>
                  </div>

                  {/* ── Métodos de Pagamento (escondidos no trial) ── */}
                  {!iniciarTrial && (
                    <div className="space-y-4 animate-in fade-in-50 slide-in-from-top-2 duration-300">
                      {/* Seletor Assinatura vs Avulso */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentType("assinatura")}
                          className={`p-3 rounded-lg border-2 text-left flex flex-col gap-1 transition-all ${
                            paymentType === "assinatura"
                              ? "border-primary bg-primary/5 text-primary shadow-sm"
                              : "border-muted text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          <span className="text-xs font-bold flex items-center gap-1">🔄 Assinatura Recorrente</span>
                          <span className="text-[9px] font-normal leading-tight">Cobrança automática mensal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentType("avulso")}
                          className={`p-3 rounded-lg border-2 text-left flex flex-col gap-1 transition-all ${
                            paymentType === "avulso"
                              ? "border-primary bg-primary/5 text-primary shadow-sm"
                              : "border-muted text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          <span className="text-xs font-bold flex items-center gap-1">💳 Pagamento Avulso</span>
                          <span className="text-[9px] font-normal leading-tight">Renovação manual mensal</span>
                        </button>
                      </div>

                      {/* Campos do Cartão */}
                      <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
                        <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">💳 Dados do Cartão de Crédito</p>
                        <div className="space-y-1.5">
                          <Label htmlFor="checkout-cardNum" className="text-xs">Número do Cartão</Label>
                          <Input id="checkout-cardNum" type="text" placeholder="0000 0000 0000 0000" value={cardNum} onChange={(e) => setCardNum(formatCardNumber(e.target.value))} disabled={loading} required={!iniciarTrial} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="checkout-cardName" className="text-xs">Nome impresso no Cartão</Label>
                          <Input id="checkout-cardName" type="text" placeholder="NOME COMO NO CARTÃO" value={cardName} onChange={(e) => setCardName(e.target.value.toUpperCase())} disabled={loading} required={!iniciarTrial} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="checkout-cardExpiry" className="text-xs">Validade (MM/AA)</Label>
                            <Input id="checkout-cardExpiry" type="text" placeholder="MM/AA" value={cardExpiry} onChange={(e) => setCardExpiry(formatCardExpiry(e.target.value))} disabled={loading} required={!iniciarTrial} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="checkout-cardCvv" className="text-xs">CVV</Label>
                            <Input id="checkout-cardCvv" type="password" placeholder="123" value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={loading} required={!iniciarTrial} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Botão mobile (abaixo do form em mobile) */}
              <div className="lg:hidden">
                <Button
                  type="submit"
                  className="w-full bg-[hsl(var(--login-primary))] hover:bg-[hsl(var(--login-primary))]/90 text-primary-foreground font-bold py-6 text-sm shadow-md transition-all hover:shadow-lg"
                  disabled={loading}
                >
                  {loading ? "⏳ Processando..." : iniciarTrial ? "🚀 Ativar 7 Dias Grátis" : `💳 Pagar ${planoInfo.preco} e Ativar`}
                </Button>
              </div>
            </div>

            {/* ═══════ COLUNA DIREITA: RESUMO DO PEDIDO ═══════ */}
            <div className="lg:sticky lg:top-20 space-y-4">
              <Card className={`shadow-lg border-primary/15 bg-gradient-to-b ${planoInfo.cor}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    🛒 Resumo do Pedido
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Plano {planoInfo.nome}</span>
                      <span className="text-sm font-bold text-primary">{planoInfo.preco}<span className="text-[10px] font-normal text-muted-foreground">/mês</span></span>
                    </div>
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <p className="flex items-center gap-1.5">✓ {planoInfo.mensagens}</p>
                      <p className="flex items-center gap-1.5">✓ {planoInfo.procedimentos}</p>
                      <p className="flex items-center gap-1.5">✓ {planoInfo.suporte}</p>
                      <p className="flex items-center gap-1.5">✓ Dashboard completo</p>
                      <p className="flex items-center gap-1.5">✓ WhatsApp automatizado</p>
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{planoInfo.preco}</span>
                    </div>
                    {iniciarTrial && (
                      <div className="flex items-center justify-between text-xs text-green-600 font-medium">
                        <span>🎁 Trial 7 dias grátis</span>
                        <span>- {planoInfo.preco}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">Total hoje</span>
                      <span className="text-lg font-bold text-primary">{iniciarTrial ? "R$ 0,00" : planoInfo.preco}</span>
                    </div>
                    {iniciarTrial && (
                      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                        Após 7 dias, a assinatura será cobrada em {planoInfo.preco}/mês. Cancele a qualquer momento.
                      </p>
                    )}
                  </div>

                  {/* Botão desktop (dentro do resumo) */}
                  <div className="hidden lg:block">
                    <Button
                      type="submit"
                      className="w-full bg-[hsl(var(--login-primary))] hover:bg-[hsl(var(--login-primary))]/90 text-primary-foreground font-bold py-6 text-sm shadow-md transition-all hover:shadow-lg"
                      disabled={loading}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">⏳ Processando...</span>
                      ) : iniciarTrial ? (
                        "🚀 Ativar 7 Dias Grátis"
                      ) : (
                        `💳 Pagar ${planoInfo.preco} e Ativar`
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">🔒 Pagamento seguro</span>
                    <span className="flex items-center gap-1">🛡️ SSL criptografado</span>
                  </div>
                </CardContent>
              </Card>

              {/* Link para login */}
              <div className="text-center space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Já tem uma conta?{" "}
                  <button type="button" onClick={() => navigate("/auth?mode=login")} className="font-medium text-primary underline-offset-4 hover:underline" disabled={loading}>
                    Fazer login
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  <button type="button" onClick={() => navigate("/")} className="font-medium text-muted-foreground underline-offset-4 hover:underline hover:text-foreground" disabled={loading}>
                    ← Voltar para o site
                  </button>
                </p>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default Checkout;
