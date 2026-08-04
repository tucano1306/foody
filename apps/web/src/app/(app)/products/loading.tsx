export default function ProductsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl w-1/2" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-36 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
