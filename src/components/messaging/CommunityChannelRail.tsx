import { useEffect, useMemo, useState } from "react";
import { Hash, Loader2, Plus, Settings, Volume2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  createChannel,
  getCommunity,
  listChannels,
  type Community,
  type CommunityChannel,
} from "@/lib/communities";
import { fetchProfiles, type ProfileLite } from "@/lib/messaging";
import { PARTICIPANT_STALE_MS } from "@/lib/calls";
import { CommunitySettingsDialog } from "./CommunitySettingsDialog";
import { toast } from "sonner";

type Props = {
  communityId: string;
  meId: string;
  isAdmin: boolean;
  isOwner: boolean;
  activeChannelId: string | null;
  onSelect: (channel: CommunityChannel) => void;
  onLeftOrDeleted: () => void;
};

type Occupant = { userId: string; profile: ProfileLite | null };

export const CommunityChannelRail = ({
  communityId,
  meId,
  isAdmin,
  isOwner,
  activeChannelId,
  onSelect,
  onLeftOrDeleted,
}: Props) => {
  const [community, setCommunity] = useState<Community | null>(null);
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<"text" | "voice" | null>(null);
  const [newName, setNewName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [occupantsByChannel, setOccupantsByChannel] = useState<Map<string, Occupant[]>>(new Map());

  const refresh = async () => {
    setLoading(true);
    const [c, ch] = await Promise.all([getCommunity(communityId), listChannels(communityId)]);
    setCommunity(c);
    setChannels(ch);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const sub = supabase
      .channel(`crail-${communityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_channels", filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communities" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [communityId]);

  const voiceChannelIds = useMemo(
    () => channels.filter((c) => c.kind === "voice").map((c) => c.id),
    [channels],
  );

  // Poll occupants for every voice channel in this community.
  useEffect(() => {
    if (voiceChannelIds.length === 0) {
      setOccupantsByChannel(new Map());
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data: sessions } = await supabase
        .from("call_sessions")
        .select("id, channel_id")
        .in("channel_id", voiceChannelIds)
        .is("ended_at", null);

      const sessionList = (sessions ?? []) as Array<{ id: string; channel_id: string }>;
      if (sessionList.length === 0) {
        if (!cancelled) setOccupantsByChannel(new Map());
        return;
      }

      const sessionIds = sessionList.map((s) => s.id);
      const { data: parts } = await supabase
        .from("call_participants")
        .select("call_id, user_id, joined_at, last_seen_at, left_at")
        .in("call_id", sessionIds)
        .is("left_at", null);

      const cutoff = Date.now() - PARTICIPANT_STALE_MS;
      const fresh = (parts ?? []).filter((p) => {
        const seen = (p as { last_seen_at?: string | null }).last_seen_at ?? p.joined_at;
        return new Date(seen).getTime() >= cutoff;
      });

      const userIds = Array.from(new Set(fresh.map((p) => p.user_id)));
      const profileMap = await fetchProfiles(userIds);
      if (cancelled) return;

      const callIdToChannel = new Map(sessionList.map((s) => [s.id, s.channel_id]));
      const next = new Map<string, Occupant[]>();
      fresh.forEach((p) => {
        const channelId = callIdToChannel.get(p.call_id);
        if (!channelId) return;
        const arr = next.get(channelId) ?? [];
        // Dedupe by user (a user could theoretically appear twice in races)
        if (!arr.some((o) => o.userId === p.user_id)) {
          arr.push({ userId: p.user_id, profile: profileMap.get(p.user_id) ?? null });
        }
        next.set(channelId, arr);
      });
      setOccupantsByChannel(next);
    };

    void load();
    const intervalId = window.setInterval(load, 5000);
    const sub = supabase
      .channel(`crail-vc-${communityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_sessions" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_participants" },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      void supabase.removeChannel(sub);
    };
  }, [voiceChannelIds, communityId]);

  const submitNew = async () => {
    if (!creating || !newName.trim()) return;
    try {
      const ch = await createChannel(communityId, newName.trim(), creating);
      setNewName("");
      setCreating(null);
      onSelect(ch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const text = channels.filter((c) => c.kind === "text");
  const voice = channels.filter((c) => c.kind === "voice");

  return (
    <>
      <div className="flex flex-col h-full w-full">
        <button
          onClick={() => setSettingsOpen(true)}
          className="px-4 py-3 border-b border-border flex items-center justify-between hover:bg-secondary/30 text-left"
        >
          <span className="text-sm font-bold truncate">{community?.name ?? "…"}</span>
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            <Section
              label="Text channels"
              canAdd={isAdmin}
              onAdd={() => setCreating("text")}
              creating={creating === "text"}
              newName={newName}
              setNewName={setNewName}
              onSubmit={submitNew}
              onCancel={() => {
                setCreating(null);
                setNewName("");
              }}
            >
              {text.map((c) => (
                <ChannelRow
                  key={c.id}
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label={c.name}
                  active={activeChannelId === c.id}
                  onClick={() => onSelect(c)}
                />
              ))}
            </Section>
            <Section
              label="Voice channels"
              canAdd={isAdmin}
              onAdd={() => setCreating("voice")}
              creating={creating === "voice"}
              newName={newName}
              setNewName={setNewName}
              onSubmit={submitNew}
              onCancel={() => {
                setCreating(null);
                setNewName("");
              }}
            >
              {voice.map((c) => {
                const occupants = occupantsByChannel.get(c.id) ?? [];
                return (
                  <div key={c.id}>
                    <ChannelRow
                      icon={<Volume2 className="h-3.5 w-3.5" />}
                      label={c.name}
                      active={activeChannelId === c.id}
                      onClick={() => onSelect(c)}
                      badge={occupants.length > 0 ? occupants.length : undefined}
                    />
                    {occupants.length > 0 && (
                      <ul className="mt-0.5 ml-7 mb-1 space-y-0.5 border-l border-border/60 pl-2">
                        {occupants.map((o) => {
                          const name =
                            o.profile?.display_name ?? o.profile?.username ?? "Unknown";
                          return (
                            <li
                              key={o.userId}
                              className="flex items-center gap-1.5 px-1 py-0.5 rounded-md text-[11px] text-muted-foreground"
                              title={name}
                            >
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={o.profile?.avatar_url ?? undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">
                                {name}
                                {o.userId === meId && (
                                  <span className="ml-1 text-primary">(you)</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </Section>
          </div>
        )}
      </div>
      <CommunitySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        communityId={communityId}
        meId={meId}
        isAdmin={isAdmin}
        isOwner={isOwner}
        onDeleted={onLeftOrDeleted}
        onLeft={onLeftOrDeleted}
      />
    </>
  );
};

const Section = ({
  label,
  canAdd,
  onAdd,
  creating,
  newName,
  setNewName,
  onSubmit,
  onCancel,
  children,
}: {
  label: string;
  canAdd: boolean;
  onAdd: () => void;
  creating: boolean;
  newName: string;
  setNewName: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) => (
  <div className="mb-3">
    <div className="px-3 py-1 flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      {canAdd && (
        <button onClick={onAdd} className="text-muted-foreground hover:text-foreground" title="Add channel">
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
    <div className="space-y-0.5 px-1">{children}</div>
    {creating && (
      <div className="px-2 mt-1">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="channel-name"
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => {
            if (!newName.trim()) onCancel();
          }}
        />
      </div>
    )}
  </div>
);

const ChannelRow = ({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-left transition-colors",
      active
        ? "bg-secondary text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
    )}
  >
    <span className="opacity-70">{icon}</span>
    <span className="truncate flex-1">{label}</span>
    {typeof badge === "number" && (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
        {badge}
      </span>
    )}
  </button>
);
