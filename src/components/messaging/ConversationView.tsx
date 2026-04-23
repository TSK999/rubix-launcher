import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchProfiles,
  listMembers,
  listMessages,
  listMyCustomEmojis,
  markRead,
  type ConversationMember,
  type Message,
  type ProfileLite,
} from "@/lib/messaging";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { playSound } from "@/lib/sounds";

type Props = { conversationId: string; meId: string };

export const ConversationView = ({ conversationId, meId }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [customEmojis, setCustomEmojis] = useState<Map<string, string>>(new Map());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load initial
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [msgs, mems, customs] = await Promise.all([
          listMessages(conversationId),
          listMembers(conversationId),
          listMyCustomEmojis(),
        ]);
        if (cancel) return;
        setMessages(msgs);
        setMembers(mems);
        const profMap = await fetchProfiles(mems.map((m) => m.user_id));
        if (cancel) return;
        setProfiles(profMap);
        const emojiMap = new Map<string, string>();
        customs.forEach((e) => emojiMap.set(e.name, e.url));
        setCustomEmojis(emojiMap);
        await markRead(conversationId);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [conversationId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`conv-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            // Re-fetch the row with attachments
            const { data } = await supabase
              .from("messages")
              .select("*, attachments:message_attachments(*), reactions:message_reactions(*)")
              .eq("id", (payload.new as Message).id)
              .single();
            if (data) {
              setMessages((m) => {
                if (m.some((x) => x.id === data.id)) return m;
                if ((data as Message).sender_id !== meId) playSound("msg", { volume: 0.4 });
                return [...m, data as Message];
              });
              void markRead(conversationId);
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((m) =>
              m.map((x) =>
                x.id === (payload.new as Message).id ? { ...x, ...(payload.new as Message) } : x,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setMessages((m) => m.filter((x) => x.id !== (payload.old as Message).id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        async () => {
          // Re-fetch reactions for current messages (cheap enough)
          const ids = messages.map((m) => m.id);
          if (ids.length === 0) return;
          const { data } = await supabase.from("message_reactions").select("*").in("message_id", ids);
          if (data) {
            setMessages((curr) =>
              curr.map((m) => ({ ...m, reactions: data.filter((r) => r.message_id === m.id) })),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "typing_indicators", filter: `conversation_id=eq.${conversationId}` },
        async () => {
          const { data } = await supabase
            .from("typing_indicators")
            .select("user_id, updated_at")
            .eq("conversation_id", conversationId);
          const cutoff = Date.now() - 5000;
          const active = (data ?? [])
            .filter((t) => new Date(t.updated_at).getTime() > cutoff && t.user_id !== meId)
            .map((t) => t.user_id);
          setTypingUsers(active);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
        async () => {
          const mems = await listMembers(conversationId);
          setMembers(mems);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, meId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUsers.length]);

  const lastMineIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === meId && !messages[i].deleted_at) return i;
    }
    return -1;
  }, [messages, meId]);

  const readByOthers = useMemo(() => {
    if (lastMineIdx < 0) return false;
    const lastMine = messages[lastMineIdx];
    const lastTime = new Date(lastMine.created_at).getTime();
    return members.some(
      (m) => m.user_id !== meId && new Date(m.last_read_at).getTime() >= lastTime,
    );
  }, [members, messages, lastMineIdx, meId]);

  const typingNames = typingUsers
    .map((id) => profiles.get(id))
    .filter(Boolean)
    .map((p) => p!.display_name ?? p!.username);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-12">
            No messages yet. Say hi 👋
          </p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showAvatar =
              !prev || prev.sender_id !== m.sender_id ||
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={m.sender_id === meId}
                sender={profiles.get(m.sender_id)}
                showAvatar={showAvatar}
                customEmojis={customEmojis}
                onReply={setReplyTo}
                isLastFromMe={i === lastMineIdx}
                readByOthers={readByOthers}
              />
            );
          })
        )}
        {typingNames.length > 0 && (
          <p className="text-xs text-muted-foreground italic px-4 py-1">
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
          </p>
        )}
      </div>
      <MessageComposer
        conversationId={conversationId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />
    </div>
  );
};
