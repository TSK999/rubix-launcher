import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STORAGE_KEY, getGameSource, type Game } from "@/lib/game-types";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type PassportStamp = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon_emoji: string;
  rarity: Rarity;
  criteria_type:
    | "first_launch"
    | "playtime_hours"
    | "launches_count"
    | "games_owned"
    | "friends_added"
    | "signup"
    | "manual"
    | "source_games";
  criteria_value: number;
  game_key: string | null;
  sort_order: number;
};

export type EarnedStamp = {
  id: string;
  stamp_id: string;
  game_key: string | null;
  earned_at: string;
};

export type GamePlaytime = {
  game_key: string;
  title_snapshot: string | null;
  total_seconds: number;
  launch_count: number;
  longest_session_seconds: number;
  first_launched_at: string;
  last_launched_at: string;
};

export const RARITY_RING: Record<Rarity, string> = {
  common: "ring-muted-foreground/40",
  rare: "ring-sky-400/70",
  epic: "ring-fuchsia-400/80",
  legendary: "ring-amber-400 shadow-[0_0_24px_hsl(45_100%_60%/0.55)]",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-muted-foreground",
  rare: "text-sky-300",
  epic: "text-fuchsia-300",
  legendary: "text-amber-300",
};

export const fetchCatalog = async (): Promise<PassportStamp[]> => {
  const { data } = await supabase
    .from("passport_stamps")
    .select("*")
    .order("sort_order");
  return (data ?? []) as PassportStamp[];
};

export const fetchEarned = async (userId: string): Promise<EarnedStamp[]> => {
  const { data } = await supabase
    .from("user_passport_stamps")
    .select("id, stamp_id, game_key, earned_at")
    .eq("user_id", userId);
  return (data ?? []) as EarnedStamp[];
};

export const fetchPlaytime = async (userId: string): Promise<GamePlaytime[]> => {
  const { data } = await supabase
    .from("user_game_playtime")
    .select(
      "game_key, title_snapshot, total_seconds, launch_count, longest_session_seconds, first_launched_at, last_launched_at",
    )
    .eq("user_id", userId);
  return (data ?? []) as GamePlaytime[];
};

const SESSION_KEY = "rubix:passport-session";
type LocalSession = {
  gameKey: string;
  startedAt: number;
  lastFlushAt: number;
} | null;

const readSession = (): LocalSession => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
};

const writeSession = (s: LocalSession) => {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
};

export const PLAYTIME_UPDATED_EVENT = "rubix:playtime-updated";
const emitPlaytimeUpdated = () => {
  try {
    window.dispatchEvent(new CustomEvent(PLAYTIME_UPDATED_EVENT));
  } catch {
    /* SSR-safe */
  }
};

const showStampToast = (s: PassportStamp) => {
  toast.success(`Stamp earned — ${s.name}`, {
    description: `${s.icon_emoji}  ${s.description}`,
    duration: 6000,
  });
};

const awardStamps = async (
  userId: string,
  stamps: PassportStamp[],
  gameKey: string | null,
) => {
  if (stamps.length === 0) return;
  for (const s of stamps) {
    const { data, error } = await supabase.rpc("claim_passport_stamp", {
      _stamp_id: s.id,
      _game_key: s.game_key ?? gameKey ?? null,
    });
    if (!error && data === true) showStampToast(s);
  }
};

type EvalContext = {
  userId: string;
  gameKey?: string | null;
  ownedGamesCount?: number;
  friendsCount?: number;
};

const getEarnedCodes = async (userId: string): Promise<Set<string>> => {
  const { data } = await supabase
    .from("user_passport_stamps")
    .select("game_key, stamp:passport_stamps(code)")
    .eq("user_id", userId);
  const set = new Set<string>();
  (data ?? []).forEach((r: any) => {
    const code = r.stamp?.code;
    if (!code) return;
    set.add(`${code}|${r.game_key ?? ""}`);
  });
  return set;
};

export type LauncherSourceCounts = Record<string, number> & { total: number };

export const readLauncherLibrary = (): {
  total: number;
  bySource: Record<string, number>;
  sourcesPresent: Set<string>;
} => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: Game[] = raw ? JSON.parse(raw) : [];
    const bySource: Record<string, number> = {};
    list.forEach((g) => {
      const src = getGameSource(g);
      bySource[src] = (bySource[src] ?? 0) + 1;
    });
    return {
      total: list.length,
      bySource,
      sourcesPresent: new Set(Object.keys(bySource)),
    };
  } catch {
    return { total: 0, bySource: {}, sourcesPresent: new Set() };
  }
};

