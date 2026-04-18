import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2, LogIn, ShieldCheck, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStoredSteamId, redirectToSteamLogin } from "@/lib/steam-auth";

const Login = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Sign in — RUBIX Launcher";
    if (getStoredSteamId()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleSignIn = () => {
    const returnTo = `${window.location.origin}/auth/callback`;
    redirectToSteamLogin(returnTo);
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center px-6">
      {/* Background flourish */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 20%, hsl(var(--primary) / 0.25), transparent 60%), radial-gradient(40% 40% at 80% 80%, hsl(var(--primary) / 0.15), transparent 70%)",
        }}
      />

      <main className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="h-16 w-16 rounded-3xl bg-[image:var(--gradient-primary)] grid place-items-center shadow-[var(--glow-primary)] mb-5">
            <Gamepad2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">RUBIX Launcher</h1>
          <p className="text-muted-foreground mt-2 max-w-xs">
            One library. All your games. Sign in with Steam to instantly sync your collection.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          <Button
            onClick={handleSignIn}
            className="w-full h-14 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)] text-base"
          >
            <LogIn className="h-5 w-5 mr-2" />
            Sign in through Steam
          </Button>

          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Instantly imports your full owned games library.</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>
                Steam handles the login. We only receive your public SteamID — no password is ever shared.
              </span>
            </li>
          </ul>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            Your Steam profile and game details must be set to{" "}
            <span className="font-medium text-foreground">Public</span> for the import to work.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Not affiliated with Valve or Steam.
        </p>
      </main>
    </div>
  );
};

export default Login;
