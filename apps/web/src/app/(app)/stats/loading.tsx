export default function StatsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl w-1/2" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['a', 'b', 'c', 'd'].map((k) => (
          <div key={k} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
        ))}
      </div>
      <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
      <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
    </div>
  );
}
