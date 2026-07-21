'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { HomeSkeleton } from '@/components/Skeleton';
import * as db from '@/lib/db';

export default function ModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/sign-in'); return; }
      const lessons = await db.getUserLessons(supabase, user.id, moduleId);
      if (lessons.length > 0) {
        router.replace(`/learn/${moduleId}/${lessons[0].id}`);
      } else {
        router.replace('/learn');
      }
    });
  }, [supabase, moduleId, router]);

  return <HomeSkeleton />;
}
