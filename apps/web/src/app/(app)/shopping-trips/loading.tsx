export default function ShoppingTripsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-stone-200 dark:bg-stone-700 rounded-xl w-1/2" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-stone-200 dark:bg-stone-700 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
