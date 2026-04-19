import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type PendingNotes = {
  version: string;
  releaseName: string;
  releaseNotes: string;
  releaseDate: string;
};

/**
 * Strips simple HTML tags from GitHub release notes for plain rendering.
 * GitHub returns notes as HTML; we render as preformatted text to keep things safe.
 */
const htmlToText = (html: string) => {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const UpdateSplash = () => {
  const [data, setData] = useState<PendingNotes | null>(null);

  useEffect(() => {
    const updater = window.rubix?.updater;
    if (!updater) return;

    updater.getPendingReleaseNotes().then((notes) => {
      if (notes && notes.releaseNotes) {
        setData(notes);
      } else if (notes) {
        // Notes file exists but is empty — clear it and skip the splash
        void updater.clearPendingReleaseNotes();
      }
    });
  }, []);

  const dismiss = () => {
    void window.rubix?.updater.clearPendingReleaseNotes();
    setData(null);
  };

  if (!data) return null;

  const formattedDate = data.releaseDate
    ? new Date(data.releaseDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <DialogTitle className="text-center text-2xl">
            Welcome to {data.releaseName}
          </DialogTitle>
          <DialogDescription className="text-center">
            {formattedDate ? `Released ${formattedDate} · ` : ""}
            Here's what's new in this update
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] rounded-xl border border-border bg-secondary/40 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
            {htmlToText(data.releaseNotes)}
          </pre>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={dismiss} className="w-full rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]">
            Let's go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
