export default function PaymentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-stone-200 dark:bg-stone-700 rounded-xl w-1/2" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-stone-200 dark:bg-stone-700 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-stone-200 dark:bg-stone-700 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
