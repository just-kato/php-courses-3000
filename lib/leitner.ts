import type { FlashcardProgress } from './db-types';

// Days before a card is due again per box (index = box number 1-5)
const BOX_INTERVALS = [0, 0, 1, 3, 7, 14];

export function isDue(progress: FlashcardProgress | undefined): boolean {
  if (!progress || !progress.last_reviewed) return true; // never reviewed
  const box = progress.leitner_box;
  const interval = BOX_INTERVALS[box] ?? 0;
  if (interval === 0) return true; // box 1 always due
  const nextReview = new Date(progress.last_reviewed);
  nextReview.setDate(nextReview.getDate() + interval);
  return nextReview <= new Date();
}

export function nextBox(currentBox: number, correct: boolean): number {
  if (!correct) return 1;
  return Math.min(currentBox + 1, 5);
}

export function daysUntilDue(progress: FlashcardProgress): number {
  if (!progress.last_reviewed) return 0;
  const box = progress.leitner_box;
  const interval = BOX_INTERVALS[box] ?? 0;
  if (interval === 0) return 0;
  const nextReview = new Date(progress.last_reviewed);
  nextReview.setDate(nextReview.getDate() + interval);
  const diff = nextReview.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function filterDueCards<T extends { id: string }>(
  cards: T[],
  progressMap: Map<string, FlashcardProgress>
): T[] {
  return cards.filter((c) => isDue(progressMap.get(c.id)));
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
