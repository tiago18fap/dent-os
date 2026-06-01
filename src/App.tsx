import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { ClinicaProvider } from "./contexts/ClinicaContext";

// Lazy load ALL pages for code splitting
const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Importacoes = lazy(() => import("./pages/Importacoes"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const IndiqueEGanhe = lazy(() => import("./pages/IndiqueEGanhe"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Procedimentos = lazy(() => import("./pages/Procedimentos"));
const FilaEnvios = lazy(() => import("./pages/FilaEnvios"));
const Assinatura = lazy(() => import("./pages/Assinatura"));
const ReativacaoPosBloqueio = lazy(() => import("./pages/ReativacaoPosBloqueio"));

const queryClient = new QueryClient();

// Fallback de carregamento de página (aparece ao navegar entre páginas)
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '12px',
    color: '#94a3b8',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '14px',
  }}>
    <div style={{
      width: '24px',
      height: '24px',
      border: '3px solid rgba(99, 102, 241, 0.2)',
      borderTopColor: '#6366f1',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    Carregando...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ClinicaProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/checkout/:plano" element={<Checkout />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/app" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/importacoes" element={<ProtectedRoute><Importacoes /></ProtectedRoute>} />
              <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
              <Route path="/indique-e-ganhe" element={<ProtectedRoute><IndiqueEGanhe /></ProtectedRoute>} />
              <Route path="/dados/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/dados/procedimentos" element={<ProtectedRoute><Procedimentos /></ProtectedRoute>} />
              <Route path="/fila-envios" element={<ProtectedRoute><FilaEnvios /></ProtectedRoute>} />
              <Route path="/assinatura" element={<ProtectedRoute><Assinatura /></ProtectedRoute>} />
              <Route path="/reativacao" element={<ProtectedRoute><ReativacaoPosBloqueio /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ClinicaProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
