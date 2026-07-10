import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Menu, Settings as SettingsIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GroupSettingsDialog } from "@/components/messaging/GroupSettingsDialog";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { ServerRail } from "@/components/messaging/ServerRail";
import { DmChannelRail } from "@/components/messaging/DmChannelRail";
import { CommunityChannelRail } from "@/components/messaging/CommunityChannelRail";
import { ConversationView } from "@/components/messaging/ConversationView";
import { CommunityChannelView } from "@/components/messaging/CommunityChannelView";
import { CallRoom } from "@/components/messaging/CallRoom";
import { CallButton } from "@/components/messaging/CallButton";
import { CreateCommunityDialog } from "@/components/messaging/CreateCommunityDialog";
import { JoinCommunityDialog } from "@/components/messaging/JoinCommunityDialog";
import { type CommunityChannel } from "@/lib/communities";
import { callController, useActiveCall } from "@/lib/call-controller";
import type { Conversation } from "@/lib/messaging";
import { playSound } from "@/lib/sounds";
import { toast } from "sonner";
import { usePresenceStatus } from "@/lib/presence";

const STATUS_META: Record<"online" | "away" | "offline", { label: string; dot: string }> = {
  online: { label: "Active now", dot: "bg-emerald-500" },
  away: { label: "Away", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-muted-foreground/60" },
};

const DmPeerDot = ({ peerId }: { peerId: string | null }) => {
  const status = usePresenceStatus(peerId);
  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_META[status].dot}`}
    />
  );
};

type DmMeta = { conv: Conversation; members: string[]; title: string; avatar: string | null };
type Selection = { kind: "dms" } | { kind: "community"; id: string };

const MessagesMobile = () => {
  const { user, loading } = useRubixAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeCall = useActiveCall();

  const [selected, setSelected] = useState<Selection>({ kind: "dms" });
  const [activeDm, setActiveDm] = useState<DmMeta | null>(null);
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Deep link support
  useEffect(() => {
    const conv = params.get("conv");
    if (!conv) return;
    setSelected({ kind: "dms" });
    if (params.get("conv") || params.get("join")) {
      const next = new URLSearchParams(params);
      next.delete("conv");
      next.delete("join");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  // Close drawer whenever a chat gets picked
  useEffect(() => {
    if (activeDm || activeChannel) setDrawerOpen(false);
  }, [activeDm, activeChannel]);

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
    if (inDmCall) return void callController.leave();
    if (activeCall.status !== "idle") {
      toast.error("You're already in another call. Leave it first.");
      return;
    }
    try {
      await callController.start({ kind: "dm", conversationId: activeDm.conv.id, title: activeDm.title });
      playSound("call-start", { volume: 0.5 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start call");
    }
  };

  const headerTitle =
    selected.kind === "dms"
      ? activeDm?.title ?? "Messages"
      : activeChannel?.name ?? "Channel";

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card/60 backdrop-blur-md flex items-center px-2 gap-2 shrink-0">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-[88vw] max-w-[360px] flex flex-col bg-background gap-0"
          >
            {/* Horizontal server switcher on top */}
            <div className="shrink-0">
              <ServerRail
                selected={selected}
                onSelect={(s) => {
                  setSelected(s);
                  setActiveDm(null);
                  setActiveChannel(null);
                }}
                onCreate={() => setCreateOpen(true)}
                onJoin={() => setJoinOpen(true)}
                meId={meId}
              />
            </div>
            {/* Channel list */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {selected.kind === "dms" ? (
                <DmChannelRail
                  meId={meId}
                  activeId={activeDm?.conv.id ?? null}
                  preferredId={params.get("conv")}
                  onSelect={(_id, meta) => {
                    setActiveDm(meta);
                    setDrawerOpen(false);
                  }}
                />
              ) : (
                <CommunityChannelRail
                  communityId={selected.id}
                  meId={meId}
                  isAdmin={false}
                  isOwner={false}
                  activeChannelId={activeChannel?.id ?? null}
                  onSelect={(c) => {
                    setActiveChannel(c);
                    setDrawerOpen(false);
                  }}
                  onLeftOrDeleted={() => {
                    setSelected({ kind: "dms" });
                    setActiveChannel(null);
                  }}
                />
              )}
            </div>
          </SheetContent>

        </Sheet>

        {(activeDm || activeChannel) ? (
          <button
            onClick={() => {
              if (selected.kind === "dms") setActiveDm(null);
              else setActiveChannel(null);
            }}
            className="p-2 -ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Back to list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link to="/" className="p-2 -ml-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}

        <div className="flex-1 min-w-0 flex items-center gap-2">
          {selected.kind === "dms" && activeDm ? (
            <>
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={activeDm.avatar ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                    {activeDm.conv.is_group ? <Users className="h-3.5 w-3.5" /> : activeDm.title.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!activeDm.conv.is_group && (
                  <DmPeerDot peerId={activeDm.members.find((m) => m !== meId) ?? null} />
                )}
              </div>
              <p className="text-sm font-semibold truncate">{headerTitle}</p>
            </>
          ) : (
            <p className="text-sm font-bold tracking-tight truncate">
              {headerTitle}
            </p>
          )}
        </div>

        {selected.kind === "dms" && activeDm && (
          <>
            {activeDm.conv.is_group && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setGroupSettingsOpen(true)}>
                <SettingsIcon className="h-4 w-4" />
              </Button>
            )}
            <CallButton inCall={inDmCall} onToggle={startOrJoinDmCall} />
          </>
        )}
      </header>

      {/* Main area */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {selected.kind === "dms" ? (
          activeDm ? (
            inDmCall ? (
              <CallRoom
                context={{ kind: "dm", conversationId: activeDm.conv.id, title: activeDm.title }}
                meId={meId}
              />
            ) : (
              <ConversationView conversationId={activeDm.conv.id} meId={meId} />
            )
          ) : (
            <EmptyMobileState
              text="Pick a chat from your inbox."
              onOpen={() => setDrawerOpen(true)}
            />
          )
        ) : activeChannel ? (
          <CommunityChannelView channel={activeChannel} meId={meId} />
        ) : (
          <EmptyMobileState
            text="Pick a channel to dive in."
            onOpen={() => setDrawerOpen(true)}
          />
        )}
      </main>

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

const EmptyMobileState = ({ text, onOpen }: { text: string; onOpen: () => void }) => (
  <div className="flex-1 grid place-items-center px-8 text-center">
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button onClick={onOpen} size="sm" className="rounded-full">
        <Menu className="h-4 w-4 mr-2" />
        Open channels
      </Button>
    </div>
  </div>
);

export default MessagesMobile;
