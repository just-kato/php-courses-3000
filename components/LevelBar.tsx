import { getLevelInfo } from '@/lib/gamification';

export function LevelBar({ xp }: { xp: number }) {
  const { level, xpInLevel, xpForNextLevel, progress } = getLevelInfo(xp);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-sans font-semibold text-ink tabular-nums">Level {level}</span>
        <span className="text-xs font-sans text-ink-2 tabular-nums">{xp.toLocaleString()} XP</span>
      </div>
      <div className="h-0.75 rounded-sm bg-rule overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="text-xs font-sans text-ink-2 tabular-nums">
        {xpInLevel} / {xpForNextLevel} to next level
      </p>
    </div>
  );
}

export function LevelBadge({ xp }: { xp: number }) {
  const { level } = getLevelInfo(xp);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rule text-xs font-sans font-medium text-ink-2 tabular-nums">
      Lv {level}
    </span>
  );
}
