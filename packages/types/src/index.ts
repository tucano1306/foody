// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  onesignalPlayerId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Product ──────────────────────────────────────────────────────────────────
export type ProductStatus = 'ok' | 'low' | 'empty';
export type StockLevel = 'full' | 'half' | 'empty';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  category: string | null;
  currentQuantity: number;
  minQuantity: number;
  unit: string;
  stockLevel: StockLevel;
  isRunningLow: boolean;
  needsShopping: boolean;
  status: ProductStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastPurchasePrice: number | null;
  lastPurchaseDate: string | null;
  avgPrice: number | null;
  totalSpent: number;
  totalPurchasedQty: number;
  currency: string;
}

export interface CreateProductDto {
  name: string;
  description?: string;
  photoUrl?: string;
  category?: string;
  currentQuantity?: number;
  minQuantity?: number;
  unit?: string;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
  isRunningLow?: boolean;
  needsShopping?: boolean;
}

// ─── Product Purchase ─────────────────────────────────────────────────────────
export type PriceSource = 'manual' | 'allocated' | 'unknown';

export interface ProductPurchase {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  priceSource: PriceSource;
  currency: string;
  purchasedAt: string;
  storeId: string | null;
  storeName: string | null;
  tripId: string | null;
  userId: string;
  createdAt: string;
}

export interface CreatePurchaseDto {
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  currency?: string;
  purchasedAt?: string;
  storeId?: string;
  storeName?: string;
}

export interface RegisterPurchaseResponse {
  product: Product;
  purchase: ProductPurchase;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  name: string;
  chain: string | null;
  location: string | null;
  currency: string;
  color: string | null;
  icon: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoreDto {
  name: string;
  chain?: string;
  location?: string;
  currency?: string;
  color?: string;
  icon?: string;
}

export interface UpdateStoreDto extends Partial<CreateStoreDto> {}

// ─── Shopping Trip (Ticket) ───────────────────────────────────────────────────
export type AllocationStrategy = 'equal' | 'by_quantity' | 'manual_partial' | 'none';

export interface ShoppingTrip {
  id: string;
  storeId: string | null;
  storeName: string | null;
  purchasedAt: string;
  totalAmount: number;
  currency: string;
  allocationStrategy: AllocationStrategy;
  receiptPhotoUrl: string | null;
  notes: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingTripItemDto {
  productId: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface CreateShoppingTripDto {
  storeId?: string;
  storeName?: string;
  purchasedAt?: string;
  totalAmount: number;
  currency?: string;
  allocationStrategy?: AllocationStrategy;
  receiptPhotoUrl?: string;
  notes?: string;
  items: ShoppingTripItemDto[];
}

export interface ShoppingTripDetail extends ShoppingTrip {
  items: ProductPurchase[];
}

export interface CreateShoppingTripResponse {
  trip: ShoppingTrip;
  items: ProductPurchase[];
}

// ─── Shopping List ────────────────────────────────────────────────────────────
export interface ShoppingListItem {
  id: string;
  productId: string;
  product: Product;
  quantityNeeded: number;
  isInCart: boolean;
  isPurchased: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Monthly Payment ──────────────────────────────────────────────────────────
export type PaymentCategory =
  | 'utilities'
  | 'subscriptions'
  | 'rent'
  | 'insurance'
  | 'internet'
  | 'phone'
  | 'streaming'
  | 'other';

export interface MonthlyPayment {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  dueDay: number;
  category: PaymentCategory | (string & {});
  isActive: boolean;
  notificationDaysBefore: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Computed fields returned by the API
  isPaidThisMonth: boolean;
  daysUntilDue: number;
  currentRecord?: PaymentRecord;
}

export interface CreatePaymentDto {
  name: string;
  description?: string;
  amount: number;
  currency?: string;
  dueDay: number;
  category?: string;
  notificationDaysBefore?: number;
}

export interface UpdatePaymentDto extends Partial<CreatePaymentDto> {
  isActive?: boolean;
}

// ─── Payment Record ───────────────────────────────────────────────────────────
export type PaymentStatus = 'pending' | 'paid' | 'overdue';

export interface PaymentRecord {
  id: string;
  paymentId: string;
  month: number;
  year: number;
  paidAt: string | null;
  amount: number;
  status: PaymentStatus;
  userId: string;
  createdAt: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface SessionData {
  jwt: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isLoggedIn: boolean;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalProducts: number;
  runningLowCount: number;
  shoppingListCount: number;
  upcomingPaymentsCount: number;
  totalMonthlyExpenses: number;
}
