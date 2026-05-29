import { LayoutDashboard, Upload, Megaphone, Settings, Users, FileText, MessageCircle, Wallet, CreditCard } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

import logoDentosFull from "@/assets/logo-dentos.png";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { useClinica } from "@/contexts/ClinicaContext";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const whatsappStatusQuery = useWhatsappStatus();
  const { isSuperAdmin, isImpersonating } = useClinica();
  const isAutomaticImport = Boolean(whatsappStatusQuery.data?.easydental_usuario);
  const [impersonatedClinicaName, setImpersonatedClinicaName] = useState<string | null>(null);

  useEffect(() => {
    const impId = localStorage.getItem("impersonated_clinica_id");
    if (impId) {
      supabase
        .from("clinicas")
        .select("nome")
        .eq("id", impId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setImpersonatedClinicaName(data.nome);
          }
        });
    } else {
      setImpersonatedClinicaName(null);
    }
  }, [location.pathname]);

  const handleStopImpersonation = () => {
    localStorage.removeItem("impersonated_clinica_id");
    window.location.reload();
  };

  const searchParams = new URLSearchParams(location.search);
  const currentCampanhasTab = searchParams.get("tab") ?? "massa";

  const titleMap: Record<string, string> = {
    "/app": "Dashboard",
    "/importacoes": "Importações",
    "/campanhas": "Campanhas",
    "/indique-e-ganhe": "Indique e Ganhe",
    "/dados/clientes": "Pacientes",
    "/dados/procedimentos": "Procedimentos",
    "/configuracoes": "Configurações",
    "/fila-envios": "Fila de Envios",
    "/assinatura": "Meu Plano",
  };

  const currentTitle = titleMap[location.pathname] ?? "DentOS";

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="bg-sidebar-background text-sidebar-foreground border-r border-sidebar-border shadow-lg shadow-primary/25"
      >
        <SidebarHeader className="flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar-background/90 px-3 py-3">
          <NavLink to="/app" className="flex items-center gap-2 px-1" aria-label="Ir para a home">
            <img
              src={logoDentosFull}
              alt="Logo completo DentOS"
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          </NavLink>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">
              Navegação
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/app"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/app" aria-label="Dashboard" className="flex items-center gap-2">
                      <LayoutDashboard className="shrink-0" />
                      <span>Dashboard</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {!isAutomaticImport && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/importacoes"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/importacoes" aria-label="Importações" className="flex items-center gap-2">
                      <Upload className="shrink-0" />
                      <span>Importações</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/campanhas"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/campanhas" aria-label="Campanhas" className="flex items-center gap-2">
                      <Megaphone className="shrink-0" />
                      <span>Campanhas</span>
                    </NavLink>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        isActive={location.pathname === "/campanhas" && currentCampanhasTab === "massa"}
                        className="rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:bg-secondary/15 data-[active=true]:text-secondary-foreground"
                      >
                        <NavLink to="/campanhas?tab=massa">Disparo Geral</NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        isActive={location.pathname === "/campanhas" && currentCampanhasTab === "procedimento"}
                        className="rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:bg-secondary/15 data-[active=true]:text-secondary-foreground"
                      >
                        <NavLink to="/campanhas?tab=procedimento">Disparo por procedimento</NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        isActive={location.pathname === "/campanhas" && currentCampanhasTab === "aniversario"}
                        className="rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:bg-secondary/15 data-[active=true]:text-secondary-foreground"
                      >
                        <NavLink to="/campanhas?tab=aniversario">Disparo de aniversário</NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/fila-envios"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/fila-envios" aria-label="Fila de Envios" className="flex items-center gap-2">
                      <Wallet className="shrink-0" />
                      <span>Fila de Envios</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/assinatura"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/assinatura" aria-label="Meu Plano" className="flex items-center gap-2">
                      <CreditCard className="shrink-0" />
                      <span>Meu Plano</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">
              Dados
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/dados/clientes"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/dados/clientes" aria-label="Pacientes" className="flex items-center gap-2">
                      <Users className="shrink-0" />
                      <span>Pacientes</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/dados/procedimentos"}
                    className="group rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-secondary/10 hover:text-secondary-foreground/90 data-[active=true]:border-secondary/60 data-[active=true]:bg-secondary/20 data-[active=true]:text-secondary-foreground"
                  >
                    <NavLink to="/dados/procedimentos" aria-label="Procedimentos" className="flex items-center gap-2">
                      <FileText className="shrink-0" />
                      <span>Procedimentos</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
          <div className="flex flex-col gap-1 group-data-[collapsible=icon]:items-center">
            <NavLink
              to="/configuracoes"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 transition-colors hover:border hover:border-secondary/60 hover:bg-secondary/10 hover:text-secondary-foreground/90"
            >
              <Settings className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Configurações</span>
            </NavLink>
            <p className="px-1 text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
              © {new Date().getFullYear()} DentOS v{__APP_VERSION__}
            </p>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-border bg-gradient-to-r from-primary/5 via-accent/10 to-secondary/10 px-3 sm:px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden" />
            <div className="hidden items-center gap-2 md:flex" />
          </div>
          <div className="flex flex-1 items-center justify-between gap-4 overflow-hidden">
            <div className="flex flex-1 items-center gap-2 overflow-x-auto py-1 mr-2 no-scrollbar">
              {isSuperAdmin && !isImpersonating && (
                <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shadow-sm shrink-0">
                  <span className="font-bold tracking-wider bg-destructive text-destructive-foreground px-1 py-0.2 rounded text-[9px]">
                    MASTER
                  </span>
                  <span className="hidden md:inline">
                    Visualizando dados consolidados de todas as clínicas.
                  </span>
                  <span className="md:hidden">
                    Consolidado de clínicas.
                  </span>
                </div>
              )}
              {impersonatedClinicaName && (
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-500 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shadow-sm shrink-0 animate-pulse">
                  <span className="font-bold tracking-wider bg-amber-500 text-white px-1 py-0.2 rounded text-[9px] uppercase">
                    VISÃO
                  </span>
                  <span>Clínica: <strong>{impersonatedClinicaName}</strong></span>
                  <button 
                    onClick={handleStopImpersonation}
                    className="ml-1 text-[9px] underline hover:text-amber-600 font-semibold"
                  >
                    Sair
                  </button>
                </div>
              )}
              {(() => {
                const config = whatsappStatusQuery?.data;
                if (!config?.easydental_usuario || !config?.ultima_sync_sucesso) return null;
                const diasSemSync = Math.floor((Date.now() - new Date(config.ultima_sync_sucesso).getTime()) / (1000 * 60 * 60 * 24));
                if (diasSemSync < 7) return null;
                return (
                  <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shadow-sm shrink-0">
                    <span className="text-red-500 text-xs animate-pulse">🔴</span>
                    <span>Sync parado há {diasSemSync} dias</span>
                    <button
                      onClick={() => navigate("/configuracoes?tab=sistema")}
                      className="ml-1 text-[9px] underline hover:text-red-700 font-semibold"
                    >
                      Ajustar
                    </button>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate("/configuracoes?tab=geral#whatsapp-config")}
                className={
                  "flex items-center gap-1 sm:gap-1.5 rounded-full border px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium transition-all " +
                  (whatsappStatusQuery.isLoading
                    ? "border-muted-foreground/40 bg-muted/40 text-muted-foreground cursor-wait"
                    : (whatsappStatusQuery.data?.conectado ?? false)
                    ? "border-transparent bg-[hsl(var(--login-primary))] text-primary-foreground shadow-sm shadow-[hsl(var(--login-primary))]/60 hover:shadow-md"
                    : "border-destructive/80 bg-destructive/10 text-destructive hover:bg-destructive/20 animate-pulse")
                }
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {whatsappStatusQuery.isLoading
                    ? "Verificando..."
                    : (whatsappStatusQuery.data?.conectado ?? false)
                    ? "WhatsApp conectado"
                    : "Conectar WhatsApp"}
                </span>
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 bg-background/80 p-3 sm:p-4">
          <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4 font-sans">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;
