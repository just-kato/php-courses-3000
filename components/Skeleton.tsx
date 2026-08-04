export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: 'var(--color-n900)', opacity: 0.45 }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div
      className="rounded-lg p-5 space-y-3 animate-pulse"
      style={{ background: 'var(--color-surface)' }}
    >
      <Skeleton className="h-3.5 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-4 px-5 py-6 max-w-lg mx-auto">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
