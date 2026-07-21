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
  /** When true, the product stays visible only to its owner and is never
   * shared with the household, regardless of household membership. */
  isPrivate: boolean;
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
  productName?: string;
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

export interface UpdateShoppingTripDto {
  storeName?: string;
  purchasedAt?: string;
  totalAmount?: number;
  notes?: string;
  /** When present, the trip's purchases are rewritten with a fresh allocation. */
  items?: ShoppingTripItemDto[];
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
  isVariableAmount: boolean;
  /** Payment is handled automatically (e.g. direct debit). App marks it paid on the due date. */
  isAutoPay: boolean;
  /** Preferred/default way this bill is normally paid */
  paymentMethod: PaymentMethod | null;
  /** Bank or card issuer name for the default payment method */
  bankName: string | null;
  /** Last 4 digits of the default card/account (never store the full number) */
  accountLast4: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Computed fields returned by the API
  isPaidThisMonth: boolean;
  /**
   * Whole days until the next due date. Cycle-aware: once the current month is
   * paid this counts down to NEXT month's due day. Negative when overdue.
   */
  daysUntilDue: number;
  /** ISO date of the next due day (next month when the current cycle is paid). */
  nextDueDate?: string;
  currentRecord?: PaymentRecord;
  snoozedUntil: string | null;
  /** How many past months the due date passed without a paid record */
  missedMonths: number;
  /** missedMonths × amount (estimated accumulated debt) */
  accumulatedDebt: number;
  /** Months (due date already passed) still unpaid — oldest first */
  unpaidMonths?: Array<{ month: number; year: number }>;
  /** All-time sum actually paid across records (actualAmount ?? amount) */
  totalPaidAllTime?: number;
  /** All-time count of paid records */
  paidCountAllTime?: number;
  /** ISO timestamp of the most recent paid record */
  lastPaidAt?: string | null;
}

export interface CreatePaymentDto {
  name: string;
  description?: string;
  amount: number;
  currency?: string;
  dueDay: number;
  category?: string;
  notificationDaysBefore?: number;
  isVariableAmount?: boolean;
  isAutoPay?: boolean;
  paymentMethod?: PaymentMethod | null;
  bankName?: string | null;
  accountLast4?: string | null;
}

export interface UpdatePaymentDto extends Partial<CreatePaymentDto> {
  isActive?: boolean;
}

// ─── Payment Record ───────────────────────────────────────────────────────────
export type PaymentStatus = 'pending' | 'paid' | 'overdue';
export type PaymentMethod = 'transfer' | 'debit_card' | 'credit_card' | 'cash' | 'bank_account' | 'other';

export interface PaymentRecord {
  id: string;
  paymentId: string;
  month: number;
  year: number;
  paidAt: string | null;
  amount: number;
  actualAmount: number | null;
  paymentMethod: PaymentMethod | null;
  bankAccount: string | null;
  notes: string | null;
  status: PaymentStatus;
  userId: string;
  createdAt: string;
}

export interface MarkPaidDto {
  amount?: number;
  paymentMethod?: PaymentMethod;
  bankAccount?: string;
  notes?: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface SessionData {
  jwt: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isLoggedIn: boolean;
  pendingLogin?: {
    email: string;
    name: string | null;
    callbackUrl: string;
    codeHash: string;
    expiresAt: string;
    attempts: number;
  };
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
