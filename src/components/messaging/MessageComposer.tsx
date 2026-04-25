import { useEffect, useRef, useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  FileAudio,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Reply,
  Send,
  Smile,
  Sticker,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  kind: "image" | "video" | "file" | "audio";
};

const formatDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const MessageComposer = ({ conversationId, replyTo, onClearReply }: Props) => {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);

  // Cleanup previews when convo changes
  useEffect(() => {
    return () => {
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  // Cleanup recorder on unmount / convo change
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [conversationId]);

  const handleTyping = () => {
    void setTyping(conversationId);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      void clearTyping(conversationId);
    }, 4000);
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const next: PendingFile[] = [];
    for (const f of arr) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over 25MB`);
        continue;
      }
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      const isAudio = f.type.startsWith("audio/");
      next.push({
        file: f,
        preview: isImage || isVideo || isAudio ? URL.createObjectURL(f) : null,
        kind: isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file",
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
    setGifOpen(false);
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
    } catch {
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
        kind: "image" | "video" | "file" | "audio";
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

  // Voice messages -------------------------------------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && recordChunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: mime });
        addFiles([file]);
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
      };
      rec.start();
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecordMs(0);
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordMs(Date.now() - recordStartRef.current);
      }, 100);
    } catch (err) {
      toast.error("Microphone unavailable", {
        description: err instanceof Error ? err.message : "",
      });
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (cancel && rec) {
      rec.ondataavailable = null;
      rec.onstop = () => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
      };
    }
    if (rec?.state === "recording") rec.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecordMs(0);
  };

  // Drag & drop + paste --------------------------------------------
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const canSend = !sending && (text.trim().length > 0 || pending.length > 0);

  return (
    <div
      className={cn(
        "border-t border-border/60 bg-card/40 backdrop-blur-sm relative",
        dragOver && "ring-2 ring-primary/60 ring-inset",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-primary/10 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Paperclip className="h-8 w-8" />
            <p className="text-sm font-semibold">Drop files to attach</p>
          </div>
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-1.5 rounded-lg bg-primary/10 border-l-2 border-primary text-xs">
          <Reply className="h-3 w-3 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Replying</p>
            <p className="truncate text-muted-foreground">{replyTo.content || "(attachment)"}</p>
          </div>
          <button
            onClick={onClearReply}
            className="h-5 w-5 rounded-full hover:bg-primary/20 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {pending.map((p, i) => (
            <div
              key={i}
              className="relative group rounded-lg overflow-hidden border border-border/60 bg-secondary/40"
            >
              {p.preview && p.kind === "image" ? (
                <img src={p.preview} alt="" className="h-16 w-16 object-cover" />
              ) : p.preview && p.kind === "video" ? (
                <video src={p.preview} className="h-16 w-16 object-cover" />
              ) : p.kind === "audio" ? (
                <div className="h-16 px-3 flex items-center gap-2 min-w-[140px]">
                  <FileAudio className="h-5 w-5 text-primary" />
                  <span className="text-xs truncate">{p.file.name}</span>
                </div>
              ) : (
                <div className="h-16 px-3 flex items-center gap-2 min-w-[140px] max-w-[200px]">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs truncate">{p.file.name}</span>
                </div>
              )}
              <button
                onClick={() => removePending(i)}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/90 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-2.5">
        <div
          className={cn(
            "flex items-end gap-1.5 rounded-2xl border border-border/60 bg-background/60 px-1.5 py-1 transition-colors",
            "focus-within:border-primary/50 focus-within:bg-background/90 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
          )}
        >
          {/* Attach popover */}
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="Attach"
              >
                <Plus className={cn("h-5 w-5 transition-transform", attachOpen && "rotate-45")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-44 p-1">
              <button
                onClick={() => {
                  imgRef.current?.click();
                  setAttachOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-secondary text-left"
              >
                <ImageIcon className="h-4 w-4 text-primary" />
                Photo / Video
              </button>
              <button
                onClick={() => {
                  fileRef.current?.click();
                  setAttachOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-secondary text-left"
              >
                <Paperclip className="h-4 w-4 text-primary" />
                File
              </button>
              <button
                onClick={() => {
                  setAttachOpen(false);
                  setGifOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-secondary text-left"
              >
                <span className="text-[10px] font-bold tracking-wider text-primary w-4 text-center">GIF</span>
                Tenor GIF
              </button>
              <button
                onClick={() => {
                  setAttachOpen(false);
                  setStickerOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-secondary text-left"
              >
                <Sticker className="h-4 w-4 text-primary" />
                Sticker
              </button>
            </PopoverContent>
          </Popover>

          {/* Hidden GIF popover trigger */}
          <Popover open={gifOpen} onOpenChange={setGifOpen}>
            <PopoverTrigger asChild>
              <span className="sr-only">GIF</span>
            </PopoverTrigger>
            <PopoverContent className="p-2" side="top" align="start">
              <GifPicker onPick={sendGif} />
            </PopoverContent>
          </Popover>

          {/* Hidden sticker popover trigger */}
          <Popover open={stickerOpen} onOpenChange={setStickerOpen}>
            <PopoverTrigger asChild>
              <span className="sr-only">Stickers</span>
            </PopoverTrigger>
            <PopoverContent className="p-3" side="top" align="start">
              <CustomEmojiManager
                onPick={(e) => {
                  insertText(`:${e.name}:`);
                  setStickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          {recording ? (
            <div className="flex-1 flex items-center gap-3 px-3 py-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
              </span>
              <span className="text-sm font-mono text-foreground">{formatDuration(recordMs)}</span>
              <span className="text-xs text-muted-foreground">Recording…</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  onClick={() => stopRecording(true)}
                >
                  Cancel
                </Button>
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => stopRecording(false)}
                  title="Finish recording"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              </div>
            </div>
          ) : (
            <>
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
                onPaste={onPaste}
                placeholder="Write a message…"
                rows={1}
                className="min-h-[36px] max-h-40 resize-none flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 text-sm placeholder:text-muted-foreground/60"
              />

              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-full shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Emoji"
                  >
                    <Smile className="h-4.5 w-4.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto border-0" side="top" align="end">
                  <EmojiPicker
                    theme={Theme.DARK}
                    onEmojiClick={(e) => insertText(e.emoji)}
                    width={320}
                    height={380}
                    lazyLoadEmojis
                  />
                </PopoverContent>
              </Popover>

              {canSend ? (
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full shrink-0 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                  onClick={submit}
                  disabled={sending}
                  title="Send (Enter)"
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={startRecording}
                  title="Record voice message"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-between mt-1 px-2 h-3">
          <span className="text-[10px] text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded bg-secondary/60 text-[9px]">Enter</kbd> to send ·{" "}
            <kbd className="px-1 py-0.5 rounded bg-secondary/60 text-[9px]">Shift+Enter</kbd> new line
          </span>
          {text.length > 500 && (
            <span
              className={cn(
                "text-[10px] tabular-nums",
                text.length > 1800 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {text.length} / 2000
            </span>
          )}
        </div>
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
