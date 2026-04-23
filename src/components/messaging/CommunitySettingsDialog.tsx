import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Trash2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCommunity,
  getCommunity,
  leaveCommunity,
  regenerateInviteCode,
  updateCommunity,
  type Community,
} from "@/lib/communities";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  meId: string;
  isAdmin: boolean;
  isOwner: boolean;
  onDeleted: () => void;
  onLeft: () => void;
};

export const CommunitySettingsDialog = ({
  open,
  onOpenChange,
  communityId,
  isAdmin,
  isOwner,
  onDeleted,
  onLeft,
}: Props) => {
  const [community, setCommunity] = useState<Community | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getCommunity(communityId).then((c) => {
      setCommunity(c);
      setName(c?.name ?? "");
      setIcon(c?.icon_url ?? "");
    });
  }, [open, communityId]);

  const save = async () => {
    setBusy(true);
    try {
      await updateCommunity(communityId, { name: name.trim(), icon_url: icon.trim() || null });
      toast.success("Saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const regen = async () => {
    setBusy(true);
    try {
      const code = await regenerateInviteCode(communityId);
      setCommunity((c) => (c ? { ...c, invite_code: code } : c));
      toast.success("New invite code generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!community) return;
    await navigator.clipboard.writeText(community.invite_code);
    toast.success("Copied");
  };

  const handleDelete = async () => {
    if (!confirm("Delete this community? This cannot be undone.")) return;
    try {
      await deleteCommunity(communityId);
      onDeleted();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleLeave = async () => {
    if (!confirm("Leave this community?")) return;
    try {
      await leaveCommunity(communityId);
      onLeft();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Community settings</DialogTitle>
        </DialogHeader>
        {!community ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
            </div>
            <div>
              <Label className="text-xs">Icon URL</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} disabled={!isAdmin} />
            </div>
            <div>
              <Label className="text-xs">Invite code</Label>
              <div className="flex gap-2">
                <Input value={community.invite_code} readOnly className="font-mono" />
                <Button size="icon" variant="outline" onClick={copy}>
                  <Copy className="h-4 w-4" />
                </Button>
                {isAdmin && (
                  <Button size="icon" variant="outline" onClick={regen} disabled={busy}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {isAdmin && (
              <Button onClick={save} disabled={busy} className="w-full">
                Save changes
              </Button>
            )}
            <div className="border-t border-border pt-3 space-y-2">
              {!isOwner && (
                <Button variant="outline" onClick={handleLeave} className="w-full">
                  <LogOut className="h-4 w-4 mr-2" /> Leave community
                </Button>
              )}
              {isOwner && (
                <Button variant="destructive" onClick={handleDelete} className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete community
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
