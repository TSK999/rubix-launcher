import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play, Package, ExternalLink, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { ModpackManager } from "@/components/mods/ModpackManager";
import { findModGameForLauncherGame, modGameStorageKey } from "@/lib/mod-games";
import {
  getLaunchPref,
  listInstalledMods,
  listModpacks,
  setLaunchPref,
  syncInstalledMods,
  type InstalledMod,
  type ModpackWithMods,
} from "@/lib/modpacks";
import type { Game } from "@/lib/game-types";
import { useRubixAuth } from "@/hooks/useRubixAuth";

type Props = {
  game: Game;
  onLaunch: (g: Game) => void;
};

export function GameModsTab({ game, onLaunch }: Props) {
  const { user } = useRubixAuth();
  const modGame = useMemo(
    () => findModGameForLauncherGame({ title: game.title, steamAppId: game.steamAppId }),
    [game.title, game.steamAppId],
  );

  const [mode, setMode] = useState<"vanilla" | "modded">("vanilla");
  const [activePack, setActivePack] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [packs, setPacks] = useState<ModpackWithMods[]>([]);
  const [loading, setLoading] = useState(true);

  const isElectron =
    typeof window !== "undefined" && (window as any).rubix?.isElectron === true;

  useEffect(() => {
    if (!modGame || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Detect installed mods from the desktop app first, then mirror.
        if (isElectron && (window as any).rubix?.mods) {
          const key = modGameStorageKey(modGame);
          const r = await (window as any).rubix.mods.listInstalled(key);
          if (r?.ok && r.installed) {
            const detected = Object.entries(r.installed as Record<string, { version: string; versionId: number; name?: string }>).map(
              ([modId, v]) => ({
                mod_source: modGame.provider,
                mod_id: modId,
                mod_name: v.name ?? modId,
                version: v.version ?? null,
                install_path: null,
              }),
            );
            await syncInstalledMods(modGame.slug, detected);
          }
        }
        const [inst, pks, pref] = await Promise.all([
          listInstalledMods(modGame.slug),
          listModpacks(modGame.slug),
          getLaunchPref(game.id),
        ]);
        if (cancelled) return;
        setInstalled(inst);
        setPacks(pks);
        if (pref) {
          setMode(pref.last_mode);
          setActivePack(pref.active_modpack_id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modGame, user?.id, game.id, isElectron]);

  if (!modGame) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Mod manager doesn't support this game yet.
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Sign in to your Rubix account to manage mods and modpacks.
      </Card>
    );
  }

  const installedForPacks = installed.map((m) => ({
    mod_source: m.mod_source,
    mod_id: m.mod_id,
    mod_name: m.mod_name,
    version: m.version,
    enabled: true,
  }));

  const handleLaunch = async () => {
    await setLaunchPref({ gameId: game.id, mode, modpackId: mode === "modded" ? activePack : null });
    onLaunch(game);
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Launch mode</h3>
            <p className="text-xs text-muted-foreground">
              Choose how to start {game.title}.
            </p>
          </div>
          <Badge variant="outline">{modGame.providerLabel}</Badge>
        </div>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as "vanilla" | "modded")}
          className="justify-start"
        >
          <ToggleGroupItem value="vanilla" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Vanilla
          </ToggleGroupItem>
          <ToggleGroupItem value="modded" className="gap-1">
            <Package className="h-3.5 w-3.5" /> Modded
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === "modded" && (
          <div className="space-y-2">
            <Select
              value={activePack ?? "__installed__"}
              onValueChange={(v) => setActivePack(v === "__installed__" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a modpack" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__installed__">
                  Currently installed mods ({installed.length})
                </SelectItem>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.mods.length} mod{p.mods.length === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isElectron && (
              <p className="text-[11px] text-muted-foreground">
                Modpacks are applied automatically by the RUBIX desktop app on launch.
              </p>
            )}
          </div>
        )}

        <Button
          onClick={handleLaunch}
          className="w-full rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]"
        >
          <Play className="mr-2 h-4 w-4 fill-current" />
          Launch {mode === "vanilla" ? "Vanilla" : "Modded"}
        </Button>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Installed mods</h3>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link to="/mods">
              Browse mods <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Detecting installed mods...
          </div>
        ) : installed.length === 0 ? (
          <Card className="border-dashed p-4 text-sm text-muted-foreground">
            {isElectron
              ? "No mods detected. Install some from the Mod Manager."
              : "Open the RUBIX desktop app to detect installed mods."}
          </Card>
        ) : (
          <Card className="divide-y">
            {installed.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.mod_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.mod_source}
                    {m.version ? ` · v${m.version}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <ModpackManager
        gameSlug={modGame.slug}
        gameTitle={game.title}
        installedMods={installedForPacks}
        compact
      />
    </div>
  );
}
