import { useEffect, useRef, useState } from "react";
import { Palette, Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  clearTheme,
  importThemeFromFile,
  loadStoredTheme,
  saveTheme,
} from "@/lib/theme-loader";
import { THEME_FILE_EXT, type RubixTheme } from "@/lib/theme-schema";

type Props = {
  embedded?: boolean;
};

export const ThemeManager = ({ embedded = false }: Props) => {
  const [active, setActive] = useState<RubixTheme | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = loadStoredTheme();
    if (stored) {
      applyTheme(stored);
      setActive(stored);
    }
  }, []);

  const handleFile = async (file: File) => {
    try {
      const theme = await importThemeFromFile(file);
      applyTheme(theme);
      saveTheme(theme);
      setActive(theme);
      toast.success(`Theme "${theme.name}" applied`);
    } catch (e) {
      toast.error("Couldn't load theme", {
        description: e instanceof Error ? e.message : "Invalid file",
      });
    }
  };

  const handleReset = () => {
    clearTheme();
    setActive(null);
    toast("Reset to default theme");
  };

  return (
    <div
      className={cn(!embedded && "p-3 border-t border-border")}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <div className={cn("flex items-center gap-2 pb-2", !embedded && "px-3 pt-2")}>
        <Palette className="h-3 w-3 text-muted-foreground" />
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Theme
        </p>
      </div>

      <div className={cn("pb-2", !embedded && "px-3")}>
        <p className="text-xs text-foreground truncate" title={active?.name ?? "Default"}>
          {active?.name ?? "Default"}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={`${THEME_FILE_EXT},application/json`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <Upload className="h-4 w-4" />
        <span>Import theme</span>
      </button>

      {active && (
        <button
          onClick={handleReset}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to default</span>
        </button>
      )}
    </div>
  );
};
