import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BuyLana8Wonder from "./pages/BuyLana8Wonder";
import AdminBuyLana from "./pages/AdminBuyLana";
import AdminWaitingList from "./pages/AdminWaitingList";
import AdminSlotsVisibility from "./pages/AdminSlotsVisibility";
import AdminDomainSettings from "./pages/AdminDomainSettings";
import BuyLanaInstructions from "./pages/BuyLanaInstructions";
import CreateLana8Wonder from "./pages/CreateLana8Wonder";
import AssignLana8Wonder from "./pages/AssignLana8Wonder";
import PreviewLana8Wonder from "./pages/PreviewLana8Wonder";
import SendLana from "./pages/SendLana";
import SendLanaConfirm from "./pages/SendLanaConfirm";
import SendLanaResult from "./pages/SendLanaResult";
import SendLana8WonderTransfer from "./pages/SendLana8WonderTransfer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/buy-lana8wonder" element={<BuyLana8Wonder />} />
          <Route path="/admin-buy-lana" element={<AdminBuyLana />} />
          <Route path="/admin-waiting-list" element={<AdminWaitingList />} />
          <Route path="/admin-slots-visibility" element={<AdminSlotsVisibility />} />
          <Route path="/admin-domain-settings" element={<AdminDomainSettings />} />
          <Route path="/buy-lana-instructions" element={<BuyLanaInstructions />} />
          <Route path="/create-lana8wonder" element={<CreateLana8Wonder />} />
          <Route path="/assign-lana8wonder" element={<AssignLana8Wonder />} />
          <Route path="/preview-lana8wonder" element={<PreviewLana8Wonder />} />
          <Route path="/send-lana" element={<SendLana />} />
          <Route path="/send-lana-confirm" element={<SendLanaConfirm />} />
          <Route path="/send-lana-result" element={<SendLanaResult />} />
          <Route path="/send-lana8wonder-transfer" element={<SendLana8WonderTransfer />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
