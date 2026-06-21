import React from "react";

type State = { error: Error | null; info: string | null };

export class MinecraftErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info: info.componentStack || null });
    // Surface to console + Electron main log if available
    // eslint-disable-next-line no-console
    console.error("[MinecraftErrorBoundary]", error, info);
    try {
      (window as any).rubix?.log?.error?.(
        `Minecraft page crashed: ${error?.message}\n${error?.stack}\n${info.componentStack}`,
      );
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background text-foreground p-6">
          <h1 className="text-2xl font-bold mb-2">Minecraft page crashed</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Copy this and send it to support so we can fix it.
          </p>
          <pre className="text-xs whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 overflow-auto max-h-[70vh]">
{`Message: ${this.state.error.message}

Stack:
${this.state.error.stack || "(no stack)"}

Component stack:
${this.state.info || "(none)"}

window.rubix: ${typeof window !== "undefined" && (window as any).rubix ? "present" : "MISSING"}
window.rubix.minecraft: ${typeof window !== "undefined" && (window as any).rubix?.minecraft ? "present" : "MISSING"}
isElectron: ${typeof window !== "undefined" && (window as any).rubix?.isElectron ? "yes" : "no"}`}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
