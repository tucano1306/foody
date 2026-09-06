export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 skeleton rounded-xl w-1/2" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 skeleton rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 skeleton rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
