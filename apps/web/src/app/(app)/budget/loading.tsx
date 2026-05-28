export default function BudgetLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-24 bg-stone-200 rounded-2xl" />
      <div className="bg-white rounded-2xl border border-stone-100 p-5">
        <div className="flex items-center gap-5">
          <div className="w-36 h-36 rounded-full bg-stone-200 shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-stone-200 rounded-full w-1/2" />
            <div className="h-4 bg-stone-100 rounded w-2/3" />
            <div className="h-4 bg-stone-100 rounded w-1/2" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-stone-200 rounded-2xl" />
        <div className="h-24 bg-stone-200 rounded-2xl" />
      </div>
      <div className="h-48 bg-stone-200 rounded-2xl" />
    </div>
  );
}
