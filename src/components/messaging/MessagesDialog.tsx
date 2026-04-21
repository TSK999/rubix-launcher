import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Loader2, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { ConversationView } from "./ConversationView";
import { NewGroupDialog } from "./NewGroupDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialConversationId?: string | null;
};

type ConvWithMeta = {
  conv: Conversation;
  members: string[];
  title: string;
  avatar: string | null;
};

export const MessagesDialog = ({ open, onOpenChange, initialConversationId }: Props) => {
  const { user, profile } = useRubixAuth();
  const meId = user?.id ?? "";
  const [convs, setConvs] = useState<ConvWithMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);

  const refresh = async () => {
    if (!meId) return;
    setLoading(true);
    try {
      const list = await listConversations();
      const enriched: ConvWithMeta[] = [];
      const allUserIds = new Set<string>();
      const memsByConv = new Map<string, string[]>();
      for (const c of list) {
        const mems = await listMembers(c.id);
        const ids = mems.map((m) => m.user_id);
        memsByConv.set(c.id, ids);
        ids.forEach((i) => allUserIds.add(i));
      }
      const profMap = await fetchProfiles(Array.from(allUserIds));
      for (const c of list) {
        const ids = memsByConv.get(c.id) ?? [];
        const others = ids.filter((i) => i !== meId);
        let title = c.name ?? "Group";
        let avatar: string | null = c.avatar_url;
        if (!c.is_group) {
          const other = profMap.get(others[0] ?? "");
          title = other?.display_name ?? other?.username ?? "Direct message";
          avatar = other?.avatar_url ?? null;
        } else if (!c.name) {
          title = others.map((i) => profMap.get(i)?.username ?? "?").slice(0, 3).join(", ") || "Group";
        }
        enriched.push({ conv: c, members: ids, title, avatar });
      }
      setConvs(enriched);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meId]);

  useEffect(() => {
    if (open && initialConversationId) setActiveId(initialConversationId);
  }, [open, initialConversationId]);

  // Realtime: refresh conv list on new messages or new conv membership
  useEffect(() => {
    if (!open || !meId) return;
    const ch = supabase
      .channel("conv-list")
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
  }, [open, meId]);

  // Profile search to start a new DM
  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      const r = await searchProfiles(q);
      if (!cancel) setSearchResults(r.filter((p) => p.user_id !== meId));
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, meId]);

  const startDm = async (otherId: string) => {
    const id = await getOrCreateDm(otherId);
    setActiveId(id);
    setQ("");
    setSearchResults([]);
    void refresh();
  };

  const active = convs.find((c) => c.conv.id === activeId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[92vw] h-[80vh] p-0 overflow-hidden flex">
          <DialogTitle className="sr-only">Messages</DialogTitle>
          {/* Sidebar */}
          <div className="w-72 border-r border-border flex flex-col bg-card/30">
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Messages</h3>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGroupOpen(true)} title="New group">
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
              {searchResults.length > 0 && (
                <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                  {searchResults.map((p) => (
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
                    onClick={() => setActiveId(c.conv.id)}
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
          {/* Active conversation */}
          <div className="flex-1 flex flex-col min-w-0">
            {active && meId ? (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={active.avatar ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {active.conv.is_group ? <Users className="h-3 w-3" /> : active.title.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{active.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {active.conv.is_group ? `${active.members.length} members` : ""}
                    </p>
                  </div>
                </div>
                <ConversationView conversationId={active.conv.id} meId={meId} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select a conversation
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <NewGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onCreated={(id) => {
          setActiveId(id);
          void refresh();
        }}
      />
    </>
  );
};
