'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import * as db from '@/lib/db';
import { getLevelInfo, computeNewStreak } from '@/lib/gamification';
import type { Profile } from '@/lib/db-types';

export type ProfileState = {
  profile: Profile | null;
  loading: boolean;
};

export function useProfile(userId: string | undefined) {
  const [state, setState] = useState<ProfileState>({ profile: null, loading: true });
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!userId) { setState({ profile: null, loading: false }); return; }
    db.getProfile(supabase, userId).then((profile) => {
      setState({ profile, loading: false });
    });
  }, [supabase, userId]);

  const awardXP = useCallback(
    async (amount: number) => {
      if (!userId || !state.profile) return;
      const newXP = state.profile.xp + amount;
      const { level } = getLevelInfo(newXP);
      const streakUpdates = computeNewStreak(state.profile);
      const updates = { xp: newXP, level, ...streakUpdates };
      // Optimistic
      setState((prev) => ({
        ...prev,
        profile: prev.profile ? { ...prev.profile, ...updates } : prev.profile,
      }));
      await db.upsertProfile(supabase, userId, updates);
    },
    [userId, state.profile]
  );

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const profile = await db.getProfile(supabase, userId);
    setState({ profile, loading: false });
  }, [userId]);

  return { ...state, awardXP, refreshProfile };
}
