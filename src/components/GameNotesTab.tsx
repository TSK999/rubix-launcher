import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  notes: string;
  tags: string[];
  onNotesChange: (v: string) => void;
  onTagsChange: (v: string[]) => void;
  disabled?: boolean;
};

export const GameNotesTab = ({ notes, tags, onNotesChange, onTagsChange, disabled }: Props) => {
  const [tagDraft, setTagDraft] = useState("");

  const commitTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft("");
      return;
    }
    onTagsChange([...tags, t]);
    setTagDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      onTagsChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          Tags
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-secondary/60 p-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-medium"
            >
              {t}
              <button
                type="button"
                onClick={() => onTagsChange(tags.filter((x) => x !== t))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove tag ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={commitTag}
            disabled={disabled}
            placeholder={tags.length ? "Add tag…" : "e.g. coop, replay, finished"}
            className={cn(
              "h-7 flex-1 min-w-[8rem] border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0",
            )}
          />
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          Notes
        </h3>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={disabled}
          placeholder="Tips, builds, todo lists — autosaved as you type."
          className="min-h-[180px] rounded-2xl bg-secondary/60 border-0 text-sm leading-relaxed resize-y"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Synced to your Rubix account.
        </p>
      </div>
    </div>
  );
};
