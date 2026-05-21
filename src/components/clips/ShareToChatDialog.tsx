import { useEffect, useState } from "react";
import { Hash, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { listConversations, sendMessage, type Conversation } from "@/lib/messaging";
import { shareLinkFor, trackClipShare, type SharedClip } from "@/lib/clip-share";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clip: SharedClip;
};

type CommunityChannel = {
  id: string;
  name: string;
  community_id: string;
  community_name: string;
};

export const ShareToChatDialog = ({ open, onOpenChange, clip }: Props) => {
  const [tab, setTab] = useState<"dm" | "community">("dm");
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [q, setQ] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void listConversations().then(setConvos).catch(() => {});
    (async () => {
      const { data } = await supabase
        .from("community_channels")
        .select("id, name, community_id, communities:community_id(name)")
        .eq("kind", "text");
      const rows = (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        community_id: c.community_id,
        community_name: c.communities?.name ?? "Community",
      }));
      setChannels(rows);
    })();
  }, [open]);

  const attachmentPayload = () => ({
    kind: "clip" as const,
    external_url: shareLinkFor(clip.share_slug),
    storage_path: null,
    mime_type: "application/x-rubix-clip",
    file_name: clip.share_slug,
    size_bytes: clip.size_bytes ?? null,
    width: clip.width ?? null,
    height: clip.height ?? null,
  });

  const sendToDm = async (conv: Conversation) => {
    setSending(conv.id);
    try {
      await sendMessage({
        conversationId: conv.id,
        content: shareLinkFor(clip.share_slug),
        attachments: [attachmentPayload() as any],
      });
      await trackClipShare(clip.id);
      toast.success("Clip shared");
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not share", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(null);
    }
  };

  const sendToChannel = async (ch: CommunityChannel) => {
    setSending(ch.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data: msg, error } = await supabase
        .from("community_messages")
        .insert({
          channel_id: ch.id,
          sender_id: uid,
          content: shareLinkFor(clip.share_slug),
        })
        .select("*")
        .single();
      if (error || !msg) throw error;
      await supabase.from("community_message_attachments").insert({
        message_id: msg.id,
        ...attachmentPayload(),
      });
      await trackClipShare(clip.id);
      toast.success(`Shared to #${ch.name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not share", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(null);
    }
  };

  const filterFn = (text: string) => text.toLowerCase().includes(q.toLowerCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share clip</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-xl"
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dm">Messages</TabsTrigger>
            <TabsTrigger value="community">Communities</TabsTrigger>
          </TabsList>
          <TabsContent value="dm" className="max-h-[50vh] overflow-y-auto mt-3 space-y-1">
            {convos.filter((c) => filterFn(c.name ?? "Direct message")).map((c) => (
              <button
                key={c.id}
                disabled={sending === c.id}
                onClick={() => void sendToDm(c)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-secondary disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{c.name ?? "Direct message"}</span>
                <Send className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {!convos.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">No conversations.</p>
            )}
          </TabsContent>
          <TabsContent value="community" className="max-h-[50vh] overflow-y-auto mt-3 space-y-1">
            {channels.filter((c) => filterFn(`${c.community_name} ${c.name}`)).map((c) => (
              <button
                key={c.id}
                disabled={sending === c.id}
                onClick={() => void sendToChannel(c)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-secondary disabled:opacity-50"
              >
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">
                  <span className="text-muted-foreground">{c.community_name}</span> · {c.name}
                </span>
                <Send className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {!channels.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">No community channels.</p>
            )}
          </TabsContent>
        </Tabs>
        <Button variant="outline" className="w-full rounded-xl" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
};
