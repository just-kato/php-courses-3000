'use client';

import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@/lib/gamification';

type Props = {
  achievementIds: string[];
  onDismiss: () => void;
};

export function AchievementToast({ achievementIds, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (achievementIds.length === 0) { setVisible(false); return; }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [achievementIds, onDismiss]);

  const def = ACHIEVEMENTS.find((a) => a.id === achievementIds[0]);
  if (!def) return null;

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 max-w-sm mx-auto z-100 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="flex items-start gap-3 p-4 rounded-md border border-rule bg-card shadow-sm shadow-ink/5 border-l-[3px] border-l-accent">
        <span className="text-2xl leading-none mt-0.5">{def.icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-sans font-semibold tracking-widest uppercase text-accent mb-0.5">
            Achievement Unlocked
          </p>
          <p className="text-sm font-sans font-semibold text-ink">{def.title}</p>
          <p className="text-xs font-sans text-ink-2 leading-relaxed">{def.description}</p>
        </div>
      </div>
    </div>
  );
}
