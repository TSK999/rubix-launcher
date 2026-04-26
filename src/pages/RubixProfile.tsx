import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  ShieldOff,
  Ban,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  acceptFriendRequest,
  blockUser,
  fetchFriendship,
  fetchProfileByUsername,
  removeFriendship,
  sendFriendRequest,
  unblockUser,
  type FriendshipState,
  type RubixPublicProfile,
} from "@/lib/rubix-profile";
import { getOrCreateDm } from "@/lib/messaging";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { RoleBadges } from "@/components/RoleBadges";
import { SOCIALS } from "@/lib/socials";
import { ExternalLink } from "lucide-react";
import { accentVarStyle, fontFamilyFor, resolveCustomization } from "@/lib/profile-customization";
import { cn } from "@/lib/utils";

const RubixProfile = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { profile: me, loading: meLoading } = useRubixAuth();
  const [profile, setProfile] = useState<RubixPublicProfile | null>(null);
  const [friendship, setFriendship] = useState<FriendshipState>({ kind: "none" });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const reload = async () => {
    if (!username) return;
    setLoading(true);
    const p = await fetchProfileByUsername(username);
    setProfile(p);
    if (p && me) {
      const f = await fetchFriendship(me.user_id, p.user_id);
      setFriendship(f);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (meLoading) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, me?.user_id, meLoading]);

  if (loading || meLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 rubix-fade-up">
          <div className="rubix-ring-active h-14 w-14">
            <div className="h-full w-full rounded-full bg-card grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-center space-y-3 rubix-fade-up">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary/60 grid place-items-center">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold">User not found</p>
          <p className="text-sm text-muted-foreground">
            No Rubix profile matches @{username}.
          </p>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/">Back to library</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isMine = me?.user_id === profile.user_id;
  const isFriends = friendship.kind === "friends";

  const canView =
    profile.privacy === "public" ||
    isMine ||
    (profile.privacy === "friends" && isFriends);

  const handleAdd = async () => {
    if (!me) return;
    setActionLoading(true);
    try {
      await sendFriendRequest(me.user_id, profile.user_id);
      toast.success("Friend request sent");
      await reload();
    } catch (e) {
      toast.error("Couldn't send request", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (friendship.kind !== "incoming") return;
    setActionLoading(true);
    try {
      await acceptFriendRequest(friendship.row.id);
      toast.success("You're now friends");
      await reload();
    } catch (e) {
      toast.error("Couldn't accept", { description: e instanceof Error ? e.message : "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async () => {
    if (friendship.kind !== "friends" && friendship.kind !== "outgoing" && friendship.kind !== "incoming")
      return;
    setActionLoading(true);
    try {
      await removeFriendship(friendship.row.id);
      toast("Removed");
      await reload();
    } catch (e) {
      toast.error("Couldn't remove", { description: e instanceof Error ? e.message : "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!me || isMine) return;
    setActionLoading(true);
    try {
      await blockUser(me.user_id, profile.user_id);
      toast.success(`Blocked @${profile.username}`, {
        description: "They're hidden from search.",
      });
      await reload();
    } catch (e) {
      toast.error("Couldn't block", { description: e instanceof Error ? e.message : "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (friendship.kind !== "blocked") return;
    setActionLoading(true);
    try {
      await unblockUser(friendship.row.id);
      toast("Unblocked");
      await reload();
    } catch (e) {
      toast.error("Couldn't unblock", { description: e instanceof Error ? e.message : "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!me || isMine) return;
    try {
      const conversationId = await getOrCreateDm(profile.user_id);
      window.dispatchEvent(new CustomEvent("rubix:open-dm", { detail: { conversationId } }));
      navigate("/");
    } catch (e) {
      toast.error("Couldn't open DM", { description: e instanceof Error ? e.message : "" });
    }
  };

  const cz = resolveCustomization(profile.customization);
  const overlayClass =
    cz.bannerOverlay === "none" ? "" : `rubix-overlay-${cz.bannerOverlay}`;
  const nameClass =
    cz.nameEffect === "none" ? "" : `rubix-name-${cz.nameEffect}`;
  const frameClass =
    cz.avatarFrame === "none" ? "" : `rubix-frame-${cz.avatarFrame}`;
  const cardClass = `rubix-pcard-${cz.cardStyle}`;
  const heroH = cz.compactLayout ? "h-44 md:h-56" : "h-64 md:h-80";

  return (
    <div
      className="min-h-screen bg-background"
      style={{ ...accentVarStyle(cz.accent), fontFamily: fontFamilyFor(cz.fontPair) }}
    >
      {/* Background hero */}
      <div className={cn("relative w-full overflow-hidden bg-gradient-to-br from-[hsl(var(--profile-accent)/0.4)] via-background to-background", heroH, overlayClass)}>
        {profile.background_url && (
          profile.background_kind === "video" ? (
            <video
              src={profile.background_url}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <img
              src={profile.background_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 h-9 w-9 rounded-full bg-background/70 backdrop-blur grid place-items-center hover:bg-background z-10"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Header */}
      <div className={cn("max-w-4xl mx-auto px-6 relative", cz.compactLayout ? "-mt-12" : "-mt-16")}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 rubix-fade-up">
          <div className="flex items-end gap-4">
            <div className={frameClass || "p-[3px] rounded-full"}>
              <Avatar className={cn("ring-4 ring-background shadow-xl", cz.compactLayout ? "h-20 w-20" : "h-28 w-28")}>
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {(profile.display_name ?? profile.username).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="pb-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={cn("text-2xl font-bold leading-tight", nameClass)}>
                  {profile.display_name ?? profile.username}
                </h1>
                <RoleBadges userId={profile.user_id} />
              </div>
              <p className="text-sm text-muted-foreground">
                @{profile.username}
                {profile.pronouns && <span className="ml-2">· {profile.pronouns}</span>}
                {profile.location && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    · <MapPin className="h-3 w-3" />{profile.location}
                  </span>
                )}
              </p>
              {(profile.status_emoji || profile.status_text) && (
                <p className="mt-1.5 text-sm">
                  {profile.status_emoji && <span className="mr-1.5">{profile.status_emoji}</span>}
                  <span className="text-muted-foreground">{profile.status_text}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pb-2">
            {isMine ? (
              <Button onClick={() => setEditing(true)} variant="outline">
                <Pencil className="h-4 w-4 mr-2" /> Edit profile
              </Button>
            ) : friendship.kind === "blocked" ? (
              <Button variant="outline" onClick={handleUnblock} disabled={actionLoading}>
                <ShieldOff className="h-4 w-4 mr-2" /> Unblock
              </Button>
            ) : (
              <>
                {friendship.kind === "none" && (
                  <Button onClick={handleAdd} disabled={actionLoading}>
                    <UserPlus className="h-4 w-4 mr-2" /> Add friend
                  </Button>
                )}
                {friendship.kind === "outgoing" && (
                  <Button variant="outline" onClick={handleRemove} disabled={actionLoading}>
                    <Clock className="h-4 w-4 mr-2" /> Request sent
                  </Button>
                )}
                {friendship.kind === "incoming" && (
                  <>
                    <Button onClick={handleAccept} disabled={actionLoading}>
                      <Check className="h-4 w-4 mr-2" /> Accept
                    </Button>
                    <Button variant="outline" onClick={handleRemove} disabled={actionLoading}>
                      <X className="h-4 w-4 mr-2" /> Decline
                    </Button>
                  </>
                )}
                {friendship.kind === "friends" && (
                  <Button variant="outline" onClick={handleRemove} disabled={actionLoading}>
                    <UserMinus className="h-4 w-4 mr-2" /> Friends
                  </Button>
                )}
                <Button variant="secondary" onClick={handleMessage}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Message
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" title="More">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleBlock}
                      disabled={actionLoading}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="h-4 w-4 mr-2" /> Block @{profile.username}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* Bio / private gate */}
        <div className={cn("pb-12", cz.compactLayout ? "mt-4 space-y-4" : "mt-6")}>
          {friendship.kind === "blocked" ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
              <Ban className="h-6 w-6 mx-auto text-destructive" />
              <p className="font-medium">You blocked @{profile.username}</p>
              <p className="text-sm text-muted-foreground">
                They're hidden from your search results. Unblock to interact again.
              </p>
            </div>
          ) : !canView ? (
            <div className={cn("rounded-xl p-8 text-center space-y-2", cardClass)}>
              <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="font-medium">This profile is {profile.privacy}</p>
              <p className="text-sm text-muted-foreground">
                {profile.privacy === "friends"
                  ? "Only friends can view the full profile."
                  : "This profile is hidden."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {profile.bio ? (
                <div className={cn("rounded-xl p-5", cardClass)}>
                  <p className="text-sm uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                    <Users className="h-3 w-3" /> About
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{profile.bio}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No bio yet.</p>
              )}

              {cz.showcaseSocials && profile.socials && Object.values(profile.socials).some((v) => v && v.trim()) && (
                <div className={cn("rounded-xl p-5", cardClass)}>
                  <p className="text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <ExternalLink className="h-3 w-3" /> Socials
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SOCIALS.map((s) => {
                      const raw = profile.socials?.[s.key];
                      if (!raw || !raw.trim()) return null;
                      const Icon = s.icon;
                      const url = s.toUrl(raw);
                      const label = s.display(raw);
                      const inner = (
                        <>
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="text-sm truncate max-w-[180px]">{label}</span>
                        </>
                      );
                      const className =
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[hsl(var(--profile-accent)/0.35)] bg-[hsl(var(--profile-accent)/0.1)] hover:bg-[hsl(var(--profile-accent)/0.18)] transition-colors";
                      return url ? (
                        <a
                          key={s.key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={className}
                          title={s.label}
                        >
                          {inner}
                        </a>
                      ) : (
                        <span key={s.key} className={className} title={s.label}>
                          {inner}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EditProfileDialog open={editing} onOpenChange={setEditing} />
    </div>
  );
};

export default RubixProfile;

export default RubixProfile;
