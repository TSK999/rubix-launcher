import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Code2, Pencil } from "lucide-react";
import { statusBadgeVariant } from "@/lib/store";

const DeveloperDashboard = () => {
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const { isDeveloper, loading: rolesLoading } = useUserRoles();
  const [games, setGames] = useState<any[]>([]);
  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Developer — RUBIX";
  }, []);

  useEffect(() => {
    if (!user || rolesLoading) return;
    if (!isDeveloper) {
      navigate("/developer/apply", { replace: true });
      return;
    }
    Promise.all([
      supabase
        .from("games")
        .select("*")
        .eq("developer_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase.from("developer_applications").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([{ data: g }, { data: a }]) => {
      setGames(g ?? []);
      setApp(a);
      setLoading(false);
    });
  }, [user, isDeveloper, rolesLoading, navigate]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar
        collection="all"
        onCollection={() => {}}
        genres={[]}
        selectedGenre={null}
        onGenre={() => {}}
        counts={{ all: 0, favorites: 0, recent: 0 }}
        selectedSource={null}
        onSource={() => {}}
        sourceCounts={{ steam: 0, epic: 0, ea: 0, xbox: 0, riot: 0, other: 0 }}
      />
      <main className="flex-1 overflow-y-auto">
        <header className="px-8 pt-8 pb-6 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Code2 className="h-7 w-7 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Developer dashboard</h1>
            </div>
            {app && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{app.company_name}</span>
                <Badge variant={statusBadgeVariant(app.status)}>{app.status}</Badge>
              </div>
            )}
          </div>
          <Button onClick={() => navigate("/developer/games/new")} className="rounded-2xl">
            <Plus className="h-4 w-4 mr-1.5" /> New game
          </Button>
        </header>

        <section className="p-8">
          <h2 className="text-lg font-semibold mb-4">Your games</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground rounded-2xl border-border bg-card/40">
              <p>You haven't created any games yet.</p>
              <Button onClick={() => navigate("/developer/games/new")} className="mt-4 rounded-2xl">
                <Plus className="h-4 w-4 mr-1.5" /> Create your first game
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <Card
                  key={g.id}
                  className="p-4 rounded-xl border-border bg-card/40 flex items-center gap-4"
                >
                  <div className="h-16 w-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                    {g.cover_url && (
                      <img src={g.cover_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{g.title}</h3>
                      <Badge variant={statusBadgeVariant(g.status)}>{g.status}</Badge>
                    </div>
                    {g.rejection_reason && (
                      <p className="text-xs text-destructive mt-1">Rejected: {g.rejection_reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">/{g.slug}</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <Link to={`/developer/games/${g.id}`}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default DeveloperDashboard;
