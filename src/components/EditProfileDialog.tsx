import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Upload, X, Sparkles, Palette, User as UserIcon,
  Link2, Layout, Wand2, Plus, Trash2, GripVertical, MousePointer2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  updateMyProfile, uploadProfileBackground, uploadProfileAvatar,
} from "@/lib/rubix-profile";
import { SOCIALS, type SocialKey, type Socials } from "@/lib/socials";
import {
  ACCENT_PRESETS, AVATAR_FRAMES, AVATAR_SHAPES, BANNER_OVERLAYS, BANNER_EFFECTS,
  BANNER_HEIGHTS, CARD_STYLES, CLICK_EFFECTS, CORNER_RADII, CURSOR_STYLES,
  DEFAULT_CUSTOMIZATION, DENSITIES, FONT_PAIRS, MOTION_LEVELS, NAME_EFFECTS,
  ALL_SECTIONS, accentVarStyle, fontFamilyFor, resolveCustomization,
  type AvatarFrame, type AvatarShape, type BannerEffect, type BannerHeight,
  type BannerOverlay, type CardStyle, type ClickEffect, type CornerRadius,
  type CursorStyle, type Density, type FontPair, type MotionLevel, type NameEffect,
  type ResolvedCustomization, type SectionKey,
} from "@/lib/profile-customization";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export const EditProfileDialog = ({ open, onOpenChange }: Props) => {
  const { profile, refreshProfile } = useRubixAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [statusText, setStatusText] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgKind, setBgKind] = useState<"image" | "gif" | "video" | null>(null);
  const [privacy, setPrivacy] = useState<"public" | "friends" | "private">("public");
  const [socials, setSocials] = useState<Socials>({});
  const [custom, setCustom] = useState<ResolvedCustomization>(DEFAULT_CUSTOMIZATION);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      void (async () => {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("profiles")
          .select("bio, background_url, background_kind, privacy, socials, pronouns, location, status_emoji, status_text, customization")
          .eq("user_id", profile.user_id)
          .maybeSingle();
        if (data) {
          setBio(data.bio ?? "");
          setBgUrl(data.background_url ?? null);
          setBgKind((data.background_kind as "image" | "gif" | "video" | null) ?? null);
          setPrivacy((data.privacy as "public" | "friends" | "private") ?? "public");
          setSocials((data.socials && typeof data.socials === "object" ? data.socials : {}) as Socials);
          setPronouns(data.pronouns ?? "");
          setLocation(data.location ?? "");
          setStatusEmoji(data.status_emoji ?? "");
          setStatusText(data.status_text ?? "");
          setCustom(resolveCustomization(data.customization));
        }
      })();
    }
  }, [open, profile]);

  const accentStyle = useMemo(
    () => accentVarStyle(custom.accent, custom.customAccentHex, custom.secondaryAccentHex),
    [custom.accent, custom.customAccentHex, custom.secondaryAccentHex],
  );

  if (!profile) return null;

  const handleBgFile = async (file: File) => {
    setUploadingBg(true);
    try {
      const { url, kind } = await uploadProfileBackground(profile.user_id, file);
      setBgUrl(url); setBgKind(kind); toast.success("Background uploaded");
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "" });
    } finally { setUploadingBg(false); }
  };

  const handleAvatarFile = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const url = await uploadProfileAvatar(profile.user_id, file);
      setAvatarUrl(url); toast.success("Avatar updated");
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "" });
    } finally { setUploadingAvatar(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const cleanSocials: Socials = {};
      for (const [k, v] of Object.entries(socials)) {
        if (typeof v === "string" && v.trim()) cleanSocials[k as SocialKey] = v.trim();
      }
      await updateMyProfile(profile.user_id, {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        background_url: bgUrl,
        background_kind: bgUrl ? bgKind : null,
        privacy,
        socials: cleanSocials,
        pronouns: pronouns.trim() || null,
        location: location.trim() || null,
        status_emoji: statusEmoji.trim() || null,
        status_text: statusText.trim() || null,
        customization: custom,
      });
      await refreshProfile();
      toast.success("Profile saved");
      onOpenChange(false);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally { setSaving(false); }
  };

  const initials = (displayName || profile.username).slice(0, 2).toUpperCase();

  // -- preview class maps --
  const ovCls = (o: BannerOverlay) => (o === "none" ? "" : `rubix-overlay-${o}`);
  const beCls = (b: BannerEffect) => (b === "none" ? "" : `rubix-banner-${b}`);
  const nmCls = (n: NameEffect) => (n === "none" ? "" : `rubix-name-${n}`);
  const frCls = (f: AvatarFrame) => (f === "none" ? "" : `rubix-frame-${f}`);
  const shCls = (s: AvatarShape) => `rubix-avatar-shape-${s}`;
  const cdCls = (c: CardStyle) => `rubix-pcard-${c}`;

  const move = (arr: SectionKey[], from: number, to: number) => {
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  const Preview = (
    <div
      className="rounded-2xl overflow-hidden border border-border"
      style={{ ...accentStyle, fontFamily: fontFamilyFor(custom.fontPair) }}
    >
      <div
        className={cn(
          "relative h-32 bg-gradient-to-br from-[hsl(var(--profile-accent)/0.6)] via-background to-background",
          ovCls(custom.bannerOverlay),
          beCls(custom.bannerEffect),
        )}
      >
        {bgUrl &&
          (bgKind === "video" ? (
            <video src={bgUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ))}
      </div>
      <div className={cn("p-4 -mt-10 relative", cdCls(custom.cardStyle))}>
        <div className="flex items-end gap-3">
          <div className={frCls(custom.avatarFrame)}>
            <div className={cn("h-16 w-16 bg-secondary", shCls(custom.avatarShape))}>
              <Avatar className="h-full w-full rounded-none">
                <AvatarImage src={avatarUrl ?? undefined} className="object-cover" />
                <AvatarFallback className="rounded-none">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div className="pb-1 min-w-0">
            <div
              className={cn("text-lg leading-tight truncate", nmCls(custom.nameEffect))}
              style={{ fontWeight: custom.nameWeight }}
            >
              {displayName || profile.username}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              @{profile.username}{pronouns && <span className="ml-2">· {pronouns}</span>}
            </p>
            {(statusEmoji || statusText) && (
              <p className="mt-1 text-xs">
                {statusEmoji && <span className="mr-1">{statusEmoji}</span>}
                <span className="text-muted-foreground">{statusText}</span>
              </p>
            )}
          </div>
        </div>
        {custom.pinnedQuote?.text && (
          <p className="mt-3 text-xs italic text-muted-foreground border-l-2 pl-2 border-[hsl(var(--profile-accent))]">
            "{custom.pinnedQuote.text}"
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Customize profile
          </DialogTitle>
          <DialogDescription>Make it deeply yours — color, motion, sections, content.</DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_300px] gap-5">
          <div>
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="identity"><UserIcon className="h-3.5 w-3.5 mr-1" />Identity</TabsTrigger>
                <TabsTrigger value="theme"><Palette className="h-3.5 w-3.5 mr-1" />Theme</TabsTrigger>
                <TabsTrigger value="effects"><Wand2 className="h-3.5 w-3.5 mr-1" />Effects</TabsTrigger>
                <TabsTrigger value="layout"><Layout className="h-3.5 w-3.5 mr-1" />Layout</TabsTrigger>
                <TabsTrigger value="sections"><GripVertical className="h-3.5 w-3.5 mr-1" />Sections</TabsTrigger>
                <TabsTrigger value="links"><Link2 className="h-3.5 w-3.5 mr-1" />Links</TabsTrigger>
              </TabsList>

              {/* IDENTITY */}
              <TabsContent value="identity" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Avatar</Label>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={avatarUrl ?? undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarFile(f); e.target.value = ""; }} />
                    <Button type="button" variant="outline" size="sm" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
                      {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Upload className="h-3 w-3 mr-2" />}
                      Change avatar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Profile background</Label>
                  <div className="relative h-28 rounded-lg overflow-hidden bg-secondary">
                    {bgUrl ? (bgKind === "video" ? (
                      <video src={bgUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )) : (
                      <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">No background</div>
                    )}
                    {bgUrl && (
                      <button onClick={() => { setBgUrl(null); setBgKind(null); }}
                        className="absolute top-2 right-2 h-7 w-7 rounded-md bg-background/80 backdrop-blur grid place-items-center hover:bg-background">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <input ref={bgInputRef} type="file" accept="image/*,video/mp4,video/webm" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBgFile(f); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="sm" disabled={uploadingBg} onClick={() => bgInputRef.current?.click()}>
                    {uploadingBg ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Upload className="h-3 w-3 mr-2" />}
                    Upload (image, GIF, MP4 — max 25MB)
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display name</Label>
                    <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={profile.username} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pronouns">Pronouns</Label>
                    <Input id="pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" maxLength={32} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Earth" maxLength={64} />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex gap-2">
                    <Input value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value.slice(0, 4))} placeholder="🎮" className="w-16 text-center" />
                    <Input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="What are you up to?" maxLength={80} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself…" rows={3} maxLength={280} />
                  <p className="text-[11px] text-muted-foreground text-right">{bio.length}/280</p>
                </div>

                <div className="space-y-2">
                  <Label>Pinned quote</Label>
                  <Input
                    value={custom.pinnedQuote?.text ?? ""}
                    onChange={(e) => setCustom((c) => ({ ...c, pinnedQuote: e.target.value ? { text: e.target.value, attribution: c.pinnedQuote?.attribution } : null }))}
                    placeholder="A line that defines you…" maxLength={200}
                  />
                  <Input
                    value={custom.pinnedQuote?.attribution ?? ""}
                    onChange={(e) => setCustom((c) => ({ ...c, pinnedQuote: c.pinnedQuote ? { ...c.pinnedQuote, attribution: e.target.value } : { text: "", attribution: e.target.value } }))}
                    placeholder="— Attribution (optional)" maxLength={60}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Profile privacy</Label>
                  <Select value={privacy} onValueChange={(v) => setPrivacy(v as typeof privacy)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public — anyone on Rubix</SelectItem>
                      <SelectItem value="friends">Friends only</SelectItem>
                      <SelectItem value="private">Private — only me</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* THEME */}
              <TabsContent value="theme" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label>Accent preset</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {ACCENT_PRESETS.map((p) => {
                      const active = custom.accent === p.key && !custom.customAccentHex;
                      return (
                        <button key={p.key} type="button"
                          onClick={() => setCustom((c) => ({ ...c, accent: p.key, customAccentHex: null }))}
                          className={cn(
                            "group rounded-xl border p-1.5 flex flex-col items-center gap-1 transition-all",
                            active ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
                          )}>
                          <div className="h-7 w-full rounded-md" style={{ background: `hsl(${p.hue} ${p.sat}% ${p.light}%)` }} />
                          <span className="text-[10px] text-muted-foreground truncate w-full text-center">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Custom primary (hex)</Label>
                    <div className="flex gap-2">
                      <input type="color" value={custom.customAccentHex ?? "#7c3aed"}
                        onChange={(e) => setCustom((c) => ({ ...c, customAccentHex: e.target.value }))}
                        className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer" />
                      <Input value={custom.customAccentHex ?? ""} placeholder="#7c3aed"
                        onChange={(e) => setCustom((c) => ({ ...c, customAccentHex: e.target.value || null }))} />
                      {custom.customAccentHex && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setCustom((c) => ({ ...c, customAccentHex: null }))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secondary accent (hex)</Label>
                    <div className="flex gap-2">
                      <input type="color" value={custom.secondaryAccentHex ?? "#ec4899"}
                        onChange={(e) => setCustom((c) => ({ ...c, secondaryAccentHex: e.target.value }))}
                        className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer" />
                      <Input value={custom.secondaryAccentHex ?? ""} placeholder="optional"
                        onChange={(e) => setCustom((c) => ({ ...c, secondaryAccentHex: e.target.value || null }))} />
                      {custom.secondaryAccentHex && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setCustom((c) => ({ ...c, secondaryAccentHex: null }))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Typography</Label>
                  <Select value={custom.fontPair} onValueChange={(v) => setCustom((c) => ({ ...c, fontPair: v as FontPair }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_PAIRS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Name weight: {custom.nameWeight}</Label>
                  <Slider min={400} max={900} step={100} value={[custom.nameWeight]}
                    onValueChange={([v]) => setCustom((c) => ({ ...c, nameWeight: v }))} />
                </div>
              </TabsContent>

              {/* EFFECTS */}
              <TabsContent value="effects" className="space-y-5 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Banner overlay</Label>
                    <Select value={custom.bannerOverlay} onValueChange={(v) => setCustom((c) => ({ ...c, bannerOverlay: v as BannerOverlay }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BANNER_OVERLAYS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Banner motion</Label>
                    <Select value={custom.bannerEffect} onValueChange={(v) => setCustom((c) => ({ ...c, bannerEffect: v as BannerEffect }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BANNER_EFFECTS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Banner height</Label>
                    <Select value={custom.bannerHeight} onValueChange={(v) => setCustom((c) => ({ ...c, bannerHeight: v as BannerHeight }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BANNER_HEIGHTS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Banner tint: {Math.round(custom.bannerTintOpacity * 100)}%</Label>
                    <Slider min={0} max={100} step={5} value={[custom.bannerTintOpacity * 100]}
                      onValueChange={([v]) => setCustom((c) => ({ ...c, bannerTintOpacity: v / 100 }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Name effect</Label>
                    <Select value={custom.nameEffect} onValueChange={(v) => setCustom((c) => ({ ...c, nameEffect: v as NameEffect }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NAME_EFFECTS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Avatar frame</Label>
                    <Select value={custom.avatarFrame} onValueChange={(v) => setCustom((c) => ({ ...c, avatarFrame: v as AvatarFrame }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AVATAR_FRAMES.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Avatar shape</Label>
                    <Select value={custom.avatarShape} onValueChange={(v) => setCustom((c) => ({ ...c, avatarShape: v as AvatarShape }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AVATAR_SHAPES.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Motion level</Label>
                    <Select value={custom.motionLevel} onValueChange={(v) => setCustom((c) => ({ ...c, motionLevel: v as MotionLevel }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOTION_LEVELS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><MousePointer2 className="h-3 w-3" />Cursor</Label>
                    <Select value={custom.cursorStyle} onValueChange={(v) => setCustom((c) => ({ ...c, cursorStyle: v as CursorStyle }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURSOR_STYLES.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Click effect</Label>
                    <Select value={custom.clickEffect} onValueChange={(v) => setCustom((c) => ({ ...c, clickEffect: v as ClickEffect }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLICK_EFFECTS.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* LAYOUT */}
              <TabsContent value="layout" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label>Card style</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CARD_STYLES.map((s) => {
                      const active = custom.cardStyle === s.key;
                      return (
                        <button key={s.key} type="button"
                          onClick={() => setCustom((c) => ({ ...c, cardStyle: s.key }))}
                          className={cn(
                            "rounded-xl border p-3 text-xs transition-all",
                            active ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
                            `rubix-pcard-${s.key}`,
                          )}
                          style={accentStyle}>{s.name}</button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Corner radius</Label>
                    <Select value={custom.cornerRadius} onValueChange={(v) => setCustom((c) => ({ ...c, cornerRadius: v as CornerRadius }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CORNER_RADII.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Density</Label>
                    <Select value={custom.density} onValueChange={(v) => setCustom((c) => ({ ...c, density: v as Density }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DENSITIES.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Showcase social links</p>
                    <p className="text-xs text-muted-foreground">Pills displayed prominently.</p>
                  </div>
                  <Switch checked={custom.showcaseSocials} onCheckedChange={(v) => setCustom((c) => ({ ...c, showcaseSocials: v }))} />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Compact layout</p>
                    <p className="text-xs text-muted-foreground">Tighter spacing, smaller hero.</p>
                  </div>
                  <Switch checked={custom.compactLayout} onCheckedChange={(v) => setCustom((c) => ({ ...c, compactLayout: v }))} />
                </div>
              </TabsContent>

              {/* SECTIONS */}
              <TabsContent value="sections" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label>Section order & visibility</Label>
                  <p className="text-xs text-muted-foreground">Drag-free reorder via arrows. Toggle visibility per section.</p>
                  <ul className="space-y-2">
                    {custom.sectionOrder.map((sec, i) => {
                      const meta = ALL_SECTIONS.find((s) => s.key === sec);
                      if (!meta) return null;
                      const hidden = custom.hiddenSections.includes(sec);
                      return (
                        <li key={sec} className="flex items-center gap-2 rounded-lg border border-border p-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">{meta.name}</span>
                          <Button size="icon" variant="ghost" disabled={i === 0}
                            onClick={() => setCustom((c) => ({ ...c, sectionOrder: move(c.sectionOrder, i, i - 1) }))}>↑</Button>
                          <Button size="icon" variant="ghost" disabled={i === custom.sectionOrder.length - 1}
                            onClick={() => setCustom((c) => ({ ...c, sectionOrder: move(c.sectionOrder, i, i + 1) }))}>↓</Button>
                          <Switch checked={!hidden}
                            onCheckedChange={(v) => setCustom((c) => ({
                              ...c,
                              hiddenSections: v ? c.hiddenSections.filter((k) => k !== sec) : [...c.hiddenSections, sec],
                            }))} />
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>About-me fields</Label>
                    <Button size="sm" variant="outline"
                      onClick={() => setCustom((c) => ({ ...c, customFields: [...c.customFields, { label: "", value: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" />Add field
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Key-value snippets like "Setup", "Main game", "Coffee order".</p>
                  <div className="space-y-2">
                    {custom.customFields.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No fields yet.</p>
                    )}
                    {custom.customFields.map((f, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input value={f.label} placeholder="Label"
                          onChange={(e) => setCustom((c) => ({
                            ...c, customFields: c.customFields.map((x, i) => i === idx ? { ...x, label: e.target.value } : x),
                          }))} className="w-1/3" maxLength={32} />
                        <Input value={f.value} placeholder="Value"
                          onChange={(e) => setCustom((c) => ({
                            ...c, customFields: c.customFields.map((x, i) => i === idx ? { ...x, value: e.target.value } : x),
                          }))} maxLength={120} />
                        <Button size="icon" variant="ghost"
                          onClick={() => setCustom((c) => ({ ...c, customFields: c.customFields.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* LINKS */}
              <TabsContent value="links" className="space-y-3 pt-4">
                {SOCIALS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <div className="h-9 w-9 grid place-items-center rounded-md border border-border bg-secondary/40 shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <Input value={socials[s.key] ?? ""}
                        onChange={(e) => setSocials((prev) => ({ ...prev, [s.key]: e.target.value }))}
                        placeholder={`${s.label} — ${s.placeholder}`} />
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          </div>

          {/* Live preview */}
          <div className="md:sticky md:top-0 self-start space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Live preview</Label>
            {Preview}
            <Button type="button" variant="ghost" size="sm" className="w-full text-xs"
              onClick={() => setCustom(DEFAULT_CUSTOMIZATION)}>
              Reset all customization
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
