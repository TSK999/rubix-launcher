import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";

// Electron loads via file:// — use HashRouter to avoid 404s on deep paths
const Router = typeof window !== "undefined" && (window as any).rubix?.isElectron
  ? HashRouter
  : BrowserRouter;
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import NotFound from "./pages/NotFound.tsx";
import RubixProfile from "./pages/RubixProfile.tsx";
import Messages from "./pages/Messages.tsx";
import { RequireRubixAuth } from "./components/RequireRubixAuth";
import { LinkSteamPrompt } from "./components/LinkSteamPrompt";
import { UpdateNotifier } from "./components/UpdateNotifier";
import { UpdateSplash } from "./components/UpdateSplash";
import { ControllerModeProvider } from "./hooks/useControllerMode";
import { IncomingCallToast } from "./components/messaging/IncomingCallToast";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ControllerModeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdateNotifier />
      <UpdateSplash />
      <Router>
        <IncomingCallToast />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireRubixAuth>
                <>
                  <LinkSteamPrompt />
                  <Index />
                </>
              </RequireRubixAuth>
            }
          />
          <Route
            path="/messages"
            element={
              <RequireRubixAuth>
                <Messages />
              </RequireRubixAuth>
            }
          />
          <Route
            path="/u/:username"
            element={
              <RequireRubixAuth>
                <RubixProfile />
              </RequireRubixAuth>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </TooltipProvider>
    </ControllerModeProvider>
  </QueryClientProvider>
);

export default App;
