import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LfgMode, LfgVisibility } from "@/hooks/useLfgPosts";
import { STORAGE_KEY, type Game } from "@/lib/game-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  onCreated?: () => void;
};

type Community = { id: string; name: string };

export const CreateLfgPostDialog = ({ open, onOpenChange, hostId, onCreated }: Props) => {
  const [gameTitle, setGameTitle] = useState("");
  const [gameCover, setGameCover] = useState<string | null>(null);
  const [slotsTotal, setSlotsTotal] = useState(4);
  const [mode, setMode] = useState<LfgMode>("casual");
  const [notes, setNotes] = useState("");
  const [micRequired, setMicRequired] = useState(false);
  const [visibility, setVisibility] = useState<LfgVisibility>("friends");
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [durationHours, setDurationHours] = useState(2);
  const [busy, setBusy] = useState(false);
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);

  useEffect(() => {
    if (!open) return;

    // Load library games for quick pick
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLibraryGames(JSON.parse(raw));
    } catch {}

    // Try to auto-fill from current presence
    void supabase
      .from("user_presence")
      .select("game")
      .eq("user_id", hostId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.game && !gameTitle) setGameTitle(data.game);
      });

    // Load communities the user is in
    void supabase
      .from("community_members")
      .select("community_id, communities(id, name)")
      .eq("user_id", hostId)
      .then(({ data }) => {
        const list: Community[] = (data ?? [])
          .map((r: any) => r.communities)
          .filter(Boolean);
        setCommunities(list);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hostId]);

  const reset = () => {
    setGameTitle("");
    setGameCover(null);
    setSlotsTotal(4);
    setMode("casual");
    setNotes("");
    setMicRequired(false);
    setVisibility("friends");
    setCommunityId(null);
    setDurationHours(2);
  };

  const pickFromLibrary = (title: string) => {
    const g = libraryGames.find((x) => x.title === title);
    setGameTitle(title);
    setGameCover(g?.cover ?? null);
  };

  const submit = async () => {
    if (!gameTitle.trim()) {
      toast.error("Game title required");
      return;
    }
    if (visibility === "community" && !communityId) {
      toast.error("Pick a community");
      return;
    }
    setBusy(true);
    const expires = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
    const { error } = await supabase.from("lfg_posts").insert({
      host_id: hostId,
      game_title: gameTitle.trim(),
      game_cover: gameCover,
      slots_total: slotsTotal,
      mode,
      notes: notes.trim() || null,
      mic_required: micRequired,
      visibility,
      community_id: visibility === "community" ? communityId : null,
      expires_at: expires,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't post LFG", { description: error.message });
      return;
    }
    toast.success("LFG posted");
    onCreated?.();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Looking for group</DialogTitle>
          <DialogDescription>
            Post a session — friends or community members can hop in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lfg-game">Game</Label>
            <Input
              id="lfg-game"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="What are we playing?"
              list="lfg-game-suggestions"
            />
            <datalist id="lfg-game-suggestions">
              {libraryGames.slice(0, 50).map((g) => (
                <option key={g.id} value={g.title} />
              ))}
            </datalist>
            {libraryGames.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {libraryGames.slice(0, 6).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pickFromLibrary(g.title)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground truncate max-w-[120px]"
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Slots</Label>
              <Select value={String(slotsTotal)} onValueChange={(v) => setSlotsTotal(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2,3,4,5,6,8,10,16].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} players</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as LfgMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="ranked">Ranked</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lfg-notes">Notes (optional)</Label>
            <Textarea
              id="lfg-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Diamond+ only, chill vibes, etc."
              rows={2}
              maxLength={280}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <Label htmlFor="lfg-mic" className="cursor-pointer">Mic required</Label>
            <Switch id="lfg-mic" checked={micRequired} onCheckedChange={setMicRequired} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Visible to</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as LfgVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friends">Friends</SelectItem>
                  <SelectItem value="community" disabled={communities.length === 0}>
                    Community
                  </SelectItem>
                  <SelectItem value="public">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expires in</Label>
              <Select value={String(durationHours)} onValueChange={(v) => setDurationHours(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="2">2 hours</SelectItem>
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="8">8 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {visibility === "community" && (
            <div className="space-y-1.5">
              <Label>Community</Label>
              <Select value={communityId ?? ""} onValueChange={(v) => setCommunityId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Pick a community" /></SelectTrigger>
                <SelectContent>
                  {communities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Posting…" : "Post LFG"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
