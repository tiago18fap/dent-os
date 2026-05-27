import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import logoFull from "@/assets/logo-dentos.png";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email({ message: "Informe um email válido." })
  .max(255, { message: "O email deve ter no máximo 255 caracteres." });
const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Verifica se veio da Landing com mode=signup ou mode=login
  const initialMode = searchParams.get("mode") === "signup" ? true : false;
  const [isSignUp, setIsSignUp] = useState(initialMode);

  useEffect(() => {
    document.title = "Login - DentAlerta";

    // Setup auth state listener first
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      navigate("/app");
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const parsedEmail = emailSchema.parse(email);

      const { error } = await supabase.auth.signInWithPassword({
        email: parsedEmail,
        password,
      });

      if (error) {
        let description = error.message;

        if (error.message === "Invalid login credentials") {
          description = "Credenciais inválidas. Verifique seu email e senha.";
        } else if (
          error.message === "Email not confirmed" ||
          error.message.toLowerCase().includes("email_not_confirmed")
        ) {
          description =
            "Seu email ainda não foi confirmado. Acesse o link enviado para o seu email ou peça um novo envio no Supabase.";
        }

        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
          description,
        });
      } else {
        toast({
          title: "Login realizado",
          description: "Bem-vindo(a) ao DentAlerta!",
        });
        navigate("/app");
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Email inválido",
          description:
            err.errors[0]?.message ?? "Verifique o endereço de email informado.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao entrar",
          description: err?.message ?? "Ocorreu um erro inesperado. Tente novamente.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        variant: "destructive",
        title: "Nome obrigatório",
        description: "Por favor, informe seu nome completo.",
      });
      return;
    }

    setLoading(true);
 
    try {
      const parsedEmail = emailSchema.parse(email);
      const redirectUrl = `${window.location.origin}/`;
 
      // Verifica se o email já está cadastrado antes de criar nova conta
      const { data: existingEmailData, error: existingEmailError } = await supabase.functions.invoke("check-email", {
        body: { email: parsedEmail },
      });
 
      if (!existingEmailError && existingEmailData && (existingEmailData as { exists?: boolean }).exists) {
        toast({
          variant: "destructive",
          title: "Email já cadastrado",
          description: "Este email já possui uma conta. Faça login para acessar o sistema.",
        });
        setIsSignUp(false);
        return;
      }
 
      const { error } = await supabase.auth.signUp({
        email: parsedEmail,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName.trim(),
          },
        },
      });
 
      if (error) {
        let description = error.message;
 
        if (
          error.message === "User already registered" ||
          error.message.toLowerCase().includes("already") ||
          error.message.toLowerCase().includes("registered")
        ) {
          description = "Este email já está cadastrado. Faça login.";
        } else if (
          error.message.includes("Email address") ||
          error.message.includes("email_address_invalid")
        ) {
          description =
            "O endereço de email informado é inválido. Verifique se digitou corretamente ou utilize outro email.";
        }
 
        toast({
          variant: "destructive",
          title: "Erro ao criar conta",
          description,
        });
      } else {
        toast({
          title: "Conta criada",
          description:
            "Verifique seu email para confirmar o cadastro. Se não receber, verifique sua caixa de spam.",
        });
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Email inválido",
          description: err.errors[0]?.message ?? "Verifique o endereço de email informado.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao criar conta",
          description: err?.message ?? "Ocorreu um erro inesperado. Tente novamente.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <img src={logoFull} alt="DentOS" className="mx-auto h-12 w-auto" />
          <CardTitle className="text-2xl">{isSignUp ? "Criar conta" : "Entrar no DentAlerta"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Preencha os dados para criar sua conta"
              : "Use suas credenciais para acessar o sistema"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={isSignUp}
                  disabled={loading}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
              {isSignUp && (
                <p className="text-xs text-muted-foreground">A senha deve ter no mínimo 6 caracteres.</p>
              )}
            </div>
            <Button
               type="submit"
               className="w-full bg-[hsl(var(--login-primary))] hover:bg-[hsl(var(--login-primary))]/90 text-primary-foreground"
               disabled={loading}
             >
               {loading ? "Aguarde..." : isSignUp ? "Criar conta" : "Entrar"}
             </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <p>
                Já tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  disabled={loading}
                >
                  Fazer login
                </button>
              </p>
            ) : (
              <p>
                Não tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  disabled={loading}
                >
                  Criar conta
                </button>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
