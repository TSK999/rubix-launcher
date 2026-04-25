import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { statusBadgeVariant } from "@/lib/store";

const schema = z.object({
  company_name: z.string().trim().min(2).max(100),
  full_name: z.string().trim().min(2).max(100),
  contact_email: z.string().trim().email().max(255),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  description: z.string().trim().min(20).max(2000),
});

const DeveloperApply = () => {
  const navigate = useNavigate();
  const { user } = useRubixAuth();
  const [existing, setExisting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    full_name: "",
    contact_email: "",
    website: "",
    description: "",
  });

  useEffect(() => {
    document.title = "Become a developer — RUBIX";
    if (!user) return;
    supabase
      .from("developer_applications")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExisting(data);
          setForm({
            company_name: data.company_name,
            full_name: data.full_name,
            contact_email: data.contact_email,
            website: data.website ?? "",
            description: data.description,
          });
        }
        setLoading(false);
      });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error("Check your form", { description: parsed.error.issues[0].message });
      return;
    }
    setSubmitting(true);
    const payload = { ...parsed.data, website: parsed.data.website || null, user_id: user.id };
    const { error } = existing
      ? await supabase
          .from("developer_applications")
          .update(payload)
          .eq("id", existing.id)
      : await supabase.from("developer_applications").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't submit application", { description: error.message });
      return;
    }
    toast.success("Application submitted", { description: "An admin will review it shortly." });
    navigate("/developer");
  };

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
        <div className="p-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Briefcase className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Become a developer</h1>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="p-6 rounded-2xl border-border bg-card/40 space-y-4">
              {existing && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={statusBadgeVariant(existing.status)}>{existing.status}</Badge>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Company / Studio name</Label>
                  <Input
                    className="mt-1"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                    maxLength={100}
                    disabled={existing?.status === "approved"}
                  />
                </div>
                <div>
                  <Label>Your full name</Label>
                  <Input
                    className="mt-1"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                    maxLength={100}
                    disabled={existing?.status === "approved"}
                  />
                </div>
                <div>
                  <Label>Contact email</Label>
                  <Input
                    type="email"
                    className="mt-1"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    required
                    maxLength={255}
                    disabled={existing?.status === "approved"}
                  />
                </div>
                <div>
                  <Label>Website (optional)</Label>
                  <Input
                    className="mt-1"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    maxLength={255}
                    disabled={existing?.status === "approved"}
                  />
                </div>
                <div>
                  <Label>Tell us about your work</Label>
                  <Textarea
                    className="mt-1 min-h-32"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required
                    maxLength={2000}
                    disabled={existing?.status === "approved"}
                  />
                </div>
                {existing?.status !== "approved" && (
                  <Button
                    type="submit"
                    disabled={submitting || existing?.status === "pending"}
                    className="w-full rounded-2xl"
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {existing?.status === "pending"
                      ? "Awaiting review"
                      : existing
                      ? "Resubmit application"
                      : "Submit application"}
                  </Button>
                )}
              </form>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default DeveloperApply;
