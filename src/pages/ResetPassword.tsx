import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    document.title = "Reset password — RUBIX";
    // Supabase exchanges the recovery token from the URL hash automatically.
    // We just need to wait for the recovery session to be established.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password too short", { description: "Use at least 6 characters." });
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Couldn't update password", { description: error.message });
      return;
    }
    toast.success("Password updated", { description: "You're signed in." });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <main className="relative w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-muted-foreground mt-2 max-w-xs">
            Choose a new password for your Rubix account.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          {!ready ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Verifying recovery link…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="pw-new">New password</Label>
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={loading}
                  className="h-11 rounded-xl mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pw-confirm">Confirm password</Label>
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  disabled={loading}
                  className="h-11 rounded-xl mt-1"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Update password
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full h-10 rounded-xl text-muted-foreground"
                onClick={() => navigate("/login", { replace: true })}
              >
                Back to sign in
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
