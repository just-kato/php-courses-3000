export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-rule opacity-50 ${className}`}
      style={{ backgroundColor: 'var(--rule)' }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-md border border-rule bg-card p-5 space-y-3 animate-pulse">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-4 p-5 max-w-lg mx-auto">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
