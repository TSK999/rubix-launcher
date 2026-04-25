import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Shield, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/store";

const AdminReview = () => {
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const { isAdmin, loading: rolesLoading } = useUserRoles();

  const [apps, setApps] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Admin review — RUBIX";
  }, []);

  useEffect(() => {
    if (rolesLoading) return;
    if (!isAdmin) {
      navigate("/", { replace: true });
      return;
    }
    void load();
  }, [isAdmin, rolesLoading, navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: g }] = await Promise.all([
      supabase
        .from("developer_applications")
        .select("*")
        .eq("status", "pending")
        .order("created_at"),
      supabase.from("games").select("*").eq("status", "pending").order("updated_at"),
    ]);
    setApps(a ?? []);
    setGames(g ?? []);
    setLoading(false);
  };

  const reviewApp = async (app: any, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("developer_applications")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) {
      toast.error("Failed", { description: error.message });
      return;
    }
    toast.success(`Application ${status}`);
    void load();
  };

  const reviewGame = async (game: any, status: "approved" | "rejected") => {
    const update: any = { status };
    if (status === "rejected") update.rejection_reason = reasons[game.id] || "Did not meet store guidelines.";
    const { error } = await supabase.from("games").update(update).eq("id", game.id);
    if (error) {
      toast.error("Failed", { description: error.message });
      return;
    }
    toast.success(`Game ${status}`);
    void load();
  };

  if (rolesLoading || loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
        <header className="px-8 pt-8 pb-6 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Admin review</h1>
          </div>
          <p className="text-muted-foreground">Approve developer applications and game submissions.</p>
        </header>

        <section className="p-8">
          <Tabs defaultValue="apps">
            <TabsList>
              <TabsTrigger value="apps">
                Applications <Badge variant="secondary" className="ml-2">{apps.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="games">
                Games <Badge variant="secondary" className="ml-2">{games.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="apps" className="space-y-3 mt-4">
              {apps.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No pending applications.</p>
              ) : (
                apps.map((a) => (
                  <Card key={a.id} className="p-5 rounded-2xl border-border bg-card/40 space-y-3">
                    <div>
                      <h3 className="font-semibold">{a.company_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {a.full_name} · {a.contact_email}
                        {a.website ? ` · ${a.website}` : ""}
                      </p>
                    </div>
                    <p className="text-sm whitespace-pre-line">{a.description}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewApp(a, "approved")} className="rounded-xl">
                        <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => reviewApp(a, "rejected")}
                        className="rounded-xl"
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="games" className="space-y-3 mt-4">
              {games.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No pending games.</p>
              ) : (
                games.map((g) => (
                  <Card key={g.id} className="p-5 rounded-2xl border-border bg-card/40 flex gap-4">
                    <div className="h-32 w-24 rounded-lg bg-secondary overflow-hidden shrink-0">
                      {g.cover_url && <img src={g.cover_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{g.title}</h3>
                        <Badge variant="outline">{g.age_rating}</Badge>
                        <span className="text-sm text-primary">{formatPrice(g.price_cents)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">/{g.slug}</p>
                      <p className="text-sm whitespace-pre-line line-clamp-3">{g.description}</p>
                      <Textarea
                        placeholder="Rejection reason (optional)…"
                        value={reasons[g.id] ?? ""}
                        onChange={(e) => setReasons({ ...reasons, [g.id]: e.target.value })}
                        className="min-h-16"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => reviewGame(g, "approved")} className="rounded-xl">
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reviewGame(g, "rejected")}
                          className="rounded-xl"
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
};

export default AdminReview;
