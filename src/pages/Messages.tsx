import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Users } from "lucide-react";
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
import { findActiveDmCall, startDmCall } from "@/lib/calls";
import type { Conversation } from "@/lib/messaging";
import { playSound } from "@/lib/sounds";

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

  const [selected, setSelected] = useState<Selection>({ kind: "dms" });

  // DM state
  const [activeDm, setActiveDm] = useState<DmMeta | null>(null);
  const [dmCallId, setDmCallId] = useState<string | null>(null);
  const [inDmCall, setInDmCall] = useState(false);

  // Community state
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);
  const [communityMembers, setCommunityMembers] = useState<
    Array<CommunityMember & { profile: { username: string; display_name: string | null; avatar_url: string | null } | null }>
  >([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const meId = user?.id ?? "";

  useEffect(() => {
    const conv = params.get("conv");
    const join = params.get("join");
    if (conv) {
      setSelected({ kind: "dms" });
      if (join) {
        setDmCallId(join);
        setInDmCall(true);
      }
      const next = new URLSearchParams(params);
      next.delete("conv");
      next.delete("join");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setInDmCall(false);
    setDmCallId(null);
    setActiveChannel(null);
  }, [selected.kind === "dms" ? "dms" : (selected as { id: string }).id]);

  useEffect(() => {
    if (!activeDm) {
      setDmCallId(null);
      return;
    }
    void findActiveDmCall(activeDm.conv.id).then((s) => setDmCallId(s?.id ?? null));
  }, [activeDm]);

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
      setInDmCall(false);
      return;
    }
    const session = await startDmCall(activeDm.conv.id);
    playSound("call-start", { volume: 0.5 });
    setDmCallId(session.id);
    setInDmCall(true);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
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

      {/* Horizontal community switcher */}
      <ServerRail
        selected={selected}
        onSelect={setSelected}
        onCreate={() => setCreateOpen(true)}
        onJoin={() => setJoinOpen(true)}
        meId={meId}
      />

      {/* Workspace: single sidebar + main pane (+ optional members) */}
      <div className="flex-1 flex min-h-0 p-3 gap-3">
        <aside className="w-64 shrink-0 rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
          {selected.kind === "dms" ? (
            <DmChannelRail
              meId={meId}
              activeId={activeDm?.conv.id ?? null}
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
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card/60">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/30">
                    <AvatarImage src={activeDm.avatar ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {activeDm.conv.is_group ? <Users className="h-3 w-3" /> : activeDm.title.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{activeDm.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {activeDm.conv.is_group ? `${activeDm.members.length} members` : "Direct message"}
                    </p>
                  </div>
                  <CallButton inCall={inDmCall} onToggle={startOrJoinDmCall} />
                </div>
                {inDmCall && dmCallId ? (
                  <CallRoom callId={dmCallId} meId={meId} onLeave={() => setInDmCall(false)} />
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
    </div>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-8 text-center">
    {text}
  </div>
);

export default Messages;
