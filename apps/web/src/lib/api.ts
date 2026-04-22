import { getSession } from './session';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface FetchOptions {
  method?: HttpMethod;
  body?: unknown;
  cache?: RequestCache;
  revalidate?: number;
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const session = await getSession();

  if (!session.isLoggedIn || !session.jwt) {
    throw new Error('Not authenticated');
  }

  const { method = 'GET', body, cache = 'no-store' } = options;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.jwt}`,
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
    cache,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API error ${res.status}: ${errorBody}`);
  }

  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const api = {
  products: {
    list: () => apiFetch<import('@foody/types').Product[]>('/products'),
    runningLow: () => apiFetch<import('@foody/types').Product[]>('/products/running-low'),
    get: (id: string) => apiFetch<import('@foody/types').Product>(`/products/${id}`),
    create: (data: import('@foody/types').CreateProductDto) =>
      apiFetch<import('@foody/types').Product>('/products', { method: 'POST', body: data }),
    update: (id: string, data: import('@foody/types').UpdateProductDto) =>
      apiFetch<import('@foody/types').Product>(`/products/${id}`, { method: 'PATCH', body: data }),
    markLow: (id: string) =>
      apiFetch<import('@foody/types').Product>(`/products/${id}/mark-low`, { method: 'PATCH' }),
    markOk: (id: string) =>
      apiFetch<import('@foody/types').Product>(`/products/${id}/mark-ok`, { method: 'PATCH' }),
    setStockLevel: (id: string, level: import('@foody/types').StockLevel) =>
      apiFetch<import('@foody/types').Product>(`/products/${id}/stock-level`, {
        method: 'PATCH',
        body: { level },
      }),
    delete: (id: string) =>
      apiFetch<void>(`/products/${id}`, { method: 'DELETE' }),
    getUploadUrl: (fileName: string, contentType: string) =>
      apiFetch<import('@foody/types').PresignedUrlResponse>(
        `/products/upload-url?fileName=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(contentType)}`,
      ),
    registerPurchase: (id: string, data: import('@foody/types').CreatePurchaseDto) =>
      apiFetch<import('@foody/types').RegisterPurchaseResponse>(
        `/products/${id}/purchases`,
        { method: 'POST', body: data },
      ),
    listPurchases: (id: string) =>
      apiFetch<import('@foody/types').ProductPurchase[]>(`/products/${id}/purchases`),
    deletePurchase: (id: string, purchaseId: string) =>
      apiFetch<import('@foody/types').Product>(
        `/products/${id}/purchases/${purchaseId}`,
        { method: 'DELETE' },
      ),
  },
  shoppingList: {
    get: () => apiFetch<import('@foody/types').ShoppingListItem[]>('/shopping-list'),
    frequent: () =>
      apiFetch<
        Array<{
          productId: string;
          name: string;
          photoUrl: string | null;
          purchases: number;
          lastPurchasedAt: string;
        }>
      >('/shopping-list/frequent'),
    toggleCart: (id: string) =>
      apiFetch<import('@foody/types').ShoppingListItem>(`/shopping-list/${id}/toggle-cart`, { method: 'PATCH' }),
    completeShopping: () =>
      apiFetch<{ message: string }>('/shopping-list/complete', { method: 'POST' }),
  },
  payments: {
    list: () => apiFetch<import('@foody/types').MonthlyPayment[]>('/payments'),
    byCategory: () =>
      apiFetch<Array<{ category: string; total: number; count: number }>>(
        '/payments/by-category',
      ),
    get: (id: string) => apiFetch<import('@foody/types').MonthlyPayment>(`/payments/${id}`),
    create: (data: import('@foody/types').CreatePaymentDto) =>
      apiFetch<import('@foody/types').MonthlyPayment>('/payments', { method: 'POST', body: data }),
    update: (id: string, data: Partial<import('@foody/types').CreatePaymentDto>) =>
      apiFetch<import('@foody/types').MonthlyPayment>(`/payments/${id}`, { method: 'PATCH', body: data }),
    markPaid: (id: string) =>
      apiFetch<import('@foody/types').PaymentRecord>(`/payments/${id}/mark-paid`, { method: 'POST' }),
    markUnpaid: (id: string) =>
      apiFetch<void>(`/payments/${id}/mark-paid`, { method: 'DELETE' }),
    delete: (id: string) =>
      apiFetch<void>(`/payments/${id}`, { method: 'DELETE' }),
  },
  users: {
    me: () => apiFetch<import('@foody/types').User>('/users/me'),
    updateMe: (data: { name?: string; onesignalPlayerId?: string }) =>
      apiFetch<import('@foody/types').User>('/users/me', { method: 'PATCH', body: data }),
  },
  households: {
    me: () =>
      apiFetch<{
        household: { id: string; name: string; ownerId: string } | null;
        members: Array<{ id: string; name: string | null; email: string; avatarUrl: string | null }>;
        isOwner: boolean;
      }>('/households/me'),
    create: (name: string) =>
      apiFetch<{ id: string; name: string; ownerId: string }>('/households', {
        method: 'POST',
        body: { name },
      }),
    createInvite: () =>
      apiFetch<{ code: string; expiresAt: string }>('/households/invites', {
        method: 'POST',
      }),
    join: (code: string) =>
      apiFetch<{ id: string; name: string }>('/households/join', {
        method: 'POST',
        body: { code },
      }),
    leave: () => apiFetch<void>('/households/leave', { method: 'DELETE' }),
  },
  stores: {
    list: () => apiFetch<import('@foody/types').Store[]>('/stores'),
    get: (id: string) => apiFetch<import('@foody/types').Store>(`/stores/${id}`),
    create: (data: import('@foody/types').CreateStoreDto) =>
      apiFetch<import('@foody/types').Store>('/stores', { method: 'POST', body: data }),
    update: (id: string, data: import('@foody/types').UpdateStoreDto) =>
      apiFetch<import('@foody/types').Store>(`/stores/${id}`, { method: 'PATCH', body: data }),
    delete: (id: string) => apiFetch<void>(`/stores/${id}`, { method: 'DELETE' }),
  },
  shoppingTrips: {
    list: () => apiFetch<import('@foody/types').ShoppingTrip[]>('/shopping-trips'),
    byStore: () =>
      apiFetch<Array<{ storeName: string; total: number; count: number }>>(
        '/shopping-trips/by-store',
      ),
    get: (id: string) =>
      apiFetch<import('@foody/types').ShoppingTripDetail>(`/shopping-trips/${id}`),
    create: (data: import('@foody/types').CreateShoppingTripDto) =>
      apiFetch<import('@foody/types').CreateShoppingTripResponse>('/shopping-trips', {
        method: 'POST',
        body: data,
      }),
    delete: (id: string) =>
      apiFetch<void>(`/shopping-trips/${id}`, { method: 'DELETE' }),
  },
};
