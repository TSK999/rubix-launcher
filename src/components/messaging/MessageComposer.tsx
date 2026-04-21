import { useEffect, useRef, useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Image as ImageIcon, Paperclip, Send, Smile, Sticker, X, Reply } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  clearTyping,
  sendMessage,
  setTyping,
  uploadChatFile,
  type Message,
  type TenorGif,
} from "@/lib/messaging";
import { GifPicker } from "./GifPicker";
import { CustomEmojiManager } from "./CustomEmojiManager";

const MAX_BYTES = 25 * 1024 * 1024;

type Props = {
  conversationId: string;
  replyTo: Message | null;
  onClearReply: () => void;
};

type PendingFile = {
  file: File;
  preview: string | null;
  kind: "image" | "video" | "file";
};

export const MessageComposer = ({ conversationId, replyTo, onClearReply }: Props) => {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleTyping = () => {
    void setTyping(conversationId);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      void clearTyping(conversationId);
    }, 4000);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: PendingFile[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over 25MB`);
        continue;
      }
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      next.push({
        file: f,
        preview: isImage || isVideo ? URL.createObjectURL(f) : null,
        kind: isImage ? "image" : isVideo ? "video" : "file",
      });
    }
    setPending((p) => [...p, ...next]);
  };

  const removePending = (i: number) => {
    setPending((p) => {
      const copy = [...p];
      const [removed] = copy.splice(i, 1);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  };

  const sendGif = async (g: TenorGif) => {
    try {
      await sendMessage({
        conversationId,
        replyToId: replyTo?.id ?? null,
        attachments: [{
          storage_path: null,
          external_url: g.url,
          kind: "gif",
          mime_type: "image/gif",
          file_name: g.title || "gif",
          size_bytes: null,
          width: null,
          height: null,
        }],
      });
      onClearReply();
    } catch (e) {
      toast.error("Failed to send GIF");
    }
  };

  const insertText = (frag: string) => {
    setText((t) => t + frag);
    taRef.current?.focus();
  };

  const submit = async () => {
    if (sending) return;
    const content = text.trim();
    if (!content && pending.length === 0) return;
    setSending(true);
    try {
      const uploaded: Array<{
        storage_path: string;
        kind: "image" | "video" | "file";
        mime_type: string | null;
        file_name: string;
        size_bytes: number;
      }> = [];
      for (const p of pending) {
        const res = await uploadChatFile(conversationId, p.file);
        uploaded.push({
          storage_path: res.storage_path,
          kind: p.kind,
          mime_type: p.file.type || null,
          file_name: p.file.name,
          size_bytes: p.file.size,
        });
      }
      await sendMessage({
        conversationId,
        content: content || null,
        replyToId: replyTo?.id ?? null,
        attachments: uploaded.map((u) => ({
          storage_path: u.storage_path,
          external_url: null,
          kind: u.kind,
          mime_type: u.mime_type,
          file_name: u.file_name,
          size_bytes: u.size_bytes,
          width: null,
          height: null,
        })),
      });
      setText("");
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setPending([]);
      onClearReply();
      void clearTyping(conversationId);
    } catch (e) {
      toast.error("Failed to send", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border bg-card/40 backdrop-blur-sm">
      {replyTo && (
        <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground">
          <Reply className="h-3 w-3" />
          <span className="flex-1 truncate">Replying to: {replyTo.content || "(attachment)"}</span>
          <button onClick={onClearReply} className="hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2">
          {pending.map((p, i) => (
            <div key={i} className="relative group">
              {p.preview && p.kind === "image" ? (
                <img src={p.preview} alt="" className="h-16 w-16 object-cover rounded-md" />
              ) : p.preview && p.kind === "video" ? (
                <video src={p.preview} className="h-16 w-16 object-cover rounded-md" />
              ) : (
                <div className="h-16 w-32 px-2 rounded-md bg-secondary flex items-center text-xs truncate">
                  {p.file.name}
                </div>
              )}
              <button
                onClick={() => removePending(i)}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1 p-2">
        <div className="flex items-center">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => imgRef.current?.click()} title="Add image/video">
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => fileRef.current?.click()} title="Attach file">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" title="Emoji">
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto border-0" side="top">
              <EmojiPicker
                theme={Theme.DARK}
                onEmojiClick={(e) => insertText(e.emoji)}
                width={320}
                height={380}
                lazyLoadEmojis
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" title="Custom stickers">
                <Sticker className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-3" side="top">
              <CustomEmojiManager onPick={(e) => insertText(`:${e.name}:`)} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-xs font-bold" title="GIF">
                GIF
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2" side="top">
              <GifPicker onPick={sendGif} />
            </PopoverContent>
          </Popover>
        </div>
        <Textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Message..."
          rows={1}
          className="min-h-[40px] max-h-32 resize-none flex-1"
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={submit} disabled={sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imgRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
};
