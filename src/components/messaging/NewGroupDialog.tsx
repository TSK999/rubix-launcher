import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createGroup, searchProfiles, type ProfileLite } from "@/lib/messaging";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (conversationId: string) => void;
};

export const NewGroupDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [picked, setPicked] = useState<ProfileLite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setQ("");
      setResults([]);
      setPicked([]);
    }
  }, [open]);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const r = await searchProfiles(q);
      if (!cancel) setResults(r);
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q]);

  const submit = async () => {
    if (picked.length === 0) {
      toast.error("Add at least one member");
      return;
    }
    setBusy(true);
    try {
      const id = await createGroup(name, picked.map((p) => p.user_id));
      onCreated(id);
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't create group", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group chat</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Group name</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Squad" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Add members</p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username"
                className="pl-7"
              />
            </div>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {picked.map((p) => (
                  <span key={p.user_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-xs">
                    @{p.username}
                    <button onClick={() => setPicked((s) => s.filter((x) => x.user_id !== p.user_id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {results.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-md">
                {results
                  .filter((r) => !picked.some((p) => p.user_id === r.user_id))
                  .map((r) => (
                    <button
                      key={r.user_id}
                      onClick={() => setPicked((s) => [...s, r])}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-secondary text-left"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={r.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{r.username.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">@{r.username}</span>
                      {r.display_name && <span className="text-xs text-muted-foreground">· {r.display_name}</span>}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
