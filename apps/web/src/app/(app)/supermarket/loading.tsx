export default function SupermarketLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton rounded-2xl h-24" />
      <div className="h-10 skeleton rounded-xl w-full" />
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 skeleton rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
