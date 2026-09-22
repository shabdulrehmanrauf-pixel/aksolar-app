import { Skeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-11 w-48 md:h-12" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-44 w-full rounded-3xl" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
