import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogIn, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { setStoredSteamId } from "@/lib/steam-auth";
import { STORAGE_KEY, type Game } from "@/lib/game-types";
import rubixIcon from "@/assets/rubix-friends-icon.png";

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    document.title = "Sign in — RUBIX";
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Sign-in failed", { description: error.message });
      return;
    }
    toast.success("Welcome back!");
    navigate("/", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      toast.error("Invalid username", {
        description: "3-20 chars, letters, numbers and underscores only.",
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { username, display_name: username },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Sign-up failed", { description: error.message });
      return;
    }
    toast.success("Account created!", {
      description: "Check your email to verify your address, then sign in.",
    });
    setTab("signin");
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setLoading(false);
      toast.error("Google sign-in failed", { description: error.message });
    }
  };

  const handleDemoLaunch = async () => {
    const demoGames: Game[] = [
      {
        id: crypto.randomUUID(),
        title: "Hollow Knight",
        cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg",
        genre: "Metroidvania",
        favorite: true,
        addedAt: Date.now(),
        steamAppId: 367520,
      },
      {
        id: crypto.randomUUID(),
        title: "Hades",
        cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg",
        genre: "Roguelike",
        addedAt: Date.now() - 1000,
        steamAppId: 1145360,
      },
      {
        id: crypto.randomUUID(),
        title: "Stardew Valley",
        cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg",
        genre: "Farming Sim",
        favorite: true,
        addedAt: Date.now() - 4000,
        steamAppId: 413150,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoGames));
    setStoredSteamId("demo");
    // Sign in as anonymous demo isn't supported (we disabled it). Instead redirect to login note.
    toast("Demo games loaded — sign in to access the launcher");
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
        <div className="flex flex-col items-center text-center mb-8">
          <img src={rubixIcon} alt="Rubix" className="h-16 w-16 mb-3 drop-shadow-lg" />
          <h1 className="text-4xl font-bold tracking-tight">RUBIX</h1>
          <p className="text-muted-foreground mt-2 max-w-xs">
            Your unified game library. Sign in or create your Rubix account.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2 mb-5">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <Label htmlFor="email-in">Email</Label>
                  <Input
                    id="email-in"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pw-in">Password</Label>
                  <Input
                    id="pw-in"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 rounded-xl mt-1"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <Label htmlFor="user-up">Username</Label>
                  <Input
                    id="user-up"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="rubix_player"
                    required
                    disabled={loading}
                    minLength={3}
                    maxLength={20}
                    className="h-11 rounded-xl mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">3-20 chars · letters, numbers, underscore</p>
                </div>
                <div>
                  <Label htmlFor="email-up">Email</Label>
                  <Input
                    id="email-up"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pw-up">Password</Label>
                  <Input
                    id="pw-up"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                    className="h-11 rounded-xl mt-1"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Create Rubix account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            onClick={handleGoogle}
            variant="outline"
            disabled={loading}
            className="w-full h-12 rounded-2xl"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <Button
            onClick={handleDemoLaunch}
            variant="ghost"
            className="w-full h-10 rounded-xl mt-3 text-muted-foreground"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Preload demo games
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Login;
