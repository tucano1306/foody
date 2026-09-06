export default function HomeLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 skeleton rounded-xl w-2/3" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 skeleton rounded-2xl" />
        ))}
      </div>
      <div className="h-48 skeleton rounded-2xl" />
      <div className="h-48 skeleton rounded-2xl" />
    </div>
  );
}
