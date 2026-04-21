import { useEffect, useRef, useState } from "react";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCustomEmoji,
  listMyCustomEmojis,
  uploadCustomEmoji,
  type CustomEmoji,
} from "@/lib/messaging";

type Props = { onPick?: (emoji: CustomEmoji) => void };

export const CustomEmojiManager = ({ onPick }: Props) => {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setEmojis(await listMyCustomEmojis());

  useEffect(() => {
    void refresh();
  }, []);

  const onFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      toast.error("Emoji must be under 1MB");
      return;
    }
    const finalName = (name.trim() || file.name.split(".")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!finalName) {
      toast.error("Give it a name first");
      return;
    }
    setBusy(true);
    try {
      await uploadCustomEmoji(file, finalName);
      toast.success(`:${finalName}: added`);
      setName("");
      await refresh();
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: CustomEmoji) => {
    await deleteCustomEmoji(e);
    await refresh();
  };

  return (
    <div className="w-72 space-y-3">
      <div>
        <p className="text-xs font-semibold mb-1">Add custom emoji</p>
        <div className="flex gap-2">
          <Input
            placeholder="shortcode"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-8"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/gif,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <p className="text-[10px] text-muted-foreground mt-1">PNG/GIF/WebP, max 1MB</p>
      </div>
      <div>
        <p className="text-xs font-semibold mb-1">Your pack ({emojis.length})</p>
        {emojis.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom emojis yet.</p>
        ) : (
          <div className="grid grid-cols-6 gap-1 max-h-44 overflow-y-auto">
            {emojis.map((e) => (
              <div key={e.id} className="relative group">
                <button
                  type="button"
                  onClick={() => onPick?.(e)}
                  className="w-full aspect-square rounded hover:bg-secondary p-1 flex items-center justify-center"
                  title={`:${e.name}:`}
                >
                  <img src={e.url} alt={e.name} className="max-w-full max-h-full" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  title="Delete"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
