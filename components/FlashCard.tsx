'use client';

import { useState } from 'react';
import type { UserFlashcard, FlashcardProgress } from '@/lib/db-types';

type Props = {
  card: UserFlashcard;
  progress: FlashcardProgress | undefined;
  onGotIt: () => void;
  onReviewAgain: () => void;
  cardNum: number;
  total: number;
};

export function FlashCard({ card, progress, onGotIt, onReviewAgain, cardNum, total }: Props) {
  const [flipped, setFlipped] = useState(false);

  const handleFlip = () => setFlipped((f) => !f);

  const handleGotIt = () => { setFlipped(false); onGotIt(); };
  const handleReview = () => { setFlipped(false); onReviewAgain(); };

  const box = progress?.leitner_box ?? 1;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Counter + box indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-sans text-ink-2 tabular-nums">{cardNum} of {total}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-sans text-ink-2">Box</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((b) => (
              <div
                key={b}
                className={`w-4 h-0.75 rounded-sm transition-colors duration-150 ${
                  b <= box ? 'bg-accent' : 'bg-rule'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3D flip card */}
      <div className="card-flip-container w-full" style={{ height: 264 }}>
        <div className={`card-flip-inner w-full h-full ${flipped ? 'flipped' : ''}`}>

          {/* Front — question */}
          <div
            className="card-face absolute inset-0 flex flex-col items-center justify-center p-8 rounded-md border border-rule bg-card cursor-pointer select-none"
            onClick={handleFlip}
          >
            <p className="text-[10px] font-sans font-semibold tracking-[0.12em] uppercase text-ink-2 mb-5">
              Question
            </p>
            <p className="font-serif text-center text-ink text-lg leading-relaxed">
              {card.question}
            </p>
            <p className="absolute bottom-4 text-[10px] font-sans tracking-wide text-ink-2 opacity-60">
              Tap to reveal answer
            </p>
          </div>

          {/* Back — answer */}
          <div
            className="card-face card-face-back absolute inset-0 flex flex-col items-center justify-center p-8 rounded-md border border-accent bg-accent-soft cursor-pointer select-none"
            onClick={handleFlip}
          >
            <p className="text-[10px] font-sans font-semibold tracking-[0.12em] uppercase text-accent mb-5">
              Answer
            </p>
            <p className="font-serif text-center text-ink text-lg font-semibold leading-relaxed">
              {card.answer}
            </p>
            <p className="absolute bottom-4 text-[10px] font-sans tracking-wide text-ink-2 opacity-60">
              Tap to flip back
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons — fade in after flip */}
      <div
        className={`flex gap-3 transition-all duration-200 ${
          flipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'
        }`}
      >
        <button
          onClick={handleReview}
          className="flex-1 py-3 rounded-md border border-rule text-ink-2 text-sm font-sans font-medium hover:border-ink hover:text-ink transition-colors duration-150 active:scale-[0.99]"
        >
          Review Again
        </button>
        <button
          onClick={handleGotIt}
          className="flex-1 py-3 rounded-md bg-sage text-card text-sm font-sans font-medium hover:opacity-90 transition-opacity duration-150 active:scale-[0.99]"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
