import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  getStoredSteamId,
  redirectToSteamLogin,
  setStoredSteamId,
} from "@/lib/steam-auth";
import { STORAGE_KEY, type Game } from "@/lib/game-types";
import type { SteamLibraryItem } from "@/components/SteamImportDialog";

const isElectron =
  typeof window !== "undefined" && !!(window as unknown as { rubix?: unknown }).rubix;

const Login = () => {
  const navigate = useNavigate();
  const [steamIdInput, setSteamIdInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Sign in — RUBIX Launcher";
    if (getStoredSteamId()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleWebSignIn = () => {
    const returnTo = `${window.location.origin}/auth/callback`;
    redirectToSteamLogin(returnTo);
  };

  const handleDesktopSignIn = async () => {
    const id = steamIdInput.trim();
    if (!/^\d{17}$/.test(id)) {
      toast.error("Invalid SteamID64", {
        description: "It must be a 17-digit number from your Steam profile URL.",
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("steam-import", {
        body: { steamId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const list: SteamLibraryItem[] = data?.games ?? [];
      setStoredSteamId(id);

      if (list.length === 0) {
        toast.warning("Signed in, but no games found", {
          description:
            data?.warning ??
            "Make sure your Steam profile and game details are public.",
        });
      } else {
        const existingRaw = localStorage.getItem(STORAGE_KEY);
        const existing: Game[] = existingRaw ? JSON.parse(existingRaw) : [];
        const existingAppIds = new Set(
          existing.map((g) => g.steamAppId).filter((x): x is number => !!x),
        );
        const now = Date.now();
        const newGames: Game[] = list
          .filter((s) => !existingAppIds.has(s.appId))
          .map((s) => ({
            id: crypto.randomUUID(),
            title: s.title,
            cover: s.cover,
            path: s.launchPath,
            lastPlayedAt: s.lastPlayedAt,
            steamAppId: s.appId,
            addedAt: now,
          }));
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([...newGames, ...existing]),
        );
        toast.success("Welcome!", {
          description: `${newGames.length} new games added · ${list.length} total`,
        });
      }
      navigate("/", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Sign-in failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center px-6">
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
          <h1 className="text-4xl font-bold tracking-tight">RUBIX Launcher</h1>
          <p className="text-muted-foreground mt-2 max-w-xs">
            One library. All your games. Sign in with Steam to instantly sync your collection.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          {isElectron ? (
            <>
              <label className="text-sm font-medium mb-2 block">
                Your SteamID64
              </label>
              <Input
                value={steamIdInput}
                onChange={(e) => setSteamIdInput(e.target.value)}
                placeholder="76561198000000000"
                inputMode="numeric"
                className="h-12 rounded-xl mb-3"
                disabled={loading}
              />
              <Button
                onClick={handleDesktopSignIn}
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)] text-base"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <LogIn className="h-5 w-5 mr-2" />
                )}
                Connect Steam library
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Find your SteamID64 at{" "}
                <a
                  href="https://steamid.io"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-foreground"
                  onClick={(e) => {
                    if (isElectron) {
                      e.preventDefault();
                      (window as unknown as {
                        rubix?: { launchGame: (u: string) => void };
                      }).rubix?.launchGame("https://steamid.io");
                    }
                  }}
                >
                  steamid.io
                </a>{" "}
                — paste your profile URL there.
              </p>
            </>
          ) : (
            <Button
              onClick={handleWebSignIn}
              className="w-full h-14 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)] text-base"
            >
              <LogIn className="h-5 w-5 mr-2" />
              Sign in through Steam
            </Button>
          )}

          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Instantly imports your full owned games library.</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>
                Only your public SteamID is used — no password is ever shared.
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
