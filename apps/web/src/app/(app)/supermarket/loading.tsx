export default function SupermarketLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-stone-200 dark:bg-stone-700 rounded-2xl h-24" />
      <div className="h-10 bg-stone-200 dark:bg-stone-700 rounded-xl w-full" />
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-stone-200 dark:bg-stone-700 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
