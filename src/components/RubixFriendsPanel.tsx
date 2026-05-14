import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronDown, Loader2, RefreshCw, Users, MessageSquare, Check, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  fetchMyRubixFriends,
  acceptFriendRequest,
  removeFriendship,
  type RubixFriendEntry,
} from "@/lib/rubix-profile";
import { getOrCreateDm } from "@/lib/messaging";
import { useRichPresenceMap, type RichPresence, type RichStatus } from "@/lib/presence";
import { PresenceHoverCard } from "@/components/presence/PresenceHoverCard";
import { PresenceLine } from "@/components/presence/PresenceLine";
import { StatusDot } from "@/components/presence/StatusDot";
import { AmbientActivityFeed } from "@/components/presence/AmbientActivityFeed";
import rubixIcon from "@/assets/rubix-friends-icon.png";

const GROUP_LABELS: Record<"active" | "away" | "offline", string> = {
  active: "Online",
  away: "Away",
  offline: "Offline",
};

type Props = {
  userId: string | null;
};

const groupOf = (rich: RichPresence): "active" | "away" | "offline" => {
  if (rich.baseStatus === "offline") return "offline";
  if (rich.baseStatus === "away" || rich.manualStatus === "idle" || rich.status === "idle")
    return "away";
  return "active";
};

export const RubixFriendsPanel = ({ userId }: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<RubixFriendEntry[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setEntries(await fetchMyRubixFriends(userId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`rubix-friends-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rubix_friendships" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const handleAccept = async (rowId: string) => {
    try {
      await acceptFriendRequest(rowId);
      toast.success("Friend request accepted");
      void load();
    } catch {
      toast.error("Failed to accept");
    }
  };

  const handleRemove = async (rowId: string, label: string) => {
    try {
      await removeFriendship(rowId);
      toast(label);
      void load();
    } catch {
      toast.error("Failed");
    }
  };

  const handleMessage = async (otherId: string) => {
    try {
      const id = await getOrCreateDm(otherId);
      navigate(`/messages?c=${id}`);
    } catch {
      toast.error("Could not open DM");
    }
  };

  const friends = entries.filter((e) => e.kind === "friends");
  const incoming = entries.filter((e) => e.kind === "incoming");
  const outgoing = entries.filter((e) => e.kind === "outgoing");
  const friendIds = useMemo(() => friends.map((e) => e.profile.user_id), [friends]);
  const presence = useRichPresenceMap(friendIds);

  const profilesMap = useMemo(() => {
    const m: Record<string, { user_id: string; username: string; display_name: string | null }> = {};
    for (const e of friends)
      m[e.profile.user_id] = {
        user_id: e.profile.user_id,
        username: e.profile.username,
        display_name: e.profile.display_name ?? null,
      };
    return m;
  }, [friends]);

  const friendGroups = (["active", "away", "offline"] as const).map((g) => ({
    group: g,
    list: friends.filter((e) => {
      const rich = presence.get(e.profile.user_id);
      if (!rich) return g === "offline";
      return groupOf(rich) === g;
    }),
  }));

  if (!userId) return null;

  return (
    <div className="border-t border-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between px-4 py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors">
            <img src={rubixIcon} alt="" className="h-3.5 w-3.5" />
            <span>Rubix Friends</span>
            {friends.length > 0 && (
              <span className="text-muted-foreground/70">({friends.length})</span>
            )}
            {incoming.length > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                {incoming.length}
              </span>
            )}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            />
          </CollapsibleTrigger>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
        </div>

        <CollapsibleContent>
          <div className="px-2 pb-2 max-h-72 overflow-y-auto rubix-scroll-dark space-y-3">
            {entries.length === 0 && !loading && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Users className="h-5 w-5 opacity-50" />
                <span>No friends yet. Search users to add some.</span>
              </div>
            )}

            {incoming.length > 0 && (
              <Section title="Pending requests">
                {incoming.map((e) => (
                  <div key={e.row.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40">
                    <ProfileAvatar entry={e} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {e.profile.display_name ?? e.profile.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        @{e.profile.username}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAccept(e.row.id)}
                      className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      title="Accept"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(e.row.id, "Declined")}
                      className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground"
                      title="Decline"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </Section>
            )}

            {friendGroups.map(({ group, list }) => list.length > 0 && (
              <Section key={group} title={GROUP_LABELS[group]} count={list.length}>
                {list.map((e) => {
                  const rich = presence.get(e.profile.user_id);
                  return (
                    <FriendRow
                      key={e.row.id}
                      entry={e}
                      status={rich?.status ?? "offline"}
                      speaking={!!rich?.vc?.speaking}
                      onMessage={() => handleMessage(e.profile.user_id)}
                      onRemove={() => handleRemove(e.row.id, "Friend removed")}
                    />
                  );
                })}
              </Section>
            ))}

            {outgoing.length > 0 && (
              <Section title="Sent">
                {outgoing.map((e) => (
                  <div key={e.row.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40">
                    <ProfileAvatar entry={e} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {e.profile.display_name ?? e.profile.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Pending…
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemove(e.row.id, "Cancelled")}
                      className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </Section>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {friends.length > 0 && (
        <AmbientActivityFeed friendIds={friendIds} profiles={profilesMap} />
      )}
    </div>
  );
};

const Section = ({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) => (
  <div>
    <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1.5">
      {title}
      {typeof count === "number" && <span>· {count}</span>}
    </p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const ProfileAvatar = ({ entry }: { entry: RubixFriendEntry }) => (
  <Link
    to={`/u/${entry.profile.username}`}
    className="shrink-0 h-7 w-7 rounded-full overflow-hidden bg-secondary grid place-items-center"
    title={`View @${entry.profile.username}`}
  >
    {entry.profile.avatar_url ? (
      <img
        src={entry.profile.avatar_url}
        alt=""
        className="h-full w-full object-cover"
      />
    ) : (
      <span className="text-[10px] font-bold text-muted-foreground">
        {(entry.profile.display_name ?? entry.profile.username).charAt(0).toUpperCase()}
      </span>
    )}
  </Link>
);

const FriendRow = ({
  entry,
  status,
  speaking,
  onMessage,
  onRemove,
}: {
  entry: RubixFriendEntry;
  status: RichStatus;
  speaking: boolean;
  onMessage: () => void;
  onRemove: () => void;
}) => {
  const profile = {
    user_id: entry.profile.user_id,
    username: entry.profile.username,
    display_name: entry.profile.display_name ?? null,
    avatar_url: entry.profile.avatar_url ?? null,
  };
  return (
    <PresenceHoverCard profile={profile}>
      <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors">
        <div className="relative shrink-0">
          <div className={cn(speaking && "presence-speaking-ring")}>
            <ProfileAvatar entry={entry} />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5">
            <StatusDot status={status} size="sm" ring />
          </span>
        </div>
        <Link
          to={`/u/${entry.profile.username}`}
          className="min-w-0 flex-1 hover:text-primary transition-colors"
        >
          <p className="text-xs font-medium truncate">
            {entry.profile.display_name ?? entry.profile.username}
          </p>
          <PresenceLine userId={entry.profile.user_id} compact />
        </Link>
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            onMessage();
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
          title="Message"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-destructive transition-opacity"
          title="Remove friend"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </PresenceHoverCard>
  );
};
