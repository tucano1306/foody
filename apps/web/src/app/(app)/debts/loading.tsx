export default function DebtsLoading() {
  return (
    <div className="space-y-5">
      <div className="h-10 w-2/3 rounded-xl skeleton" />
      <div className="h-44 rounded-3xl skeleton" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-56 rounded-3xl skeleton" />
        ))}
      </div>
    </div>
  );
}
