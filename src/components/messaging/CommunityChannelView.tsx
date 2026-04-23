import { useEffect, useRef, useState } from "react";
import { Hash, Loader2, Send, Volume2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  listChannelMessages,
  sendChannelMessage,
  type CommunityChannel,
  type CommunityMessage,
} from "@/lib/communities";
import { fetchProfiles, type ProfileLite } from "@/lib/messaging";
import { startChannelCall, findActiveChannelCall } from "@/lib/calls";
import { CallRoom } from "./CallRoom";
import { cn } from "@/lib/utils";

type Props = {
  channel: CommunityChannel;
  meId: string;
};

export const CommunityChannelView = ({ channel, meId }: Props) => {
  if (channel.kind === "voice") return <VoiceChannelView channel={channel} meId={meId} />;
  return <TextChannelView channel={channel} meId={meId} />;
};

const TextChannelView = ({ channel, meId }: { channel: CommunityChannel; meId: string }) => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const msgs = await listChannelMessages(channel.id);
      if (cancel) return;
      setMessages(msgs);
      const profMap = await fetchProfiles(msgs.map((m) => m.sender_id));
      if (!cancel) {
        setProfiles(profMap);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [channel.id]);

  useEffect(() => {
    const sub = supabase
      .channel(`cmsg-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messages", filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new as CommunityMessage;
            setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
            if (!profiles.get(m.sender_id)) {
              const next = await fetchProfiles([m.sender_id]);
              setProfiles((prev) => {
                const cp = new Map(prev);
                next.forEach((v, k) => cp.set(k, v));
                return cp;
              });
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((cur) =>
              cur.map((x) => (x.id === (payload.new as CommunityMessage).id ? { ...x, ...(payload.new as CommunityMessage) } : x)),
            );
          } else if (payload.eventType === "DELETE") {
            setMessages((cur) => cur.filter((x) => x.id !== (payload.old as CommunityMessage).id));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const c = text.trim();
    if (!c || sending) return;
    setSending(true);
    try {
      await sendChannelMessage(channel.id, c);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{channel.name}</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-12">
            This is the beginning of #{channel.name}.
          </p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showHeader =
              !prev ||
              prev.sender_id !== m.sender_id ||
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
            const sender = profiles.get(m.sender_id);
            return (
              <div key={m.id} className={cn("flex gap-3 px-4", showHeader ? "mt-3" : "mt-0.5")}>
                <div className="w-9 shrink-0">
                  {showHeader && (
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={sender?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(sender?.display_name ?? sender?.username ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">
                        {sender?.display_name ?? sender?.username ?? "Unknown"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  <p className={cn("text-sm whitespace-pre-wrap break-words", m.deleted_at && "italic opacity-60")}>
                    {m.deleted_at ? "Message deleted" : m.content}
                    {m.edited_at && !m.deleted_at && (
                      <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border p-3 flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Message #${channel.name}`}
          rows={1}
          className="min-h-[40px] max-h-32 resize-none"
        />
        <Button size="icon" onClick={send} disabled={sending || !text.trim()} className="h-10 w-10 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const VoiceChannelView = ({ channel, meId }: { channel: CommunityChannel; meId: string }) => {
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inCall, setInCall] = useState(false);

  useEffect(() => {
    void findActiveChannelCall(channel.id).then((s) => setCallId(s?.id ?? null));
    setInCall(false);
  }, [channel.id]);

  const join = async () => {
    setBusy(true);
    try {
      const session = await startChannelCall(channel.id);
      setCallId(session.id);
      setInCall(true);
    } finally {
      setBusy(false);
    }
  };

  if (inCall && callId) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{channel.name}</p>
        </div>
        <CallRoom callId={callId} meId={meId} onLeave={() => setInCall(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <Volume2 className="h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-bold">{channel.name}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Join this voice channel to talk with up to 4 members at a time.
      </p>
      <Button size="lg" onClick={join} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Join voice
      </Button>
    </div>
  );
};
