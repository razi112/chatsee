import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CallProvider } from "@/contexts/CallContext";
import CallScreen from "@/components/chat/CallScreen";
import IncomingCallDialog from "@/components/chat/IncomingCallDialog";
import { useCall } from "@/contexts/CallContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const CallOverlays = () => {
  const { call } = useCall();
  return <>
    <IncomingCallDialog />
    {call && <CallScreen />}
  </>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CallProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <CallOverlays />
          </BrowserRouter>
        </TooltipProvider>
      </CallProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
