import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchMinecraftVersions, fetchLoaderVersions, LOADERS, type Loader, type McVersion } from "@/lib/minecraft/api";
import { createInstance } from "@/lib/minecraft/bridge";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (name: string) => void;
};

export function CreateInstanceWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [versions, setVersions] = useState<McVersion[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [mc, setMc] = useState("");
  const [loader, setLoader] = useState<Loader>("Fabric");
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [loadingLv, setLoadingLv] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) { setStep(1); return; }
    fetchMinecraftVersions().then(setVersions).catch(() => toast.error("Couldn't fetch Minecraft versions"));
  }, [open]);

  const filtered = useMemo(
    () => versions.filter((v) => showSnapshots ? true : v.type === "release"),
    [versions, showSnapshots],
  );

  useEffect(() => {
    if (!mc || step !== 2) return;
    setLoadingLv(true);
    fetchLoaderVersions(loader, mc)
      .then((vs) => { setLoaderVersions(vs); setLoaderVersion(vs[0] ?? ""); })
      .finally(() => setLoadingLv(false));
  }, [loader, mc, step]);

  useEffect(() => {
    if (step === 3 && !name) setName(`${loader} ${mc}`);
  }, [step, loader, mc, name]);

  async function handleCreate() {
    setCreating(true);
    const r = await createInstance({ name: name.trim(), mcVersion: mc, loader, loaderVersion });
    setCreating(false);
    if (r.ok) {
      toast.success(`Created "${name}"`);
      onCreated(name.trim());
      onOpenChange(false);
    } else {
      toast.error(r.error || "Failed to create instance");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Minecraft Instance</DialogTitle>
          <DialogDescription>Step {step} of 4</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Minecraft version</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Snapshots <Switch checked={showSnapshots} onCheckedChange={setShowSnapshots} />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {filtered.slice(0, 200).map((v) => (
                <button
                  key={v.id}
                  className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${mc === v.id ? "bg-primary/10" : ""}`}
                  onClick={() => setMc(v.id)}
                >
                  <span className="font-medium">{v.id}</span>{" "}
                  <Badge variant="outline" className="ml-2 text-[10px]">{v.type}</Badge>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!mc} onClick={() => setStep(2)}>Next</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label>Mod Loader</Label>
            <div className="grid grid-cols-5 gap-2">
              {LOADERS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLoader(l)}
                  className={`rounded-md border px-2 py-3 text-sm ${loader === l ? "border-primary bg-primary/10" : "border-border"}`}
                >{l}</button>
              ))}
            </div>
            <div>
              <Label>Loader version</Label>
              {loadingLv ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Fetching…
                </div>
              ) : loader === "Vanilla" ? (
                <div className="text-sm text-muted-foreground py-2">No loader (vanilla).</div>
              ) : (
                <Select value={loaderVersion} onValueChange={setLoaderVersion}>
                  <SelectTrigger><SelectValue placeholder="Pick version" /></SelectTrigger>
                  <SelectContent>
                    {loaderVersions.length === 0 && <SelectItem value="none" disabled>None available</SelectItem>}
                    {loaderVersions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button
                disabled={loader !== "Vanilla" && !loaderVersion}
                onClick={() => setStep(3)}
              >Next</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Label>Instance name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fabric Survival" />
            <div className="text-xs text-muted-foreground">
              {loader} {loaderVersion} · Minecraft {mc}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={!name.trim()} onClick={() => setStep(4)}>Next</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <div><b>Name:</b> {name}</div>
              <div><b>Minecraft:</b> {mc}</div>
              <div><b>Loader:</b> {loader} {loaderVersion}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              RUBIX will verify Java, download the loader installer, and create an isolated instance folder.
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button disabled={creating} onClick={handleCreate}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create Instance
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
