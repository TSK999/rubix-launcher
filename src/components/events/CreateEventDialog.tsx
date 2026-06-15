import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listChannels, type CommunityChannel } from "@/lib/communities";
import { STORAGE_KEY, type Game } from "@/lib/game-types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  creatorId: string;
  onCreated?: () => void;
};

// Default starts_at value: next half-hour in local time (datetime-local format)
const defaultStart = () => {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const CreateEventDialog = ({ open, onOpenChange, communityId, creatorId, onCreated }: Props) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [gameCover, setGameCover] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [durationMin, setDurationMin] = useState(120);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [maxAttendees, setMaxAttendees] = useState<number | null>(null);
  const [voiceChannels, setVoiceChannels] = useState<CommunityChannel[]>([]);
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listChannels(communityId).then((chs) => {
      setVoiceChannels(chs.filter((c) => c.kind === "voice"));
    });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLibraryGames(JSON.parse(raw));
    } catch {}
  }, [open, communityId]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setGameTitle("");
    setGameCover(null);
    setStartsAt(defaultStart());
    setDurationMin(120);
    setChannelId(null);
    setMaxAttendees(null);
  };

  const pickGame = (t: string) => {
    const g = libraryGames.find((x) => x.title === t);
    setGameTitle(t);
    setGameCover(g?.cover ?? null);
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (!startsAt) return toast.error("Start time required");
    const startsDate = new Date(startsAt);
    if (isNaN(startsDate.getTime())) return toast.error("Invalid start time");

    setBusy(true);
    const endsDate = durationMin > 0 ? new Date(startsDate.getTime() + durationMin * 60 * 1000) : null;
    const { error } = await supabase.from("community_events").insert({
      community_id: communityId,
      creator_id: creatorId,
      title: title.trim(),
      description: description.trim() || null,
      game_title: gameTitle.trim() || null,
      game_cover: gameCover,
      starts_at: startsDate.toISOString(),
      ends_at: endsDate?.toISOString() ?? null,
      channel_id: channelId,
      max_attendees: maxAttendees,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't create event", { description: error.message });
      return;
    }
    toast.success("Event created");
    onCreated?.();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New community event</DialogTitle>
          <DialogDescription>Schedule a play session for your community.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Night Apex" maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-game">Game (optional)</Label>
            <Input
              id="ev-game"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="Apex Legends"
              list="ev-game-suggestions"
            />
            <datalist id="ev-game-suggestions">
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
                    onClick={() => pickGame(g.title)}
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
              <Label htmlFor="ev-start">Starts</Label>
              <Input id="ev-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={String(durationMin)} onValueChange={(v) => setDurationMin(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No end</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Voice channel</Label>
              <Select value={channelId ?? "none"} onValueChange={(v) => setChannelId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {voiceChannels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-max">Max attendees</Label>
              <Input
                id="ev-max"
                type="number"
                min={0}
                value={maxAttendees ?? ""}
                onChange={(e) => setMaxAttendees(e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description (optional)</Label>
            <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
