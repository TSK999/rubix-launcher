import { useEffect, useState } from "react";
import { Hash, Loader2, Plus, Settings, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
              {voice.map((c) => (
                <ChannelRow
                  key={c.id}
                  icon={<Volume2 className="h-3.5 w-3.5" />}
                  label={c.name}
                  active={activeChannelId === c.id}
                  onClick={() => onSelect(c)}
                />
              ))}
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
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
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
    <span className="truncate">{label}</span>
  </button>
);
