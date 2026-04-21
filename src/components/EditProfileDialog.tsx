import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  updateMyProfile,
  uploadProfileBackground,
  uploadProfileAvatar,
} from "@/lib/rubix-profile";
import { SOCIALS, type SocialKey, type Socials } from "@/lib/socials";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export const EditProfileDialog = ({ open, onOpenChange }: Props) => {
  const { profile, refreshProfile } = useRubixAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgKind, setBgKind] = useState<"image" | "gif" | "video" | null>(null);
  const [privacy, setPrivacy] = useState<"public" | "friends" | "private">("public");
  const [socials, setSocials] = useState<Socials>({});
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      // Re-fetch privacy/bg fields not present in useRubixAuth shape
      void (async () => {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("profiles")
          .select("bio, background_url, background_kind, privacy")
          .eq("user_id", profile.user_id)
          .maybeSingle();
        if (data) {
          setBio(data.bio ?? "");
          setBgUrl(data.background_url ?? null);
          setBgKind((data.background_kind as "image" | "gif" | "video" | null) ?? null);
          setPrivacy((data.privacy as "public" | "friends" | "private") ?? "public");
        }
      })();
    }
  }, [open, profile]);

  if (!profile) return null;

  const handleBgFile = async (file: File) => {
    setUploadingBg(true);
    try {
      const { url, kind } = await uploadProfileBackground(profile.user_id, file);
      setBgUrl(url);
      setBgKind(kind);
      toast.success("Background uploaded");
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setUploadingBg(false);
    }
  };

  const handleAvatarFile = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const url = await uploadProfileAvatar(profile.user_id, file);
      setAvatarUrl(url);
      toast.success("Avatar updated");
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile(profile.user_id, {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        background_url: bgUrl,
        background_kind: bgUrl ? bgKind : null,
        privacy,
      });
      await refreshProfile();
      toast.success("Profile saved");
      onOpenChange(false);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update how others see you on Rubix.</DialogDescription>
        </DialogHeader>

        {/* Background preview */}
        <div className="space-y-2">
          <Label>Profile background</Label>
          <div className="relative h-32 rounded-lg overflow-hidden bg-secondary">
            {bgUrl ? (
              bgKind === "video" ? (
                <video
                  src={bgUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <img
                  src={bgUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                No background
              </div>
            )}
            {bgUrl && (
              <button
                onClick={() => {
                  setBgUrl(null);
                  setBgKind(null);
                }}
                className="absolute top-2 right-2 h-7 w-7 rounded-md bg-background/80 backdrop-blur grid place-items-center hover:bg-background"
                title="Remove background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleBgFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingBg}
            onClick={() => bgInputRef.current?.click()}
          >
            {uploadingBg ? (
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
            ) : (
              <Upload className="h-3 w-3 mr-2" />
            )}
            Upload background (image, GIF, or MP4 — max 25MB)
          </Button>
        </div>

        {/* Avatar */}
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback>
                {(displayName || profile.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAvatarFile(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
              ) : (
                <Upload className="h-3 w-3 mr-2" />
              )}
              Change avatar
            </Button>
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={profile.username}
          />
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people about yourself…"
            rows={3}
            maxLength={280}
          />
          <p className="text-[11px] text-muted-foreground text-right">{bio.length}/280</p>
        </div>

        {/* Privacy */}
        <div className="space-y-2">
          <Label>Profile privacy</Label>
          <Select value={privacy} onValueChange={(v) => setPrivacy(v as typeof privacy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public — anyone on Rubix</SelectItem>
              <SelectItem value="friends">Friends only</SelectItem>
              <SelectItem value="private">Private — only me</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
