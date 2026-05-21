import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, MoreVertical, Pencil, Share2, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShareToChatDialog } from "./ShareToChatDialog";
import {
  fetchSharedClipById,
  shareLinkFor,
  updateSharedClip,
  type SharedClip,
} from "@/lib/clip-share";
import { uploadStore } from "@/lib/upload-manager";
import type { GameClip } from "@/lib/game-clips";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  clip: GameClip;
  gameKey: string;
  gameTitle: string;
  sharedClip?: SharedClip | null;
  onShared?: () => void;
  onRename: (id: string, newCaption: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onDownload: () => Promise<void> | void;
};

export const ClipActionsMenu = ({
  clip,
  gameKey,
  gameTitle,
  sharedClip,
  onShared,
  onRename,
  onDelete,
  onDownload,
}: Props) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(clip.caption || "");
  const [current, setCurrent] = useState<SharedClip | null>(sharedClip ?? null);

  useEffect(() => setCurrent(sharedClip ?? null), [sharedClip]);

  const startUpload = async () => {
    if (!clip.url) {
      toast.error("Clip has no source");
      return;
    }
    toast.message("Preparing upload…");
    try {
      const res = await fetch(clip.url);
      const blob = await res.blob();
      uploadStore.enqueue({
        blob,
        fileName: `${gameKey}-${clip.id.slice(0, 6)}`,
        title: clip.caption || `${gameTitle} clip`,
        gameKey,
        gameTitle,
        visibility: "unlisted",
      });
      toast.success("Upload started");
      onShared?.();
    } catch (e) {
      toast.error("Could not start upload");
    }
  };

  const copyLink = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(shareLinkFor(current.share_slug));
      toast.success("Link copied");
    } catch { toast.error("Copy failed"); }
  };

  const openShare = async () => {
    if (!current) {
      toast.error("Upload the clip first to share it");
      return;
    }
    // Re-fetch to ensure latest visibility/title
    const fresh = await fetchSharedClipById(current.id);
    if (fresh) setCurrent(fresh);
    setShareOpen(true);
  };

  const submitRename = async () => {
    await onRename(clip.id, renameValue);
    if (current) {
      try {
        await updateSharedClip(current.id, { title: renameValue || "Untitled clip" });
        setCurrent({ ...current, title: renameValue || "Untitled clip" });
      } catch {}
    }
    setRenameOpen(false);
  };

  const setVisibility = async (v: "public" | "unlisted" | "private") => {
    if (!current) return;
    try {
      await updateSharedClip(current.id, { visibility: v });
      setCurrent({ ...current, visibility: v });
      toast.success(`Visibility: ${v}`);
    } catch { toast.error("Could not update visibility"); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 grid place-items-center rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background"
            aria-label="Clip actions"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!current ? (
            <DropdownMenuItem onClick={() => void startUpload()}>
              <Upload className="mr-2 h-4 w-4" />Upload & share
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => void copyLink()}>
                <Copy className="mr-2 h-4 w-4" />Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openShare()}>
                <Share2 className="mr-2 h-4 w-4" />Share to…
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/clip/${current.share_slug}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />Open page
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void setVisibility("public")}>
                Public {current.visibility === "public" && "·"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void setVisibility("unlisted")}>
                Unlisted {current.visibility === "unlisted" && "·"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void setVisibility("private")}>
                Private {current.visibility === "private" && "·"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => { setRenameValue(clip.caption || ""); setRenameOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" />Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onDownload()}>
            <Download className="mr-2 h-4 w-4" />Download
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void onDelete()} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {current && (
        <ShareToChatDialog open={shareOpen} onOpenChange={setShareOpen} clip={current} />
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename clip</DialogTitle></DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Clip title"
            className="rounded-xl"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={() => void submitRename()} className="rounded-xl">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Helper: lookup shared clip for a local clip via storage path → not directly linked.
// We expose a fetcher hook here so GameClipsTab can pre-load shared status.
export const fetchSharedForLocal = async (gameKey: string, captionOrId: string) => {
  // Best-effort: match by game_key + storage path containing local id is not stored.
  // We instead query by current user + game_key + title === caption (or fallback ordering by created_at).
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("shared_clips")
    .select("*")
    .eq("user_id", uid)
    .eq("game_key", gameKey);
  return (data as SharedClip[]) ?? [];
};
