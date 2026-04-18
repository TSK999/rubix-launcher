import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertTriangle, Gamepad2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setStoredSteamId } from "@/lib/steam-auth";
import { STORAGE_KEY, type Game } from "@/lib/game-types";
import type { SteamLibraryItem } from "@/components/SteamImportDialog";

type Status = "verifying" | "importing" | "error";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("Verifying your Steam sign-in...");
  const [count, setCount] = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    document.title = "Signing in — RUBIX Launcher";
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        // Collect all openid.* params Steam sent back
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          if (key.startsWith("openid.")) params[key] = value;
        });

        if (Object.keys(params).length === 0) {
          throw new Error("No Steam sign-in data found in URL.");
        }

        // 1. Validate with Steam
        const { data: authData, error: authErr } = await supabase.functions.invoke(
          "steam-auth",
          { body: { params } },
        );
        if (authErr) throw authErr;
        if (authData?.error) throw new Error(authData.error);

        const steamId: string | undefined = authData?.steamId;
        if (!steamId) throw new Error("Steam did not return a valid ID.");

        setStoredSteamId(steamId);

        // 2. Fetch owned games (list mode)
        setStatus("importing");
        setMessage("Fetching your Steam library...");

        const { data: listData, error: listErr } = await supabase.functions.invoke(
          "steam-import",
          { body: { steamId } },
        );
        if (listErr) throw listErr;
        if (listData?.error) throw new Error(listData.error);

        const list: SteamLibraryItem[] = listData?.games ?? [];

        if (list.length === 0) {
          toast.warning("Signed in, but no games found", {
            description:
              listData?.warning ??
              "Make sure your Steam profile and game details are public.",
          });
          navigate("/", { replace: true });
          return;
        }

        setCount(list.length);
        setMessage(`Importing ${list.length} games...`);

        // 3. Merge into existing library (skip apps already there)
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

        const merged = [...newGames, ...existing];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

        toast.success("Welcome!", {
          description: `${newGames.length} new games added · ${list.length} total in your Steam library`,
        });

        navigate("/", { replace: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error("Steam auth callback failed:", msg);
        setStatus("error");
        setMessage(msg);
      }
    };

    run();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="h-16 w-16 mx-auto rounded-3xl bg-[image:var(--gradient-primary)] grid place-items-center shadow-[var(--glow-primary)] mb-6">
          {status === "error" ? (
            <AlertTriangle className="h-8 w-8 text-primary-foreground" />
          ) : (
            <Gamepad2 className="h-8 w-8 text-primary-foreground" />
          )}
        </div>

        {status !== "error" ? (
          <>
            <div className="flex items-center justify-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <h1 className="text-xl font-semibold">{message}</h1>
            </div>
            {count > 0 && (
              <p className="text-sm text-muted-foreground">
                Steam returned {count} games
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-2">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button
              onClick={() => navigate("/login", { replace: true })}
              className="rounded-2xl"
            >
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
