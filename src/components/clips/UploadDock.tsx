import { useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck, Copy, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadStore, useUploads, type UploadJob } from "@/lib/upload-manager";
import { shareLinkFor } from "@/lib/clip-share";

const ProgressRing = ({ value, size = 36 }: { value: number; size?: number }) => {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity={0.15} strokeWidth={3} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        className="text-primary transition-[stroke-dashoffset] duration-300"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
};

const statusLabel = (j: UploadJob) => {
  switch (j.status) {
    case "queued": return "Queued";
    case "preparing": return "Preparing…";
    case "uploading": return `${Math.round(j.progress * 100)}%`;
    case "processing": return "Processing";
    case "ready": return "Ready";
    case "error": return j.error ?? "Failed";
    case "canceled": return "Canceled";
  }
};

const JobRow = ({ job }: { job: UploadJob }) => {
  const copy = async () => {
    if (!job.slug) return;
    try {
      await navigator.clipboard.writeText(shareLinkFor(job.slug));
      toast.success("Link copied");
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border/60 first:border-t-0">
      <div className="relative h-9 w-9 grid place-items-center">
        {job.status === "ready" ? (
          <CircleCheck className="h-6 w-6 text-primary" />
        ) : (
          <>
            <ProgressRing value={job.status === "processing" ? 1 : job.progress} />
            <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold tabular-nums">
              {job.status === "uploading" ? `${Math.round(job.progress * 100)}` : ""}
            </span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{job.title}</div>
        <div className={cn(
          "truncate text-[11px]",
          job.status === "error" ? "text-destructive" : "text-muted-foreground",
        )}>
          {statusLabel(job)}{job.gameTitle ? ` · ${job.gameTitle}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {job.status === "ready" && job.slug && (
          <button onClick={copy} className="h-7 w-7 grid place-items-center rounded-md hover:bg-secondary" aria-label="Copy link">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {job.status === "error" && (
          <button onClick={() => uploadStore.retry(job.id)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-secondary" aria-label="Retry">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
        {(job.status === "uploading" || job.status === "preparing" || job.status === "queued") && (
          <button onClick={() => uploadStore.cancel(job.id)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground" aria-label="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {(job.status === "ready" || job.status === "canceled" || job.status === "error") && (
          <button onClick={() => uploadStore.remove(job.id)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const UploadDock = () => {
  const jobs = useUploads();
  const [expanded, setExpanded] = useState(true);
  if (!jobs.length) return null;

  const active = jobs.filter((j) => j.status === "uploading" || j.status === "preparing" || j.status === "processing" || j.status === "queued");
  const overall = active.length
    ? active.reduce((s, j) => s + (j.status === "processing" ? 1 : j.progress), 0) / active.length
    : 1;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card/95 backdrop-blur shadow-2xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 border-b border-border/60 hover:bg-secondary/40 transition-colors"
      >
        <ProgressRing value={overall} size={28} />
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium">
            {active.length ? `Uploading ${active.length} clip${active.length === 1 ? "" : "s"}` : "Uploads"}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {active.length ? `${Math.round(overall * 100)}% complete` : `${jobs.length} finished`}
          </div>
        </div>
        {jobs.some((j) => ["ready","canceled","error"].includes(j.status)) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2"
            onClick={(e) => { e.stopPropagation(); uploadStore.clearCompleted(); }}
          >
            Clear
          </Button>
        )}
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="max-h-[50vh] overflow-y-auto">
          {jobs.map((j) => <JobRow key={j.id} job={j} />)}
        </div>
      )}
    </div>
  );
};
