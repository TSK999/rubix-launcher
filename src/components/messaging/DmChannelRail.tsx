import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchProfiles,
  getOrCreateDm,
  listConversations,
  listMembers,
  searchProfiles,
  type Conversation,
  type ProfileLite,
} from "@/lib/messaging";
import { NewGroupDialog } from "./NewGroupDialog";

type ConvWithMeta = {
  conv: Conversation;
  members: string[];
  title: string;
  avatar: string | null;
};

type Props = {
  meId: string;
  activeId: string | null;
  preferredId?: string | null;
  onSelect: (id: string, meta: ConvWithMeta) => void;
};

export const DmChannelRail = ({ meId, activeId, preferredId, onSelect }: Props) => {
  const [convs, setConvs] = useState<ConvWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const selectedOnceRef = useRef(false);
  const preferredHandledRef = useRef<string | null>(null);

  const refresh = async () => {
    if (!meId) return;
    setLoading(true);
    try {
      const list = await listConversations();
      const memsByConv = new Map<string, string[]>();
      const allIds = new Set<string>();
      for (const c of list) {
        const mems = await listMembers(c.id);
        const ids = mems.map((m) => m.user_id);
        memsByConv.set(c.id, ids);
        ids.forEach((i) => allIds.add(i));
      }
      const profMap = await fetchProfiles(Array.from(allIds));
      const enriched: ConvWithMeta[] = list.map((c) => {
        const ids = memsByConv.get(c.id) ?? [];
        const others = ids.filter((i) => i !== meId);
        let title = c.name ?? "Group";
        let avatar: string | null = c.avatar_url;
        if (!c.is_group) {
          const o = profMap.get(others[0] ?? "");
          title = o?.display_name ?? o?.username ?? "Direct message";
          avatar = o?.avatar_url ?? null;
        } else if (!c.name) {
          title = others.map((i) => profMap.get(i)?.username ?? "?").slice(0, 3).join(", ") || "Group";
        }
        return { conv: c, members: ids, title, avatar };
      });
      setConvs(enriched);
      const preferred = preferredId ? enriched.find((c) => c.conv.id === preferredId) : null;
      if (preferred && preferredHandledRef.current !== preferredId) {
        preferredHandledRef.current = preferredId;
        selectedOnceRef.current = true;
        onSelect(preferred.conv.id, preferred);
      } else if (!selectedOnceRef.current && !activeId && enriched.length > 0) {
        selectedOnceRef.current = true;
        onSelect(enriched[0].conv.id, enriched[0]);
      }
      return enriched;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel("dm-rail")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void refresh())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${meId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const r = await searchProfiles(q);
      if (!cancel) setResults(r.filter((p) => p.user_id !== meId));
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, meId]);

  const startDm = async (otherId: string) => {
    const id = await getOrCreateDm(otherId);
    setQ("");
    setResults([]);
    const refreshed = await refresh();
    const meta = refreshed?.find((c) => c.conv.id === id) ?? convs.find((c) => c.conv.id === id);
    if (meta) onSelect(id, meta);
    else {
      onSelect(id, { conv: { id } as Conversation, members: [meId, otherId], title: "Direct message", avatar: null });
    }
  };

  return (
    <>
      <div className="flex flex-col h-full w-full">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Direct messages</h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setGroupOpen(true)}
              title="New group"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="New chat by @username"
              className="pl-7 h-8 text-xs"
            />
          </div>
          {results.length > 0 && (
            <div className="border border-border rounded-md max-h-40 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.user_id}
                  onClick={() => startDm(p.user_id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-secondary text-left"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={p.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{p.username.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate">@{p.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : convs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No conversations yet. Search for a user above to start chatting.
            </p>
          ) : (
            convs.map((c) => (
              <button
                key={c.conv.id}
                onClick={() => onSelect(c.conv.id, c)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 text-left",
                  activeId === c.conv.id && "bg-secondary",
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.avatar ?? undefined} />
                  <AvatarFallback className="text-[10px]">
                    {c.conv.is_group ? <Users className="h-3 w-3" /> : c.title.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.conv.is_group ? `${c.members.length} members` : "Direct message"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <NewGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onCreated={(id) => {
          void refresh();
          const meta = convs.find((c) => c.conv.id === id);
          if (meta) onSelect(id, meta);
        }}
      />
    </>
  );
};
