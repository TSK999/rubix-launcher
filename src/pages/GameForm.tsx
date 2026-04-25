import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Trash2, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AGE_RATINGS, PLATFORMS, slugify, statusBadgeVariant } from "@/lib/store";

const baseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000),
  price_cents: z.number().int().min(0).max(100000000),
  age_rating: z.enum(AGE_RATINGS),
});

const GameForm = () => {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const { isDeveloper, loading: rolesLoading } = useUserRoles();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [game, setGame] = useState<any>(null);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [reqs, setReqs] = useState<{ type: "minimum" | "recommended"; os: string; cpu: string; gpu: string; ram_gb: string; storage_gb: string }[]>([
    { type: "minimum", os: "", cpu: "", gpu: "", ram_gb: "", storage_gb: "" },
    { type: "recommended", os: "", cpu: "", gpu: "", ram_gb: "", storage_gb: "" },
  ]);
  const [builds, setBuilds] = useState<any[]>([]);
  const [newBuild, setNewBuild] = useState({ platform: "windows", version: "1.0.0", external_url: "" });
  const buildFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const screenshotFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    price_cents: 0,
    age_rating: "E" as (typeof AGE_RATINGS)[number],
  });

  useEffect(() => {
    document.title = isNew ? "New game — RUBIX" : "Edit game — RUBIX";
  }, [isNew]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
      if (!g) {
        toast.error("Game not found");
        navigate("/developer", { replace: true });
        return;
      }
      setGame(g);
      setForm({
        title: g.title,
        description: g.description ?? "",
        price_cents: g.price_cents,
        age_rating: (AGE_RATINGS as readonly string[]).includes(g.age_rating)
          ? (g.age_rating as (typeof AGE_RATINGS)[number])
          : "E",
      });
      const [{ data: ss }, { data: rq }, { data: bs }] = await Promise.all([
        supabase.from("game_screenshots").select("*").eq("game_id", g.id).order("sort_order"),
        supabase.from("game_requirements").select("*").eq("game_id", g.id),
        supabase.from("game_builds").select("*").eq("game_id", g.id).order("created_at", { ascending: false }),
      ]);
      setScreenshots(ss ?? []);
      setBuilds(bs ?? []);
      if (rq && rq.length) {
        setReqs(
          (["minimum", "recommended"] as const).map((t) => {
            const r = rq.find((x) => x.type === t);
            return {
              type: t,
              os: r?.os ?? "",
              cpu: r?.cpu ?? "",
              gpu: r?.gpu ?? "",
              ram_gb: r?.ram_gb?.toString() ?? "",
              storage_gb: r?.storage_gb?.toString() ?? "",
            };
          })
        );
      }
      setLoading(false);
    })();
  }, [id, isNew, user, navigate]);

  useEffect(() => {
    if (!rolesLoading && !isDeveloper) navigate("/developer/apply", { replace: true });
  }, [isDeveloper, rolesLoading, navigate]);

  const saveCore = async (status?: "draft" | "pending"): Promise<string | null> => {
    if (!user) return null;
    const parsed = baseSchema.safeParse(form);
    if (!parsed.success) {
      toast.error("Check your form", { description: parsed.error.issues[0].message });
      return null;
    }
    setSaving(true);
    let gameId = game?.id;
    if (isNew && !gameId) {
      const slug = `${slugify(form.title)}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await supabase
        .from("games")
        .insert({
          developer_id: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
          price_cents: parsed.data.price_cents,
          age_rating: parsed.data.age_rating,
          slug,
          status: status ?? "draft",
        })
        .select()
        .single();
      if (error) {
        toast.error("Couldn't create game", { description: error.message });
        setSaving(false);
        return null;
      }
      gameId = data.id;
      setGame(data);
    } else {
      const update: any = {
        title: parsed.data.title,
        description: parsed.data.description,
        price_cents: parsed.data.price_cents,
        age_rating: parsed.data.age_rating,
      };
      if (status) update.status = status;
      const { error } = await supabase.from("games").update(update).eq("id", gameId);
      if (error) {
        toast.error("Couldn't save", { description: error.message });
        setSaving(false);
        return null;
      }
    }

    // upsert requirements
    if (gameId) {
      await supabase.from("game_requirements").delete().eq("game_id", gameId);
      const rows = reqs
        .filter((r) => r.os || r.cpu || r.gpu || r.ram_gb || r.storage_gb)
        .map((r) => ({
          game_id: gameId!,
          type: r.type,
          os: r.os || null,
          cpu: r.cpu || null,
          gpu: r.gpu || null,
          ram_gb: r.ram_gb ? parseInt(r.ram_gb) : null,
          storage_gb: r.storage_gb ? parseInt(r.storage_gb) : null,
        }));
      if (rows.length) await supabase.from("game_requirements").insert(rows);
    }

    setSaving(false);
    return gameId ?? null;
  };

  const handleSaveDraft = async () => {
    const gid = await saveCore("draft");
    if (gid) {
      toast.success("Draft saved");
      if (isNew) navigate(`/developer/games/${gid}`, { replace: true });
    }
  };

  const handleSubmitForReview = async () => {
    const gid = await saveCore("pending");
    if (gid) {
      toast.success("Submitted for review");
      navigate("/developer", { replace: true });
    }
  };

  const handleCoverUpload = async (file: File) => {
    if (!user || !game) {
      toast.error("Save the game first to upload a cover.");
      return;
    }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${game.id}/cover-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("game-media").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed", { description: error.message });
      return;
    }
    const { data: pub } = supabase.storage.from("game-media").getPublicUrl(path);
    await supabase.from("games").update({ cover_url: pub.publicUrl }).eq("id", game.id);
    setGame({ ...game, cover_url: pub.publicUrl });
    toast.success("Cover updated");
  };

  const handleScreenshotUpload = async (files: FileList) => {
    if (!user || !game) {
      toast.error("Save the game first to upload screenshots.");
      return;
    }
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${game.id}/ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage.from("game-media").upload(path, file);
      if (error) {
        toast.error("Upload failed", { description: error.message });
        continue;
      }
      const { data: pub } = supabase.storage.from("game-media").getPublicUrl(path);
      const { data: row } = await supabase
        .from("game_screenshots")
        .insert({ game_id: game.id, url: pub.publicUrl, sort_order: screenshots.length })
        .select()
        .single();
      if (row) setScreenshots((prev) => [...prev, row]);
    }
  };

  const handleDeleteScreenshot = async (sId: string) => {
    await supabase.from("game_screenshots").delete().eq("id", sId);
    setScreenshots((prev) => prev.filter((s) => s.id !== sId));
  };

  const handleAddBuild = async () => {
    if (!user || !game) {
      toast.error("Save the game first.");
      return;
    }
    const file = buildFileRef.current?.files?.[0];
    if (!file && !newBuild.external_url) {
      toast.error("Provide a file or external URL");
      return;
    }
    let file_path: string | null = null;
    let file_size: number | null = null;
    if (file) {
      const path = `${user.id}/${game.id}/build-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("game-builds").upload(path, file);
      if (error) {
        toast.error("Build upload failed", { description: error.message });
        return;
      }
      file_path = path;
      file_size = file.size;
    }
    const { data, error } = await supabase
      .from("game_builds")
      .insert({
        game_id: game.id,
        platform: newBuild.platform,
        version: newBuild.version,
        file_path,
        file_size,
        external_url: newBuild.external_url || null,
      })
      .select()
      .single();
    if (error) {
      toast.error("Couldn't add build", { description: error.message });
      return;
    }
    setBuilds((prev) => [data, ...prev]);
    setNewBuild({ platform: "windows", version: "1.0.0", external_url: "" });
    if (buildFileRef.current) buildFileRef.current.value = "";
    toast.success("Build added");
  };

  const handleDeleteBuild = async (bId: string, file_path?: string) => {
    if (file_path) await supabase.storage.from("game-builds").remove([file_path]);
    await supabase.from("game_builds").delete().eq("id", bId);
    setBuilds((prev) => prev.filter((b) => b.id !== bId));
  };

  if (loading) {
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
        <div className="p-8 max-w-3xl mx-auto space-y-6">
          <button
            onClick={() => navigate("/developer")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </button>

          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">
              {isNew ? "New game" : "Edit game"}
            </h1>
            {game && <Badge variant={statusBadgeVariant(game.status)}>{game.status}</Badge>}
          </div>

          {game?.rejection_reason && (
            <Card className="p-4 border-destructive/50 bg-destructive/10 rounded-xl">
              <p className="text-sm">
                <strong>Rejection reason:</strong> {game.rejection_reason}
              </p>
            </Card>
          )}

          <Card className="p-6 rounded-2xl border-border bg-card/40 space-y-4">
            <h2 className="text-lg font-semibold">Basic info</h2>
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1 min-h-32"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={5000}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1"
                  value={(form.price_cents / 100).toString()}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      price_cents: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                />
              </div>
              <div>
                <Label>Age rating</Label>
                <Select
                  value={form.age_rating}
                  onValueChange={(v) => setForm({ ...form, age_rating: v as any })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_RATINGS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6 rounded-2xl border-border bg-card/40 space-y-4">
            <h2 className="text-lg font-semibold">Cover & screenshots</h2>
            <div className="flex items-start gap-4">
              <div className="h-40 w-32 rounded-xl bg-secondary overflow-hidden shrink-0">
                {game?.cover_url && (
                  <img src={game.cover_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => coverFileRef.current?.click()}
                  disabled={!game}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload cover
                </Button>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
                />
                <p className="text-xs text-muted-foreground">
                  {!game ? "Save draft first to upload media." : "PNG/JPG, recommended 600×800."}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Screenshots</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => screenshotFileRef.current?.click()}
                  disabled={!game}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
                </Button>
                <input
                  ref={screenshotFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleScreenshotUpload(e.target.files)}
                />
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {screenshots.map((s) => (
                  <div key={s.id} className="relative shrink-0">
                    <img src={s.url} alt="" className="h-24 rounded-lg" />
                    <button
                      onClick={() => handleDeleteScreenshot(s.id)}
                      className="absolute top-1 right-1 bg-destructive/80 text-destructive-foreground rounded-full p-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6 rounded-2xl border-border bg-card/40 space-y-4">
            <h2 className="text-lg font-semibold">System requirements</h2>
            {reqs.map((r, idx) => (
              <div key={r.type} className="space-y-2">
                <h3 className="text-sm font-medium capitalize">{r.type}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="OS"
                    value={r.os}
                    onChange={(e) => {
                      const next = [...reqs];
                      next[idx].os = e.target.value;
                      setReqs(next);
                    }}
                  />
                  <Input
                    placeholder="CPU"
                    value={r.cpu}
                    onChange={(e) => {
                      const next = [...reqs];
                      next[idx].cpu = e.target.value;
                      setReqs(next);
                    }}
                  />
                  <Input
                    placeholder="GPU"
                    value={r.gpu}
                    onChange={(e) => {
                      const next = [...reqs];
                      next[idx].gpu = e.target.value;
                      setReqs(next);
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="RAM (GB)"
                      value={r.ram_gb}
                      onChange={(e) => {
                        const next = [...reqs];
                        next[idx].ram_gb = e.target.value;
                        setReqs(next);
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Storage (GB)"
                      value={r.storage_gb}
                      onChange={(e) => {
                        const next = [...reqs];
                        next[idx].storage_gb = e.target.value;
                        setReqs(next);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <Card className="p-6 rounded-2xl border-border bg-card/40 space-y-4">
            <h2 className="text-lg font-semibold">Builds</h2>
            <div className="space-y-2">
              {builds.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border"
                >
                  <Badge variant="outline">{b.platform}</Badge>
                  <span className="text-sm">v{b.version}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {b.file_path ? `📦 ${b.file_path.split("/").pop()}` : b.external_url}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteBuild(b.id, b.file_path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2 p-3 rounded-xl border border-dashed border-border">
              <h3 className="text-sm font-medium">Add a build</h3>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={newBuild.platform}
                  onValueChange={(v) => setNewBuild({ ...newBuild, platform: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Version"
                  value={newBuild.version}
                  onChange={(e) => setNewBuild({ ...newBuild, version: e.target.value })}
                />
              </div>
              <Input ref={buildFileRef} type="file" />
              <Input
                placeholder="…or external URL (itch.io, GitHub release, etc.)"
                value={newBuild.external_url}
                onChange={(e) => setNewBuild({ ...newBuild, external_url: e.target.value })}
              />
              <Button onClick={handleAddBuild} disabled={!game} className="rounded-xl">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add build
              </Button>
            </div>
          </Card>

          <div className="flex gap-3 sticky bottom-4">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saving}
              className="rounded-2xl flex-1"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save draft
            </Button>
            <Button
              onClick={handleSubmitForReview}
              disabled={saving}
              className="rounded-2xl flex-1 bg-[image:var(--gradient-primary)] hover:opacity-90 shadow-[var(--glow-primary)]"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit for review
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GameForm;
