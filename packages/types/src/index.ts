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

/**
 * Qué clase de gasto es un ticket.
 *
 * `grocery` es lo único que vive en la sección Compras: es la despensa, y es lo
 * que alimenta precios, stock y el presupuesto de super. El resto —una comida
 * fuera, la farmacia, la gasolina— es gasto igual de real, pero no es super:
 * sale solo en el Plan Financiero, restando del dinero de las metas.
 *
 * Mezclarlos rompía las dos cosas a la vez: el promedio por ticket del super se
 * ensuciaba con restaurantes, y esos gastos no aparecían en ningún lado del plan.
 */
export type ExpenseKind = 'grocery' | 'dining' | 'pharmacy' | 'fuel' | 'home' | 'other';

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
  /** Súper o gasto de otro tipo. Por defecto `grocery`. */
  kind: ExpenseKind;
  /** 0-100: qué parte de esta compra es del negocio. */
  businessShare: number;
  /**
   * Partes del ticket que cuentan como otro tipo de gasto.
   *
   * Opcional porque el LISTADO no las carga: decir `TripSplit[]` ahí obligaría
   * a inventar un `[]` que no distingue «este ticket no tiene partes» de «no
   * se pidieron». El detalle sí las trae siempre.
   */
  splits?: TripSplit[];
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

/**
 * Un trozo del ticket que NO es del tipo principal.
 *
 * Un carrito de Walmart puede llevar $85 de despensa y $35 de farmacia en el
 * mismo recibo. El ticket guarda su tipo principal y su total; cada `split`
 * recorta del total la parte que pertenece a otro sitio, y lo que sobra se
 * queda donde dice el ticket.
 */
export interface TripSplitDto {
  kind: ExpenseKind;
  amount: number;
  /** Qué era, con las palabras del usuario ("pañales", "medicinas"). */
  note?: string | null;
}

export interface TripSplit extends TripSplitDto {
  id: string;
  note: string | null;
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
  /** 0-100: qué parte de esta compra es del negocio. 0 = personal. */
  businessShare?: number;
  /** Súper o gasto de otro tipo. Ausente = `grocery`. */
  kind?: ExpenseKind;
  /** Partes del ticket que pertenecen a otro tipo de gasto. */
  splits?: TripSplitDto[];
  items: ShoppingTripItemDto[];
}

export interface UpdateShoppingTripDto {
  storeName?: string;
  purchasedAt?: string;
  totalAmount?: number;
  notes?: string;
  /** Re-clasificar un ticket ya guardado (un restaurante que entró como super). */
  kind?: ExpenseKind;
  /** Si viene, REEMPLAZA los splits del ticket; `[]` los borra todos. */
  splits?: TripSplitDto[];
  /** When present, the trip's purchases are rewritten with a fresh allocation. */
  items?: ShoppingTripItemDto[];
}

export interface ShoppingTripDetail extends ShoppingTrip {
  items: ProductPurchase[];
  /** En el detalle siempre vienen, aunque estén vacías. */
  splits: TripSplit[];
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

/**
 * Cada cuánto vence un recibo.
 *
 * Existe porque no todo se paga al mes: el seguro del coche llega cada seis
 * meses, y contarlo como mensual multiplicaba ese gasto por seis en el plan
 * financiero. La lógica vive en `payment-frequency.ts`.
 */
export type PaymentFrequency =
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';

export interface MonthlyPayment {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  dueDay: number;
  /** Cada cuánto vence: mensual, bimestral, trimestral, semestral o anual. */
  frequency: PaymentFrequency;
  /**
   * Mes (1-12) en que cae uno de los cobros, para los que no son mensuales.
   * Los demás se deducen sumando ciclos: un semestral anclado en marzo vence
   * en marzo y en septiembre. Es `null` en los mensuales.
   */
  anchorMonth: number | null;
  category: PaymentCategory | (string & {});
  isActive: boolean;
  notificationDaysBefore: number;
  isVariableAmount: boolean;
  /** Payment is handled automatically (e.g. direct debit). App marks it paid on the due date. */
  isAutoPay: boolean;
  /**
   * Porcentaje 0-100 del gasto que corresponde al negocio.
   * El ámbito (personal / negocio / mixto) se DERIVA de este número, nunca se
   * guarda aparte — ver `expense-scope.ts`.
   */
  businessShare: number;
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
  /** Cada cuánto vence. Sin esto se asume mensual, que es lo que era todo. */
  frequency?: PaymentFrequency;
  /** Mes (1-12) de uno de los cobros, para los que no son mensuales. */
  anchorMonth?: number | null;
  category?: string;
  notificationDaysBefore?: number;
  isVariableAmount?: boolean;
  isAutoPay?: boolean;
  /** 0-100: qué parte del gasto es del negocio. 0 = personal. */
  businessShare?: number;
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
