/** Grey shimmering placeholders shown while a page loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

export function ListPageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-11 w-56 md:h-12" />
      <Skeleton className="mt-3 h-5 w-40" />
      <Skeleton className="mt-6 h-12 w-full max-w-md" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="mt-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-4 h-44 w-full rounded-3xl" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
