'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import * as db from '@/lib/db';
import { findNewAchievements, type AchievementCheckContext } from '@/lib/gamification';
import type { DBachievement } from '@/lib/db-types';

export function useAchievements(userId: string | undefined) {
  const [achievements, setAchievements] = useState<DBachievement[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    db.getUserAchievements(supabase, userId).then((rows) => {
      setAchievements(rows);
      setLoading(false);
    });
  }, [supabase, userId]);

  const checkAndAward = useCallback(
    async (ctx: AchievementCheckContext) => {
      if (!userId) return;
      const newIds = findNewAchievements(achievements, ctx);
      if (newIds.length === 0) return;
      // Award all new achievements
      await Promise.all(newIds.map((id) => db.addAchievement(supabase, userId, id)));
      const now = new Date().toISOString();
      const newRows: DBachievement[] = newIds.map((id) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        achievement_id: id,
        unlocked_at: now,
      }));
      setAchievements((prev) => [...prev, ...newRows]);
      setNewlyUnlocked(newIds);
    },
    [userId, achievements]
  );

  const clearNewlyUnlocked = useCallback(() => setNewlyUnlocked([]), []);

  return { achievements, newlyUnlocked, loading, checkAndAward, clearNewlyUnlocked };
}
