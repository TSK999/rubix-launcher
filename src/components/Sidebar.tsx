import { Clock, Heart, Library, Sparkles, Box, Settings, ShoppingBag, Library as LibraryIcon, Code2, Shield, Gamepad2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SteamFriendsPanel } from "@/components/SteamFriendsPanel";
import { SpotifyNowPlaying } from "@/components/SpotifyNowPlaying";
import { MessagesPanel } from "@/components/MessagesPanel";
import { UserSearchPopover } from "@/components/UserSearchPopover";
import { StoreIcon } from "@/components/StoreIcon";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import rubixIcon from "@/assets/rubix-friends-icon.png";
import type { GameSource } from "@/lib/game-types";
import { useState } from "react";

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
  sourceCounts: { steam: number; epic: number; ea: number; xbox: number; riot: number; other: number };
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
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { profile } = useRubixAuth();
  const { isDeveloper, isAdmin } = useUserRoles();
  const steamId = profile?.steam_id ?? null;
  const userId = profile?.user_id ?? null;

  const navItems: { to: string; label: string; icon: typeof Library; show: boolean }[] = [
    { to: "/", label: "Launcher", icon: Gamepad2, show: true },
    { to: "/store", label: "RUBIX Store", icon: ShoppingBag, show: true },
    { to: "/library", label: "Library", icon: LibraryIcon, show: true },
    { to: "/developer", label: "Developer", icon: Code2, show: isDeveloper },
    { to: "/admin/review", label: "Admin", icon: Shield, show: isAdmin },
  ];

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const items: { id: Collection; label: string; icon: typeof Library; count: number }[] = [
    { id: "all", label: "All games", icon: Library, count: counts.all },
    { id: "favorites", label: "Favorites", icon: Heart, count: counts.favorites },
    { id: "recent", label: "Recently played", icon: Clock, count: counts.recent },
  ];

  const stores: { id: GameSource; label: string; count: number }[] = [
    { id: "steam", label: "Steam", count: sourceCounts.steam },
    { id: "epic", label: "Epic Games", count: sourceCounts.epic },
    { id: "ea", label: "EA app", count: sourceCounts.ea },
    { id: "xbox", label: "Xbox", count: sourceCounts.xbox },
    { id: "riot", label: "Riot", count: sourceCounts.riot },
    { id: "other", label: "Other", count: sourceCounts.other },
  ];

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-border bg-card/30 backdrop-blur-sm h-screen sticky top-0 overflow-y-auto rubix-scroll-dark">
      <div className="p-4 border-b border-border flex items-center gap-3">
        {profile ? (
          <Link
            to={`/u/${profile.username}`}
            className="shrink-0 h-8 w-8 rounded-full overflow-hidden bg-secondary grid place-items-center hover:ring-2 hover:ring-primary transition-all"
            title={`View @${profile.username}'s profile`}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`@${profile.username}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <img src={rubixIcon} alt="" className="h-full w-full" />
            )}
          </Link>
        ) : (
          <img src={rubixIcon} alt="" className="h-8 w-8 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold tracking-tight leading-none">RUBIX</h1>
          {profile ? (
            <Link
              to={`/u/${profile.username}`}
              className="text-[11px] text-muted-foreground mt-1 truncate block hover:text-foreground transition-colors"
              title={`View @${profile.username}'s profile`}
            >
              @{profile.username}
            </Link>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Launcher</p>
          )}
        </div>
        <UserSearchPopover />
      </div>

      <SpotifyNowPlaying userId={userId} />

      <MessagesPanel />

      <SteamFriendsPanel steamId={steamId} />

      <nav className="p-3 space-y-1">
        <p className="px-3 pt-2 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Navigate
        </p>
        <div className="space-y-0.5 rounded-2xl bg-secondary/20 p-1.5 border border-border/50">
          {navItems.filter((i) => i.show).map(({ to, label, icon: Icon }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-sm transition-all",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                {active && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]" />
                )}
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </div>

        <p className="px-3 pt-5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Local library
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
        {stores.map(({ id, label, count }) => {
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
              {id === "other" ? (
                <Box className={cn("h-4 w-4", active && "text-primary")} />
              ) : (
                <StoreIcon source={id} className={cn(active && "opacity-100", !active && "opacity-70")} />
              )}
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

      <div className="mt-auto p-3 border-t border-border">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userId={userId}
        steamId={steamId}
        onSignedOut={() => navigate("/login", { replace: true })}
      />
    </aside>
  );
};
