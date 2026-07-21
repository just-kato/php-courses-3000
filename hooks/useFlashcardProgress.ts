'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import * as db from '@/lib/db';
import { nextBox } from '@/lib/leitner';
import type { FlashcardProgress } from '@/lib/db-types';

export function useFlashcardProgress(userId: string | undefined) {
  const [progressMap, setProgressMap] = useState<Map<string, FlashcardProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    db.getFlashcardProgress(supabase, userId).then((rows) => {
      const map = new Map(rows.map((r) => [r.card_id, r]));
      setProgressMap(map);
      setLoading(false);
    });
  }, [supabase, userId]);

  const recordCardReview = useCallback(
    async (cardId: string, correct: boolean) => {
      if (!userId) return;
      const existing = progressMap.get(cardId);
      const currentBox = existing?.leitner_box ?? 1;
      const box = nextBox(currentBox, correct);
      const now = new Date().toISOString();
      const updates = {
        leitner_box: box,
        last_reviewed: now,
        times_correct: (existing?.times_correct ?? 0) + (correct ? 1 : 0),
        times_wrong: (existing?.times_wrong ?? 0) + (correct ? 0 : 1),
      };
      // Optimistic update
      setProgressMap((prev) => {
        const next = new Map(prev);
        next.set(cardId, { ...(existing ?? { id: '', user_id: userId, card_id: cardId, created_at: now, updated_at: now }), ...updates });
        return next;
      });
      await db.upsertFlashcardProgress(supabase, userId, cardId, updates);
    },
    [userId, progressMap]
  );

  const totalReviewed = progressMap.size;

  return { progressMap, loading, recordCardReview, totalReviewed };
}
