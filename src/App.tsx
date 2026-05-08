import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Importacoes from "./pages/Importacoes";
import Campanhas from "./pages/Campanhas";
import IndiqueEGanhe from "./pages/IndiqueEGanhe";
import Configuracoes from "./pages/Configuracoes";
import Clientes from "./pages/Clientes";
import Procedimentos from "./pages/Procedimentos";
import FilaEnvios from "./pages/FilaEnvios";
import Assinatura from "./pages/Assinatura";
import ProtectedRoute from "./components/ProtectedRoute";
import { ClinicaProvider } from "./contexts/ClinicaContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ClinicaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/app" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/importacoes" element={<ProtectedRoute><Importacoes /></ProtectedRoute>} />
            <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
            <Route path="/indique-e-ganhe" element={<ProtectedRoute><IndiqueEGanhe /></ProtectedRoute>} />
            <Route path="/dados/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/dados/procedimentos" element={<ProtectedRoute><Procedimentos /></ProtectedRoute>} />
            <Route path="/fila-envios" element={<ProtectedRoute><FilaEnvios /></ProtectedRoute>} />
            <Route path="/assinatura" element={<ProtectedRoute><Assinatura /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ClinicaProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
