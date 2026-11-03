// 订阅页要去 Marzban 查到期和流量，等的时候先放骨架，不白屏
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-20 pb-16" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-4 w-28" />
      <div className="skeleton mb-6 h-8 w-40" />
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div className="skeleton h-6 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className="skeleton h-16 w-16 shrink-0 rounded-full" />
              <div className="skeleton h-10 w-full" />
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton h-16 w-16 shrink-0 rounded-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-8 w-28" />
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-8 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
