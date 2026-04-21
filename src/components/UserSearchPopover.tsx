import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchProfiles, type RubixPublicProfile } from "@/lib/rubix-profile";

export const UserSearchPopover = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RubixPublicProfile[]>([]);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const r = await searchProfiles(q.trim());
      setResults(r);
      setLoading(false);
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const go = (username: string) => {
    setOpen(false);
    setQ("");
    navigate(`/u/${username}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          title="Find Rubix users"
        >
          <Search className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Rubix users…"
          className="h-8 text-sm"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {q.trim() ? "No users found." : "Type a username or display name."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => go(p.username)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/60 text-left"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(p.display_name ?? p.username).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {p.display_name ?? p.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        @{p.username}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
