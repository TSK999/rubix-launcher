import { useEffect, useRef, useState } from "react";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import {
  fetchGameScreenshots,
  fetchGameUserData,
  saveGameUserData,
  type GameScreenshot,
  type GameUserData,
} from "@/lib/game-user-data";
import type { Game } from "@/lib/game-types";

export const useGameUserData = (game: Game | null) => {
  const { user } = useRubixAuth();
  const [data, setData] = useState<GameUserData>({ notes: "", tags: [] });
  const [shots, setShots] = useState<GameScreenshot[]>([]);
  const [loading, setLoading] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastGameId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !game) {
      setData({ notes: "", tags: [] });
      setShots([]);
      lastGameId.current = null;
      return;
    }
    if (lastGameId.current === game.id) return;
    lastGameId.current = game.id;
    setLoading(true);
    Promise.all([
      fetchGameUserData(user.id, game.id),
      fetchGameScreenshots(user.id, game.id),
    ])
      .then(([d, s]) => {
        setData(d);
        setShots(s);
      })
      .finally(() => setLoading(false));
  }, [user, game]);

  const scheduleSave = (next: GameUserData) => {
    if (!user || !game) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveGameUserData(user.id, game, next);
    }, 700);
  };

  const setNotes = (notes: string) => {
    setData((prev) => {
      const next = { ...prev, notes };
      scheduleSave(next);
      return next;
    });
  };

  const setTags = (tags: string[]) => {
    setData((prev) => {
      const next = { ...prev, tags };
      scheduleSave(next);
      return next;
    });
  };

  return { data, setNotes, setTags, shots, setShots, loading };
};