export const evaluateStamps = async (ctx: EvalContext) => {
  const { userId, gameKey } = ctx;
  const [catalog, earnedKeys, playtimes] = await Promise.all([
    fetchCatalog(),
    getEarnedCodes(userId),
    fetchPlaytime(userId),
  ]);

  const launcher = readLauncherLibrary();

  // Total owned = launcher library size (Steam + Epic + EA + Xbox + Riot + other)
  // plus any RUBIX store orders. This way every imported game counts.
  let ownedCount = ctx.ownedGamesCount;
  if (ownedCount === undefined) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");
    ownedCount = (count ?? 0) + launcher.total;
  }

  let friendsCount = ctx.friendsCount;
  if (friendsCount === undefined) {
    const { count } = await supabase
      .from("rubix_friendships")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted");
    friendsCount = count ?? 0;
  }

  const playMap = new Map(playtimes.map((p) => [p.game_key, p]));
  const winners: PassportStamp[] = [];

  // Distinct non-"other" launcher sources connected
  const launcherSources = new Set(
    Object.keys(launcher.bySource).filter((s) => s !== "other"),
  );

  for (const s of catalog) {
    const isPerGameCriterion =
      s.criteria_type === "first_launch" ||
      s.criteria_type === "playtime_hours" ||
      s.criteria_type === "launches_count";

    // For source_games stamps, game_key holds the source name, not a game id
    const isSourceCriterion = s.criteria_type === "source_games";

    const effectiveKey = isSourceCriterion
      ? s.game_key
      : (s.game_key ?? gameKey ?? null);

    if (isPerGameCriterion && !effectiveKey) continue;
    if (isSourceCriterion && !s.game_key) continue;

    const lookupKey = `${s.code}|${effectiveKey ?? ""}`;
    if (earnedKeys.has(lookupKey)) continue;

    let won = false;
    switch (s.criteria_type) {
      case "signup":
        won = true;
        break;
      case "first_launch":
        won = !!(effectiveKey && playMap.get(effectiveKey));
        break;
      case "playtime_hours": {
        const p = effectiveKey ? playMap.get(effectiveKey) : null;
        won = !!p && p.total_seconds >= s.criteria_value * 3600;
        break;
      }
      case "launches_count": {
        const p = effectiveKey ? playMap.get(effectiveKey) : null;
        won = !!p && p.launch_count >= s.criteria_value;
        break;
      }
      case "games_owned":
        won = ownedCount >= s.criteria_value;
        break;
      case "friends_added":
        won = friendsCount >= s.criteria_value;
        break;
      case "source_games": {
        const src = s.game_key ?? "";
        won = (launcher.bySource[src] ?? 0) >= s.criteria_value;
        break;
      }
      case "manual":
        // Cross-platform auto-awards based on distinct launchers
        if (s.code === "cross_platform") {
          won = launcherSources.size >= s.criteria_value;
        } else if (s.code === "one_launcher") {
          // Requires all 5 supported launchers
          const required = ["steam", "epic", "ea", "xbox", "riot"];
          won = required.every((r) => launcherSources.has(r));
        }
        break;
    }

    if (won) winners.push({ ...s, game_key: effectiveKey });
  }

  await awardStamps(userId, winners, gameKey ?? null);
};


const accumulatePlaytime = async (
  userId: string,
  gameKey: string,
  seconds: number,
  sessionSeconds: number,
) => {
  if (seconds <= 0) return;
  const { data: existing } = await supabase
    .from("user_game_playtime")
    .select("id, total_seconds, longest_session_seconds")
    .eq("user_id", userId)
    .eq("game_key", gameKey)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("user_game_playtime")
      .update({
        total_seconds: (existing.total_seconds ?? 0) + seconds,
        longest_session_seconds: Math.max(
          existing.longest_session_seconds ?? 0,
          sessionSeconds,
        ),
      })
      .eq("id", existing.id);
    emitPlaytimeUpdated();
  }
  await evaluateStamps({ userId, gameKey });
};

/** Flush elapsed time since the last flush of the current session. */
export const flushCurrentSession = async (userId: string) => {
  const s = readSession();
  if (!s) return;
  const now = Date.now();
  const delta = Math.min(
    Math.max(0, Math.floor((now - s.lastFlushAt) / 1000)),
    6 * 3600,
  );
  const sessionTotal = Math.min(
    Math.max(0, Math.floor((now - s.startedAt) / 1000)),
    12 * 3600,
  );
  if (delta < 30) return;
  await accumulatePlaytime(userId, s.gameKey, delta, sessionTotal);
  writeSession({ ...s, lastFlushAt: now });
};

/** Explicitly end the current session, flushing remaining time. */
export const endCurrentSession = async (userId: string) => {
  const s = readSession();
  if (!s) return;
  await flushCurrentSession(userId);
  writeSession(null);
};

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatUserId: string | null = null;

/** Start a heartbeat that flushes the active session every minute. */
export const startPlaytimeHeartbeat = (userId: string) => {
  heartbeatUserId = userId;
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (heartbeatUserId) void flushCurrentSession(heartbeatUserId);
  }, 60_000);
  const onUnload = () => {
    if (heartbeatUserId) void flushCurrentSession(heartbeatUserId);
  };
  window.addEventListener("beforeunload", onUnload);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && heartbeatUserId) {
      void flushCurrentSession(heartbeatUserId);
    }
  });
};

export const recordGameLaunch = async (userId: string, g: Game) => {
  // Flush any prior session before starting a new one
  await flushCurrentSession(userId);
  const prior = readSession();
  if (prior && prior.gameKey !== g.id) {
    writeSession(null);
  }

  const now = Date.now();
  writeSession({ gameKey: g.id, startedAt: now, lastFlushAt: now });

  const { data: existing } = await supabase
    .from("user_game_playtime")
    .select("id, launch_count")
    .eq("user_id", userId)
    .eq("game_key", g.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_game_playtime")
      .update({
        launch_count: (existing.launch_count ?? 0) + 1,
        last_launched_at: new Date().toISOString(),
        title_snapshot: g.title,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_game_playtime").insert({
      user_id: userId,
      game_key: g.id,
      title_snapshot: g.title,
      launch_count: 1,
    });
  }

  emitPlaytimeUpdated();
  startPlaytimeHeartbeat(userId);
  void evaluateStamps({ userId, gameKey: g.id });
};

export const sweepStampsOnLogin = async (userId: string) => {
  startPlaytimeHeartbeat(userId);
  void flushCurrentSession(userId);
  void evaluateStamps({ userId });
};
