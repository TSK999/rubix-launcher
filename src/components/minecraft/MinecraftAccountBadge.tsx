import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogIn, LogOut, User, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  whoami, signInStart, signInCancel, signOut, onSignInComplete,
  type McAccount,
} from "@/lib/minecraft/bridge";

type Props = { onAccount?: (a: McAccount | null) => void };

export function MinecraftAccountBadge({ onAccount }: Props) {
  const [account, setAccount] = useState<McAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await whoami();
    const acc = r.ok ? r.account : null;
    setAccount(acc);
    onAccount?.(acc);
    setLoading(false);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const off = onSignInComplete((data) => {
      setSigningIn(false);
      setUserCode(null);
      setSignInOpen(false);
      if (data.ok && data.account) {
        setAccount(data.account);
        onAccount?.(data.account);
        toast.success(`Signed in as ${data.account.name}`);
      } else {
        toast.error(data.error || "Sign-in failed");
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSignIn() {
    setSignInOpen(true);
    setSigningIn(true);
    const r = await signInStart();
    if (!r.ok) {
      setSigningIn(false);
      toast.error(r.error || "Could not start sign-in");
      setSignInOpen(false);
      return;
    }
    setUserCode(r.userCode || null);
    setVerificationUri(r.verificationUri || null);
  }

  async function cancelSignIn() {
    await signInCancel();
    setSigningIn(false);
    setUserCode(null);
    setSignInOpen(false);
  }

  async function doSignOut() {
    await signOut();
    setAccount(null);
    onAccount?.(null);
    toast.success("Signed out");
  }

  return (
    <>
      {loading ? (
        <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> checking…</Badge>
      ) : account ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <User className="h-3 w-3" /> {account.name}
          </Badge>
          <Button size="sm" variant="ghost" onClick={doSignOut}>
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={startSignIn}>
          <LogIn className="h-3.5 w-3.5 mr-1" /> Sign in with Microsoft
        </Button>
      )}

      <Dialog open={signInOpen} onOpenChange={(o) => { if (!o) cancelSignIn(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in with Microsoft</DialogTitle>
            <DialogDescription>
              A browser tab has opened. Enter this code to link your Microsoft account:
            </DialogDescription>
          </DialogHeader>
          {userCode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/40 py-4">
                <code className="text-2xl font-bold tracking-widest">{userCode}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(userCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {verificationUri && (
                <a
                  href={verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> {verificationUri}
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Waiting for approval… you can close this dialog to cancel.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelSignIn}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
