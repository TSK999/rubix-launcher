import { Link } from "react-router-dom";
import { Film, LogOut, MessageSquare, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { supabase } from "@/integrations/supabase/client";

const HomeMobile = () => {
  const { profile } = useRubixAuth();

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-[400px] w-[400px] rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute top-1/2 -right-24 h-[380px] w-[380px] rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            RUBIX
          </p>
          <p className="text-2xl font-black tracking-tight mt-0.5">
            {profile?.display_name || profile?.username
              ? `Hey, ${profile.display_name ?? profile.username}`
              : "Welcome"}
          </p>
        </div>
        {profile && (
          <Link to={`/u/${profile.username}`}>
            <Avatar className="h-11 w-11 ring-2 ring-primary/60">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs font-bold">
                {profile.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
      </header>

      {/* Big choice cards */}
      <main className="px-5 pt-4 space-y-4">
        <p className="text-xs text-muted-foreground">Where do you wanna go?</p>

        <Link
          to="/clips"
          className="group relative block h-56 rounded-3xl overflow-hidden border border-border/60 bg-gradient-to-br from-primary/30 via-fuchsia-500/20 to-transparent active:scale-[0.98] transition-transform"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.4),transparent_60%)]" />
          <div className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
          <div className="relative h-full p-5 flex flex-col justify-between">
            <div className="h-12 w-12 rounded-2xl bg-background/40 backdrop-blur-md grid place-items-center border border-border/50">
              <Film className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold mb-1">
                Watch
              </p>
              <h2 className="text-3xl font-black tracking-tight leading-none">
                Clips feed
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Vertical swipe through plays from the community.
              </p>
            </div>
          </div>
        </Link>

        <Link
          to="/messages"
          className="group relative block h-56 rounded-3xl overflow-hidden border border-border/60 bg-gradient-to-br from-emerald-500/25 via-cyan-500/15 to-transparent active:scale-[0.98] transition-transform"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,hsl(var(--primary)/0.35),transparent_60%)]" />
          <div className="absolute -left-6 -bottom-6 h-40 w-40 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="relative h-full p-5 flex flex-col justify-between">
            <div className="h-12 w-12 rounded-2xl bg-background/40 backdrop-blur-md grid place-items-center border border-border/50">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold mb-1">
                Chat
              </p>
              <h2 className="text-3xl font-black tracking-tight leading-none">
                Rubix Messaging
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                DMs, groups, and community channels.
              </p>
            </div>
          </div>
        </Link>

        {profile && (
          <div className="pt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <Link
              to={`/u/${profile.username}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <UserIcon className="h-3.5 w-3.5" />
              Profile
            </Link>
            <span className="opacity-40">·</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        )}

        <p className="pt-8 pb-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          {"\n"}
        </p>
      </main>
    </div>
  );
};

export default HomeMobile;
