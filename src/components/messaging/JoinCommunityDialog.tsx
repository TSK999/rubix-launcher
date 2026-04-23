import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinCommunityByCode } from "@/lib/communities";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJoined: (id: string) => void;
};

export const JoinCommunityDialog = ({ open, onOpenChange, onJoined }: Props) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const id = await joinCommunityByCode(code.trim());
      onJoined(id);
      onOpenChange(false);
      setCode("");
      toast.success("Joined community");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join a community</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Invite code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              maxLength={16}
              className="font-mono tracking-widest text-center"
            />
          </div>
          <Button onClick={submit} disabled={busy || !code.trim()} className="w-full">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Join
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
