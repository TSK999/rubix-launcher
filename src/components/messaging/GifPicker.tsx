import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTenor, trendingTenor, type TenorGif } from "@/lib/messaging";

type Props = { onPick: (gif: TenorGif) => void };

export const GifPicker = ({ onPick }: Props) => {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const list = q.trim() ? await searchTenor(q.trim()) : await trendingTenor();
      if (!cancel) {
        setGifs(list);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="w-80 max-h-96 flex flex-col">
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search Tenor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-7 h-8 text-xs"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No GIFs found</p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g)}
                className="group relative overflow-hidden rounded-md border border-border hover:border-primary transition-colors"
              >
                <img src={g.preview} alt={g.title} className="w-full h-24 object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
