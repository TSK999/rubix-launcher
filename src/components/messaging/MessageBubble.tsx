import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCheck, MoreVertical, Pencil, Reply, Smile, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  deleteMessage,
  editMessage,
  getSignedAttachmentUrl,
  toggleReaction,
  type Attachment,
  type Message,
  type ProfileLite,
} from "@/lib/messaging";
import { Input } from "@/components/ui/input";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮"];

type Props = {
  message: Message;
  isMine: boolean;
  sender: ProfileLite | undefined;
  showAvatar: boolean;
  customEmojis: Map<string, string>;
  onReply: (m: Message) => void;
  isLastFromMe: boolean;
  readByOthers: boolean;
};

const AttachmentView = ({ a }: { a: Attachment }) => {
  const [url, setUrl] = useState<string | null>(a.external_url ?? null);
  useEffect(() => {
    if (!a.external_url && a.storage_path) {
      void getSignedAttachmentUrl(a.storage_path).then(setUrl);
    }
  }, [a.external_url, a.storage_path]);
  if (!url) return <div className="h-32 w-48 rounded-md bg-secondary animate-pulse" />;
  if (a.kind === "image" || a.kind === "gif") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={a.file_name ?? ""} className="max-h-72 max-w-xs rounded-md object-contain" loading="lazy" />
      </a>
    );
  }
  if (a.kind === "video") {
    return <video src={url} controls className="max-h-72 max-w-xs rounded-md" />;
  }
  if (a.kind === "audio") {
    return (
      <audio
        src={url}
        controls
        className="h-10 max-w-[280px] rounded-full"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 max-w-xs"
    >
      <span className="text-xs truncate flex-1">{a.file_name ?? "file"}</span>
      <span className="text-[10px] text-muted-foreground">
        {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : ""}
      </span>
    </a>
  );
};

const renderText = (text: string, customEmojis: Map<string, string>) => {
  const parts = text.split(/(:[a-z0-9_]+:)/gi);
  return parts.map((p, i) => {
    const m = /^:([a-z0-9_]+):$/i.exec(p);
    if (m) {
      const url = customEmojis.get(m[1].toLowerCase());
      if (url) return <img key={i} src={url} alt={p} className="inline h-5 w-5 align-text-bottom mx-0.5" />;
    }
    return <span key={i}>{p}</span>;
  });
};

export const MessageBubble = ({
  message,
  isMine,
  sender,
  showAvatar,
  customEmojis,
  onReply,
  isLastFromMe,
  readByOthers,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content ?? "");

  const grouped = (message.reactions ?? []).reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.emoji] ??= []).push(r.user_id);
    return acc;
  }, {});

  const isDeleted = !!message.deleted_at;

  return (
    <div className={cn("flex gap-2 group px-3 py-0.5", isMine && "flex-row-reverse")}>
      <div className="w-8 shrink-0">
        {showAvatar && (
          sender?.username ? (
            <Link to={`/u/${sender.username}`} title={`View @${sender.username}`}>
              <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary transition-all">
                <AvatarImage src={sender?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {(sender?.display_name ?? sender?.username ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Avatar className="h-8 w-8">
              <AvatarImage src={sender?.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {(sender?.display_name ?? sender?.username ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )
        )}
      </div>
      <div className={cn("max-w-[70%] flex flex-col gap-0.5", isMine && "items-end")}>
        {showAvatar && !isMine && (
          sender?.username ? (
            <Link
              to={`/u/${sender.username}`}
              className="text-[11px] text-muted-foreground px-1 hover:text-foreground transition-colors"
            >
              {sender?.display_name ?? sender?.username ?? "Unknown"}
            </Link>
          ) : (
            <p className="text-[11px] text-muted-foreground px-1">
              {sender?.display_name ?? sender?.username ?? "Unknown"}
            </p>
          )
        )}
        <div className="flex items-end gap-1">
          {isMine && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <MessageActions
                message={message}
                isMine={isMine}
                onReply={onReply}
                onEdit={() => setEditing(true)}
              />
            </div>
          )}
          <div
            className={cn(
              "rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
              isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
              isDeleted && "italic opacity-60",
            )}
          >
            {isDeleted ? (
              "Message deleted"
            ) : editing ? (
              <Input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    await editMessage(message.id, editText);
                    setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-7 text-xs bg-background text-foreground"
              />
            ) : (
              <>
                {message.content && renderText(message.content, customEmojis)}
                {message.attachments && message.attachments.length > 0 && (
                  <div className={cn("flex flex-wrap gap-1.5", message.content && "mt-1.5")}>
                    {message.attachments.map((a) => (
                      <AttachmentView key={a.id} a={a} />
                    ))}
                  </div>
                )}
                {message.edited_at && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
              </>
            )}
          </div>
          {!isMine && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <MessageActions
                message={message}
                isMine={isMine}
                onReply={onReply}
                onEdit={() => setEditing(true)}
              />
            </div>
          )}
        </div>
        {Object.keys(grouped).length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-0.5", isMine && "justify-end")}>
            {Object.entries(grouped).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(message.id, emoji)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-xs hover:bg-secondary/70"
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-muted-foreground">{users.length}</span>
              </button>
            ))}
          </div>
        )}
        {isMine && isLastFromMe && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 px-1">
            {readByOthers ? <CheckCheck className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3" />}
            <span>{readByOthers ? "Read" : "Sent"}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const MessageActions = ({
  message,
  isMine,
  onReply,
  onEdit,
}: {
  message: Message;
  isMine: boolean;
  onReply: (m: Message) => void;
  onEdit: () => void;
}) => (
  <>
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-6 w-6 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground">
          <Smile className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" side="top">
        <div className="flex gap-1">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => toggleReaction(message.id, e)}
              className="h-7 w-7 rounded hover:bg-secondary text-base"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <button
      onClick={() => onReply(message)}
      className="h-6 w-6 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground"
    >
      <Reply className="h-3.5 w-3.5" />
    </button>
    {isMine && !message.deleted_at && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-6 w-6 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => deleteMessage(message.id)} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </>
);
