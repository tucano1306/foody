import { cache } from 'react';
import { api } from './api';

/**
 * Per-request memoised home-dashboard queries. Several widgets on the Casa page
 * need the same aggregate; wrapping the call in React `cache()` collapses them
 * into a single DB round-trip per request (e.g. StoreVisitsWheel +
 * ExpensesByStore both read the by-store aggregate).
 */
export const getStoresAggregate = cache(() => api.shoppingTrips.byStore());
