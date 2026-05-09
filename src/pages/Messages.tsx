import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Settings as SettingsIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupSettingsDialog } from "@/components/messaging/GroupSettingsDialog";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ServerRail } from "@/components/messaging/ServerRail";
import { DmChannelRail } from "@/components/messaging/DmChannelRail";
import { CommunityChannelRail } from "@/components/messaging/CommunityChannelRail";
import { ConversationView } from "@/components/messaging/ConversationView";
import { CommunityChannelView } from "@/components/messaging/CommunityChannelView";
import { CallRoom } from "@/components/messaging/CallRoom";
import { CallButton } from "@/components/messaging/CallButton";
import { CreateCommunityDialog } from "@/components/messaging/CreateCommunityDialog";
import { JoinCommunityDialog } from "@/components/messaging/JoinCommunityDialog";
import {
  listCommunityMembers,
  type CommunityChannel,
  type CommunityMember,
} from "@/lib/communities";
import { callController, useActiveCall } from "@/lib/call-controller";
import type { Conversation } from "@/lib/messaging";
import { playSound } from "@/lib/sounds";
import { toast } from "sonner";
import { usePresenceStatus } from "@/lib/presence";

const STATUS_META: Record<
  "online" | "away" | "offline",
  { label: string; dot: string }
> = {
  online: { label: "Active now", dot: "bg-emerald-500" },
  away: { label: "Away", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-muted-foreground/60" },
};

const DmPeerStatus = ({ peerId }: { peerId: string | null }) => {
  const status = usePresenceStatus(peerId);
  const meta = STATUS_META[status];
  return (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </>
  );
};

const DmPeerDot = ({ peerId }: { peerId: string | null }) => {
  const status = usePresenceStatus(peerId);
  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_META[status].dot}`}
    />
  );
};

type DmMeta = {
  conv: Conversation;
  members: string[];
  title: string;
  avatar: string | null;
};

type Selection = { kind: "dms" } | { kind: "community"; id: string };

const Messages = () => {
  const { user, profile, loading } = useRubixAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeCall = useActiveCall();

  const [selected, setSelected] = useState<Selection>({ kind: "dms" });
  const [activeDm, setActiveDm] = useState<DmMeta | null>(null);
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);
  const [communityMembers, setCommunityMembers] = useState<
    Array<CommunityMember & { profile: { username: string; display_name: string | null; avatar_url: string | null } | null }>
  >([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const meId = user?.id ?? "";

  const inDmCall = useMemo(
    () =>
      activeCall.context?.kind === "dm" &&
      activeDm != null &&
      activeCall.context.conversationId === activeDm.conv.id,
    [activeCall.context, activeDm],
  );

  // Handle deep link from incoming-call toast: /messages?conv=...&join=...
  useEffect(() => {
    const conv = params.get("conv");
    const join = params.get("join");
    if (!conv) return;

    setSelected({ kind: "dms" });

    if (join && activeDm?.conv.id === conv && activeCall.status === "idle") {
      void callController
        .start({ kind: "dm", conversationId: conv, title: activeDm.title }, join)
        .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't join call"));
    }

    if (params.get("conv") || params.get("join")) {
      const next = new URLSearchParams(params);
      next.delete("conv");
      next.delete("join");
      setParams(next, { replace: true });
    }
  }, [params, setParams, activeDm, activeCall.status]);

  useEffect(() => {
    if (selected.kind !== "community") {
      setCommunityMembers([]);
      return;
    }
    void listCommunityMembers(selected.id).then(setCommunityMembers);
  }, [selected]);

  const myMembership = useMemo(
    () => communityMembers.find((m) => m.user_id === meId) ?? null,
    [communityMembers, meId],
  );
  const isAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isOwner = myMembership?.role === "owner";

  if (loading) {
    return (
      <div className="h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return null;

  const startOrJoinDmCall = async () => {
    if (!activeDm) return;
    if (inDmCall) {
      await callController.leave();
      return;
    }
    if (activeCall.status !== "idle") {
      toast.error("You're already in another call. Leave it first.");
      return;
    }
    try {
      await callController.start({
        kind: "dm",
        conversationId: activeDm.conv.id,
        title: activeDm.title,
      });
      playSound("call-start", { volume: 0.5 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start call");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="h-12 border-b border-border bg-card/40 backdrop-blur-sm flex items-center px-3 gap-3 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>
        <div className="h-5 w-px bg-border" />
        <h1 className="text-sm font-bold tracking-tight">
          Rubix <span className="text-primary">Messaging</span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {profile && (
            <Link to={`/u/${profile.username}`} className="flex items-center gap-2 hover:opacity-80">
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {profile.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">@{profile.username}</span>
            </Link>
          )}
        </div>
      </header>

      <ServerRail
        selected={selected}
        onSelect={setSelected}
        onCreate={() => setCreateOpen(true)}
        onJoin={() => setJoinOpen(true)}
        meId={meId}
      />

      <div className="flex-1 flex min-h-0 p-3 gap-3">
        <aside className="w-64 shrink-0 rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
          {selected.kind === "dms" ? (
            <DmChannelRail
              meId={meId}
              activeId={activeDm?.conv.id ?? null}
              preferredId={params.get("conv")}
              onSelect={(id, meta) => setActiveDm(meta)}
            />
          ) : (
            <CommunityChannelRail
              communityId={selected.id}
              meId={meId}
              isAdmin={isAdmin}
              isOwner={isOwner}
              activeChannelId={activeChannel?.id ?? null}
              onSelect={setActiveChannel}
              onLeftOrDeleted={() => {
                setSelected({ kind: "dms" });
                setActiveChannel(null);
              }}
            />
          )}
        </aside>

        <main className="flex-1 rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col min-w-0">
          {selected.kind === "dms" ? (
            activeDm ? (
              <>
                <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-3 bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-sm">
                  <div className="relative">
                    <Avatar className="h-9 w-9 ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
                      <AvatarImage src={activeDm.avatar ?? undefined} />
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                        {activeDm.conv.is_group ? <Users className="h-3.5 w-3.5" /> : activeDm.title.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {!activeDm.conv.is_group && (
                      <DmPeerDot
                        peerId={activeDm.members.find((m) => m !== meId) ?? null}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate leading-tight">{activeDm.title}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      {activeDm.conv.is_group ? (
                        <>
                          <Users className="h-2.5 w-2.5" />
                          {activeDm.members.length} members
                        </>
                      ) : (
                        <DmPeerStatus
                          peerId={activeDm.members.find((m) => m !== meId) ?? null}
                        />
                      )}
                    </p>
                  </div>
                  {activeDm.conv.is_group && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Group settings"
                      onClick={() => setGroupSettingsOpen(true)}
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </Button>
                  )}
                  <CallButton inCall={inDmCall} onToggle={startOrJoinDmCall} />
                </div>
                {inDmCall ? (
                  <CallRoom
                    context={{ kind: "dm", conversationId: activeDm.conv.id, title: activeDm.title }}
                    meId={meId}
                  />
                ) : (
                  <ConversationView conversationId={activeDm.conv.id} meId={meId} />
                )}
              </>
            ) : (
              <EmptyState text="Pick a chat from your inbox — or start a new one." />
            )
          ) : activeChannel ? (
            <CommunityChannelView channel={activeChannel} meId={meId} />
          ) : (
            <EmptyState text="Pick a channel to dive in." />
          )}
        </main>

        {selected.kind === "community" && (
          <aside className="hidden lg:flex w-56 shrink-0 rounded-2xl border border-border bg-card/40 flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Members — {communityMembers.length}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-1 space-y-0.5">
              {communityMembers.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-secondary/40"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px]">
                      {(m.profile?.display_name ?? m.profile?.username ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">
                      {m.profile?.display_name ?? m.profile?.username ?? "Unknown"}
                    </p>
                    {m.role !== "member" && (
                      <p className="text-[9px] uppercase tracking-wider text-primary">{m.role}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <CreateCommunityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => setSelected({ kind: "community", id })}
      />
      <JoinCommunityDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={(id) => setSelected({ kind: "community", id })}
      />
      {activeDm?.conv.is_group && (
        <GroupSettingsDialog
          key={activeDm.conv.id + ":" + refreshTick}
          open={groupSettingsOpen}
          onOpenChange={setGroupSettingsOpen}
          conversationId={activeDm.conv.id}
          meId={meId}
          initialName={activeDm.conv.name}
          initialAvatar={activeDm.avatar}
          onUpdated={() => setRefreshTick((t) => t + 1)}
          onLeft={() => {
            setActiveDm(null);
            setRefreshTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-8 text-center">
    {text}
  </div>
);

export default Messages;
