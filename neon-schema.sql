-- ============================================================
-- Foody — Schema completo para Neon DB
-- Ejecutar en: Neon Console → SQL Editor
-- ============================================================

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id"                  UUID         NOT NULL,
  "email"               VARCHAR(255) NOT NULL,
  "name"                VARCHAR(255),
  "avatar_url"          TEXT,
  "onesignal_player_id" VARCHAR(255),
  "household_id"        UUID         NULL,
  "created_at"          TIMESTAMP    NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMP    NOT NULL DEFAULT now(),
  CONSTRAINT "PK_users" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_users_email" UNIQUE ("email")
);

-- ─── Households ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  owner_id   UUID         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_households_owner ON households(owner_id);

-- ─── Household Invites ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(10) UNIQUE NOT NULL,
  household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_by      UUID        NULL,
  used_at      TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_invites_code     ON household_invites(code);
CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id);

-- FK users → households (después de crear households)
ALTER TABLE "users"
  ADD CONSTRAINT "FK_users_household"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);

-- ─── Products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "products" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"             VARCHAR(255)  NOT NULL,
  "description"      TEXT,
  "photo_url"        VARCHAR,
  "category"         VARCHAR(100),
  "current_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "min_quantity"     DECIMAL(10,2) NOT NULL DEFAULT 1,
  "unit"             VARCHAR(50)   NOT NULL DEFAULT 'units',
  "is_running_low"   BOOLEAN       NOT NULL DEFAULT false,
  "needs_shopping"   BOOLEAN       NOT NULL DEFAULT false,
  "stock_level"      VARCHAR(10)   NOT NULL DEFAULT 'full',
  "household_id"     UUID          NULL,
  "user_id"          UUID          NOT NULL,
  "created_at"       TIMESTAMP     NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMP     NOT NULL DEFAULT now(),
  CONSTRAINT "PK_products" PRIMARY KEY ("id"),
  CONSTRAINT "CK_products_stock_level" CHECK ("stock_level" IN ('full', 'half', 'empty')),
  CONSTRAINT "FK_products_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_products_household" FOREIGN KEY ("household_id")
    REFERENCES "households"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_products_user"         ON "products" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_products_needs_shopping" ON "products" ("user_id", "needs_shopping");
CREATE INDEX IF NOT EXISTS "IDX_products_stock_level"  ON "products" ("user_id", "stock_level");
CREATE INDEX IF NOT EXISTS "IDX_products_household_id" ON "products" ("household_id");

-- ─── Shopping List Items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "shopping_list_items" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "product_id"      UUID          NOT NULL,
  "quantity_needed" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "is_in_cart"      BOOLEAN       NOT NULL DEFAULT false,
  "is_purchased"    BOOLEAN       NOT NULL DEFAULT false,
  "household_id"    UUID          NULL,
  "user_id"         UUID          NOT NULL,
  "created_at"      TIMESTAMP     NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMP     NOT NULL DEFAULT now(),
  CONSTRAINT "PK_shopping_list_items" PRIMARY KEY ("id"),
  CONSTRAINT "FK_shopping_items_product" FOREIGN KEY ("product_id")
    REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_shopping_items_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_shopping_list_items_household" FOREIGN KEY ("household_id")
    REFERENCES "households"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_shopping_items_user"           ON "shopping_list_items" ("user_id", "is_purchased");
CREATE INDEX IF NOT EXISTS "IDX_shopping_list_items_household_id" ON "shopping_list_items" ("household_id");

-- ─── Stores ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  address      TEXT,
  latitude     DECIMAL(10,7),
  longitude    DECIMAL(10,7),
  user_id      UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  household_id UUID         NULL       REFERENCES households(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_user      ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_household ON stores(household_id);

-- ─── Shopping Trips ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_trips (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID          NULL REFERENCES stores(id) ON DELETE SET NULL,
  store_name   VARCHAR(255),
  date         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  total_spent  DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency     VARCHAR(10)   NOT NULL DEFAULT 'MXN',
  notes        TEXT,
  user_id      UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  household_id UUID          NULL       REFERENCES households(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_trips_user      ON shopping_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_trips_household ON shopping_trips(household_id);

-- ─── Monthly Payments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "monthly_payments" (
  "id"                       UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"                     VARCHAR(255)  NOT NULL,
  "description"              TEXT,
  "amount"                   DECIMAL(10,2) NOT NULL,
  "currency"                 VARCHAR(10)   NOT NULL DEFAULT 'USD',
  "due_day"                  SMALLINT      NOT NULL,
  "category"                 VARCHAR(100),
  "is_active"                BOOLEAN       NOT NULL DEFAULT true,
  "notification_days_before" SMALLINT      NOT NULL DEFAULT 3,
  "user_id"                  UUID          NOT NULL,
  "created_at"               TIMESTAMP     NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMP     NOT NULL DEFAULT now(),
  CONSTRAINT "PK_monthly_payments" PRIMARY KEY ("id"),
  CONSTRAINT "CK_due_day" CHECK ("due_day" >= 1 AND "due_day" <= 31),
  CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_payments_user" ON "monthly_payments" ("user_id", "is_active");

-- ─── Payment Records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_records" (
  "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" UUID          NOT NULL,
  "month"      SMALLINT      NOT NULL,
  "year"       SMALLINT      NOT NULL,
  "paid_at"    TIMESTAMP,
  "amount"     DECIMAL(10,2) NOT NULL,
  "status"     VARCHAR(20)   NOT NULL DEFAULT 'pending',
  "user_id"    UUID          NOT NULL,
  "created_at" TIMESTAMP     NOT NULL DEFAULT now(),
  CONSTRAINT "PK_payment_records" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_payment_month_year" UNIQUE ("payment_id", "month", "year"),
  CONSTRAINT "FK_records_payment" FOREIGN KEY ("payment_id")
    REFERENCES "monthly_payments"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_records_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_records_user_month" ON "payment_records" ("user_id", "month", "year");
