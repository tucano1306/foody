export default function ShoppingTripsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 skeleton rounded-xl w-1/2" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 skeleton rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
