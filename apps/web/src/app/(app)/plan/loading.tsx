export default function PlanLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-52 rounded-3xl bg-linear-to-br from-indigo-200 to-sky-200 dark:from-indigo-500/20 dark:to-sky-500/10" />
      <div className="h-64 rounded-3xl bg-white/70 dark:bg-white/5 border border-slate-100 dark:border-white/10" />
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-violet-100/70 dark:bg-violet-500/10" />
        <div className="h-24 rounded-2xl bg-emerald-100/70 dark:bg-emerald-500/10" />
      </div>
      <div className="h-56 rounded-3xl bg-white/70 dark:bg-white/5 border border-slate-100 dark:border-white/10" />
    </div>
  );
}
