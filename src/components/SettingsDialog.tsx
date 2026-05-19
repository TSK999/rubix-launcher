import { useEffect, useState } from "react";
import { Gamepad2, Keyboard, Link2, LogOut, Mic, Palette, Pencil, RefreshCw, Settings, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeManager } from "@/components/ThemeManager";
import { KeybindsPanel } from "@/components/KeybindsPanel";
import { UpdatesPanel } from "@/components/UpdatesPanel";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { useControllerMode } from "@/hooks/useControllerMode";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { clearStoredSteamId } from "@/lib/steam-auth";
import { disconnectSpotify, startSpotifyOAuth } from "@/lib/spotify";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPreferredMicId,
  listMicDevicesWithPermission,
  setPreferredMicId,
  type MicDevice,
} from "@/lib/audio-devices";
import { callController } from "@/lib/call-controller";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  steamId: string | null;
  onSignedOut: () => void;
};

export const SettingsDialog = ({ open, onOpenChange, userId, steamId, onSignedOut }: Props) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const { enabled, setEnabled, controllerConnected } = useControllerMode();
  const { profile } = useRubixAuth();
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [micId, setMicId] = useState<string>(getPreferredMicId() ?? "default");

  useEffect(() => {
    if (!open) return;
    void listMicDevicesWithPermission().then(setMicDevices);
  }, [open]);

  const onMicChange = async (id: string) => {
    setMicId(id);
    setPreferredMicId(id === "default" ? null : id);
    if (id !== "default" && callController.getState().status !== "idle") {
      try {
        await callController.setMicDevice(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to switch mic");
      }
    }
  };


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearStoredSteamId();
    toast("Signed out of Rubix");
    onOpenChange(false);
    onSignedOut();
  };

  const connectSpotify = async () => {
    setSpotifyBusy(true);
    try {
      window.location.href = await startSpotifyOAuth(window.location.href);
    } catch (e) {
      toast.error("Couldn't start Spotify login", {
        description: e instanceof Error ? e.message : undefined,
      });
      setSpotifyBusy(false);
    }
  };

  const disconnectFromSpotify = async () => {
    if (!userId) return;
    setSpotifyBusy(true);
    try {
      await disconnectSpotify(userId);
      toast("Spotify disconnected");
    } finally {
      setSpotifyBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Settings
            </DialogTitle>
            <DialogDescription>Manage your Rubix profile, connections, controls, and theme.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="updates">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Updates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-3 pt-4">
              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <p className="text-sm font-medium">Profile</p>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {profile ? `@${profile.username}` : "Rubix account"}
                </p>
                <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => setProfileOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit profile
                </Button>
              </div>

              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Controller mode</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {controllerConnected ? "Controller detected" : "No controller detected"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                    <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Toggle controller mode" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Mic className="h-4 w-4 text-primary" />
                      Microphone input
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Used for voice calls. Switching mid-call swaps live.
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <Select value={micId} onValueChange={onMicChange}>
                    <SelectTrigger className="w-full rounded-xl">
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">System default</SelectItem>
                      {micDevices.map((d) => (
                        <SelectItem key={d.deviceId || d.label} value={d.deviceId}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button variant="destructive" className="w-full rounded-xl" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </TabsContent>

            <TabsContent value="connections" className="space-y-3 pt-4">
              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <p className="text-sm font-medium">Steam</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {steamId ? `Linked · ${steamId.slice(-6)}` : "Not linked"}
                </p>
                {!steamId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-xl"
                    onClick={() => {
                      localStorage.removeItem("rubix:steam-link-skipped");
                      window.location.reload();
                    }}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Link Steam
                  </Button>
                )}
              </div>

              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <p className="text-sm font-medium">Spotify</p>
                <p className="mt-1 text-xs text-muted-foreground">Connect or disconnect your Spotify client.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" disabled={spotifyBusy} onClick={connectSpotify}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-xl" disabled={spotifyBusy || !userId} onClick={disconnectFromSpotify}>
                    <Unlink className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="pt-4">
              <div className="rounded-2xl rubix-glass rubix-card-hi p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Palette className="h-4 w-4 text-primary" />
                  Theme
                </div>
                <ThemeManager embedded />
              </div>
            </TabsContent>

            <TabsContent value="updates" className="pt-4">
              <UpdatesPanel />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <EditProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};