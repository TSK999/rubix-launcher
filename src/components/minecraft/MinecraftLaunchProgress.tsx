import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { onProgress, type McProgress } from "@/lib/minecraft/bridge";

const PHASE_LABEL: Record<string, string> = {
  starting: "Starting",
  client: "Downloading client",
  libraries: "Downloading libraries",
  assets: "Downloading assets",
  java: "Java runtime",
  loader: "Installing loader",
  launching: "Launching",
  exited: "Exited",
  error: "Error",
};

export function MinecraftLaunchProgress({ active }: { active: boolean }) {
  const [p, setP] = useState<McProgress | null>(null);

  useEffect(() => {
    const off = onProgress((d) => setP(d));
    return off;
  }, []);

  useEffect(() => {
    if (!active) setP(null);
  }, [active]);

  if (!active || !p) return null;
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  const label = PHASE_LABEL[p.phase] || p.phase;
  const isError = p.phase === "error";

  return (
    <div className={`rounded-md border ${isError ? "border-destructive" : "border-border"} bg-muted/30 p-3`}>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {p.total > 1 ? `${p.done}/${p.total}` : ""} {p.current ? `— ${p.current}` : ""}
        </span>
      </div>
      {!isError && <Progress value={pct} className="h-1.5" />}
      {isError && <p className="text-xs text-destructive">{p.current}</p>}
    </div>
  );
}
