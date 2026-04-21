import { Clock, Heart, Library, LogOut, Sparkles, Store, Gamepad2, Box, Gamepad, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clearStoredSteamId } from "@/lib/steam-auth";
import { supabase } from "@/integrations/supabase/client";
import { ThemeManager } from "@/components/ThemeManager";
import { SteamFriendsPanel } from "@/components/SteamFriendsPanel";
import { SpotifyNowPlaying } from "@/components/SpotifyNowPlaying";
import { MessagesPanel } from "@/components/MessagesPanel";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import rubixIcon from "@/assets/rubix-friends-icon.png";
import type { GameSource } from "@/lib/game-types";

export type Collection = "all" | "favorites" | "recent";

type Props = {
  collection: Collection;
  onCollection: (c: Collection) => void;
  genres: string[];
  selectedGenre: string | null;
  onGenre: (g: string | null) => void;
  counts: { all: number; favorites: number; recent: number };
  selectedSource: GameSource | null;
  onSource: (s: GameSource | null) => void;
  sourceCounts: { steam: number; epic: number; ea: number; other: number };
};

export const Sidebar = ({
  collection,
  onCollection,
  genres,
  selectedGenre,
  onGenre,
  counts,
  selectedSource,
  onSource,
  sourceCounts,
}: Props) => {
  const navigate = useNavigate();
  const { profile } = useRubixAuth();
  const steamId = profile?.steam_id ?? null;
  const userId = profile?.user_id ?? null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearStoredSteamId();
    toast("Signed out of Rubix");
    navigate("/login", { replace: true });
  };

  const items: { id: Collection; label: string; icon: typeof Library; count: number }[] = [
    { id: "all", label: "All games", icon: Library, count: counts.all },
    { id: "favorites", label: "Favorites", icon: Heart, count: counts.favorites },
    { id: "recent", label: "Recently played", icon: Clock, count: counts.recent },
  ];

  const stores: { id: GameSource; label: string; icon: typeof Library; count: number }[] = [
    { id: "steam", label: "Steam", icon: Gamepad2, count: sourceCounts.steam },
    { id: "epic", label: "Epic Games", icon: Store, count: sourceCounts.epic },
    { id: "ea", label: "EA app", icon: Gamepad, count: sourceCounts.ea },
    { id: "other", label: "Other", icon: Box, count: sourceCounts.other },
  ];

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-border bg-card/30 backdrop-blur-sm">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <img src={rubixIcon} alt="" className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base font-bold tracking-tight leading-none">RUBIX</h1>
          {profile ? (
            <p className="text-[11px] text-muted-foreground mt-1 truncate" title={profile.username}>
              @{profile.username}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Launcher</p>
          )}
        </div>
      </div>

      <SpotifyNowPlaying userId={userId} />

      <MessagesPanel />

      <SteamFriendsPanel steamId={steamId} />

      <nav className="p-3 space-y-1">
        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Library
        </p>
        {items.map(({ id, label, icon: Icon, count }) => {
          const active = collection === id;
          return (
            <button
              key={id}
              onClick={() => onCollection(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Stores
        </p>
        <button
          onClick={() => onSource(null)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
            selectedSource === null
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Library className={cn("h-4 w-4", selectedSource === null && "text-primary")} />
          <span className="flex-1 text-left">All stores</span>
        </button>
        {stores.map(({ id, label, icon: Icon, count }) => {
          const active = selectedSource === id;
          return (
            <button
              key={id}
              onClick={() => onSource(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>

      {genres.length > 0 && (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-3 pt-2 pb-2">
            <Sparkles className="h-3 w-3 text-muted-foreground" />
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Genres
            </p>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            <button
              onClick={() => onGenre(null)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                selectedGenre === null
                  ? "text-foreground bg-secondary/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              )}
            >
              All genres
            </button>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => onGenre(g)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors truncate",
                  selectedGenre === g
                    ? "text-foreground bg-secondary/60"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto">
        <ThemeManager />
      </div>

      <div className="p-3 border-t border-border">
        {!steamId && (
          <button
            onClick={() => {
              localStorage.removeItem("rubix:steam-link-skipped");
              window.location.reload();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors mb-1"
          >
            <Link2 className="h-4 w-4" />
            <span>Link Steam</span>
          </button>
        )}
        {steamId && (
          <p className="px-3 pb-2 text-[11px] text-muted-foreground font-mono truncate" title={steamId}>
            Steam · {steamId.slice(-6)}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};
