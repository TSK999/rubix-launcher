import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { listConversations, listMembers } from "@/lib/messaging";

export const MessagesPanel = () => {
  const { user } = useRubixAuth();
  const navigate = useNavigate();
  const meId = user?.id ?? null;
  const [unread, setUnread] = useState(0);

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
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  if (!meId) return null;

  return (
    <div className="p-3 border-t border-border">
      <button
        onClick={() => navigate("/messages")}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="flex-1 text-left">Rubix Messaging</span>
        {unread > 0 && (
          <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </div>
  );
};
