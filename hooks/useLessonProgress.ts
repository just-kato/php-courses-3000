'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import * as db from '@/lib/db';
import type { LessonProgress } from '@/lib/db-types';

export function useLessonProgress(userId: string | undefined) {
  const [progressMap, setProgressMap] = useState<Map<string, LessonProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    db.getLessonProgress(supabase, userId).then((rows) => {
      const map = new Map(rows.map((r) => [r.lesson_id, r]));
      setProgressMap(map);
      setLoading(false);
    });
  }, [userId]);

  const markRead = useCallback(
    async (lessonId: string) => {
      if (!userId) return;
      const now = new Date().toISOString();
      // Optimistic
      setProgressMap((prev) => {
        const next = new Map(prev);
        const existing = prev.get(lessonId);
        next.set(lessonId, {
          ...(existing ?? { id: '', user_id: userId, lesson_id: lessonId, created_at: now, updated_at: now }),
          read: true,
          read_at: now,
        });
        return next;
      });
      await db.upsertLessonProgress(supabase, userId, lessonId, true);
    },
    [userId]
  );

  const isRead = useCallback(
    (lessonId: string) => progressMap.get(lessonId)?.read === true,
    [progressMap]
  );

  const readCount = [...progressMap.values()].filter((p) => p.read).length;

  return { progressMap, loading, markRead, isRead, readCount };
}
