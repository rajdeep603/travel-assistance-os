import { Skeleton } from "@/components/ui";

/**
 * Shown while a server-rendered page (the overview, a case, a call) is being
 * built: the page keeps its shape instead of freezing on the previous one.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-7xl" role="status" aria-label="Loading page">
      <div className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${i === 0 ? "lg:col-span-2" : ""}`}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-10 w-32" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-5/6" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="ml-auto h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
