import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Crown, Loader2, LogOut, Search, Shield, Trash2, Upload, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addConversationMembers,
  fetchProfiles,
  leaveConversation,
  listMembers,
  removeConversationMember,
  searchProfiles,
  setConversationMuted,
  setMemberAdmin,
  setMyNickname,
  updateConversation,
  uploadConversationAvatar,
  type ConversationMember,
  type ProfileLite,
} from "@/lib/messaging";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  meId: string;
  initialName: string | null;
  initialAvatar: string | null;
  onUpdated?: () => void;
  onLeft?: () => void;
};

export const GroupSettingsDialog = ({
  open,
  onOpenChange,
  conversationId,
  meId,
  initialName,
  initialAvatar,
  onUpdated,
  onLeft,
}: Props) => {
  const [name, setName] = useState(initialName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialAvatar);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingOverview, setSavingOverview] = useState(false);

  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [adding, setAdding] = useState(false);

  const [nickname, setNickname] = useState("");
  const [muted, setMuted] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const myMembership = members.find((m) => m.user_id === meId);
  const isAdmin = myMembership?.is_admin ?? false;

  const refreshMembers = async () => {
    setLoadingMembers(true);
    try {
      const mems = await listMembers(conversationId);
      setMembers(mems);
      const profMap = await fetchProfiles(mems.map((m) => m.user_id));
      setProfiles(profMap);
      const me = mems.find((m) => m.user_id === meId);
      if (me) {
        setNickname(me.nickname ?? "");
        setMuted(me.muted ?? false);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setAvatarPreview(initialAvatar);
    setAvatarFile(null);
    void refreshMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const r = await searchProfiles(q);
      if (!cancel) {
        const have = new Set(members.map((m) => m.user_id));
        setResults(r.filter((p) => !have.has(p.user_id)));
      }
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, members]);

  const onPickAvatar = (file: File) => {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveOverview = async () => {
    if (!isAdmin) return;
    setSavingOverview(true);
    try {
      let avatarUrl = initialAvatar;
      if (avatarFile) {
        avatarUrl = await uploadConversationAvatar(conversationId, avatarFile);
      }
      await updateConversation(conversationId, {
        name: name.trim() || null,
        avatar_url: avatarUrl,
      });
      toast.success("Group updated");
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingOverview(false);
    }
  };

  const addMember = async (p: ProfileLite) => {
    setAdding(true);
    try {
      await addConversationMembers(conversationId, [p.user_id]);
      setQ("");
      setResults([]);
      await refreshMembers();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add member");
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await removeConversationMember(conversationId, userId);
      await refreshMembers();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove");
    }
  };

  const togglePromote = async (m: ConversationMember) => {
    try {
      await setMemberAdmin(conversationId, m.user_id, !m.is_admin);
      await refreshMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update role");
    }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      await setMyNickname(conversationId, nickname);
      await setConversationMuted(conversationId, muted);
      toast.success("Preferences saved");
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingPrefs(false);
    }
  };

  const leaveGroup = async () => {
    if (!confirm("Leave this group? You'll need to be re-added to rejoin.")) return;
    try {
      await leaveConversation(conversationId);
      toast("Left group");
      onOpenChange(false);
      onLeft?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't leave");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Group settings
          </DialogTitle>
          <DialogDescription>Customize the group, manage members, and tweak your preferences.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="prefs">For me</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => isAdmin && fileRef.current?.click()}
                className="relative group"
                disabled={!isAdmin}
              >
                <Avatar className="h-16 w-16 ring-2 ring-border">
                  <AvatarImage src={avatarPreview ?? undefined} />
                  <AvatarFallback>
                    <Users className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                {isAdmin && (
                  <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition">
                    <Upload className="h-4 w-4 text-white" />
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickAvatar(f);
                  e.target.value = "";
                }}
              />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Group name</p>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Group name"
                  disabled={!isAdmin}
                />
              </div>
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only admins can rename the group or change its icon.</p>
            )}
            <div className="flex justify-end">
              <Button onClick={saveOverview} disabled={!isAdmin || savingOverview}>
                {savingOverview && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Save changes
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-3 pt-4">
            {isAdmin && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Add members</p>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by username"
                    className="pl-7"
                  />
                </div>
                {results.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-md">
                    {results.map((r) => (
                      <button
                        key={r.user_id}
                        onClick={() => addMember(r)}
                        disabled={adding}
                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-secondary text-left disabled:opacity-60"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">{r.username.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs">@{r.username}</span>
                        <UserPlus className="h-3 w-3 ml-auto text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border border-border rounded-md divide-y divide-border">
              {loadingMembers ? (
                <div className="p-4 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                members.map((m) => {
                  const p = profiles.get(m.user_id);
                  const label = m.nickname || p?.display_name || p?.username || "Unknown";
                  return (
                    <div key={m.user_id} className="flex items-center gap-2 px-2 py-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {label.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate flex items-center gap-1.5">
                          {label}
                          {m.is_admin && <Crown className="h-3 w-3 text-amber-500" />}
                        </p>
                        {p && (
                          <p className="text-[10px] text-muted-foreground truncate">@{p.username}</p>
                        )}
                      </div>
                      {isAdmin && m.user_id !== meId && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={m.is_admin ? "Demote" : "Promote to admin"}
                            onClick={() => togglePromote(m)}
                          >
                            <Shield className={m.is_admin ? "h-3.5 w-3.5 text-amber-500" : "h-3.5 w-3.5"} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            title="Remove from group"
                            onClick={() => removeMember(m.user_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <Button variant="destructive" className="w-full" onClick={leaveGroup}>
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Leave group
            </Button>
          </TabsContent>

          <TabsContent value="prefs" className="space-y-4 pt-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">My nickname in this group</p>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Leave empty to use your profile name"
                maxLength={32}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                {muted ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4 text-primary" />}
                <div>
                  <p className="text-sm font-medium">Mute notifications</p>
                  <p className="text-xs text-muted-foreground">Silence message sounds for this group.</p>
                </div>
              </div>
              <Switch checked={muted} onCheckedChange={setMuted} />
            </div>
            <div className="flex justify-end">
              <Button onClick={savePrefs} disabled={savingPrefs}>
                {savingPrefs && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Save
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
