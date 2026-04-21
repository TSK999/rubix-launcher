import { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { MessagesDialog } from "./messaging/MessagesDialog";
import { listConversations, listMembers } from "@/lib/messaging";

export const MessagesPanel = () => {
  const { user } = useRubixAuth();
  const meId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [initialId, setInitialId] = useState<string | null>(null);

  const computeUnread = async () => {
    if (!meId) return;
    try {
      const convs = await listConversations();
      let total = 0;
      for (const c of convs) {
        const mems = await listMembers(c.id);
        const me = mems.find((m) => m.user_id === meId);
        if (!me) continue;
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .neq("sender_id", meId)
          .gt("created_at", me.last_read_at);
        if (count) total += count;
      }
      setUnread(total);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!meId) return;
    void computeUnread();
    const ch = supabase
      .channel("unread-watch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => void computeUnread())
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${meId}` },
        () => void computeUnread(),
      )
      .subscribe();
    // Listen for global "open DM" events from sidebar friend buttons
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ conversationId?: string }>).detail;
      setInitialId(detail?.conversationId ?? null);
      setOpen(true);
    };
    window.addEventListener("rubix:open-dm", onOpen as EventListener);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("rubix:open-dm", onOpen as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  if (!meId) return null;

  return (
    <>
      <div className="p-3 border-t border-border">
        <button
          onClick={() => {
            setInitialId(null);
            setOpen(true);
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="flex-1 text-left">Messages</span>
          {unread > 0 ? (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : (
            <Plus className="h-3 w-3 opacity-50" />
          )}
        </button>
      </div>
      <MessagesDialog open={open} onOpenChange={setOpen} initialConversationId={initialId} />
    </>
  );
};
