import { useEffect, useState } from "react";
import { Loader2, Link2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { setStoredSteamId } from "@/lib/steam-auth";
import { useRubixAuth } from "@/hooks/useRubixAuth";

const SKIP_KEY = "rubix:steam-link-skipped";

export const LinkSteamPrompt = () => {
  const { user, profile, refreshProfile } = useRubixAuth();
  const [open, setOpen] = useState(false);
  const [steamIdInput, setSteamIdInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.steam_id) return;
    if (localStorage.getItem(SKIP_KEY)) return;
    setOpen(true);
  }, [user, profile]);

  const handleLink = async () => {
    const id = steamIdInput.trim();
    if (!/^\d{17}$/.test(id)) {
      toast.error("Invalid SteamID64", {
        description: "Must be a 17-digit number from your Steam profile URL.",
      });
      return;
    }
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ steam_id: id })
      .eq("user_id", user.id);
    setLoading(false);
    if (error) {
      toast.error("Couldn't link Steam", { description: error.message });
      return;
    }
    setStoredSteamId(id);
    await refreshProfile();
    toast.success("Steam linked!");
    setOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(SKIP_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Link your Steam account
          </DialogTitle>
          <DialogDescription>
            Connect Steam to import your library and see Rubix friends.
            You can do this later from settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium">Your SteamID64</label>
          <Input
            value={steamIdInput}
            onChange={(e) => setSteamIdInput(e.target.value)}
            placeholder="76561198000000000"
            inputMode="numeric"
            className="h-11 rounded-xl"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Find it at <a href="https://steamid.io" target="_blank" rel="noreferrer" className="underline">steamid.io</a>
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleSkip} disabled={loading}>
            <X className="h-4 w-4 mr-1" />
            Skip for now
          </Button>
          <Button onClick={handleLink} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            Link Steam
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
