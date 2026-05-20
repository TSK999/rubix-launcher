import { useEffect, useMemo } from "react";
import { ExternalLink, Gamepad2 } from "lucide-react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { steamLaunchTarget } from "@/lib/game-launch";

const SteamLaunchHandoff = () => {
  const { appId = "" } = useParams();
  const safeAppId = useMemo(() => (/^\d+$/.test(appId) ? appId : ""), [appId]);
  const steamUrl = safeAppId ? steamLaunchTarget(safeAppId) : "";

  useEffect(() => {
    if (!steamUrl) return;
    const link = document.createElement("a");
    link.href = steamUrl;
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [steamUrl]);

  return (
    <main className="min-h-screen grid place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Launch with Steam</h1>
          <p className="text-sm text-muted-foreground">
            If Steam did not open automatically, use the button below.
          </p>
        </div>
        {steamUrl ? (
          <Button asChild size="lg" className="w-full bg-[image:var(--gradient-primary)] shadow-[var(--glow-primary)]">
            <a href={steamUrl} rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Steam
            </a>
          </Button>
        ) : (
          <p className="text-sm text-destructive">Invalid Steam game ID.</p>
        )}
      </section>
    </main>
  );
};

export default SteamLaunchHandoff;