import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Users ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"                    UUID         NOT NULL,
        "email"                 VARCHAR(255) NOT NULL,
        "name"                  VARCHAR(255),
        "avatar_url"            TEXT,
        "onesignal_player_id"   VARCHAR(255),
        "created_at"            TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ─── Products ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"             VARCHAR(255) NOT NULL,
        "description"      TEXT,
        "photo_url"        VARCHAR,
        "category"         VARCHAR(100),
        "current_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
        "min_quantity"     DECIMAL(10,2) NOT NULL DEFAULT 1,
        "unit"             VARCHAR(50)  NOT NULL DEFAULT 'units',
        "is_running_low"   BOOLEAN      NOT NULL DEFAULT false,
        "needs_shopping"   BOOLEAN      NOT NULL DEFAULT false,
        "user_id"          UUID         NOT NULL,
        "created_at"       TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ─── Shopping List ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shopping_list_items" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "product_id"       UUID         NOT NULL,
        "quantity_needed"  DECIMAL(10,2) NOT NULL DEFAULT 1,
        "is_in_cart"       BOOLEAN      NOT NULL DEFAULT false,
        "is_purchased"     BOOLEAN      NOT NULL DEFAULT false,
        "user_id"          UUID         NOT NULL,
        "created_at"       TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shopping_list_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shopping_items_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shopping_items_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ─── Monthly Payments ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "monthly_payments" (
        "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"                      VARCHAR(255) NOT NULL,
        "description"               TEXT,
        "amount"                    DECIMAL(10,2) NOT NULL,
        "currency"                  VARCHAR(10)  NOT NULL DEFAULT 'USD',
        "due_day"                   SMALLINT     NOT NULL,
        "category"                  VARCHAR(100),
        "is_active"                 BOOLEAN      NOT NULL DEFAULT true,
        "notification_days_before"  SMALLINT     NOT NULL DEFAULT 3,
        "user_id"                   UUID         NOT NULL,
        "created_at"                TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_monthly_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CK_due_day" CHECK ("due_day" >= 1 AND "due_day" <= 31),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ─── Payment Records ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_records" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "payment_id"  UUID         NOT NULL,
        "month"       SMALLINT     NOT NULL,
        "year"        SMALLINT     NOT NULL,
        "paid_at"     TIMESTAMP,
        "amount"      DECIMAL(10,2) NOT NULL,
        "status"      VARCHAR(20)  NOT NULL DEFAULT 'pending',
        "user_id"     UUID         NOT NULL,
        "created_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_records" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_month_year" UNIQUE ("payment_id", "month", "year"),
        CONSTRAINT "FK_records_payment" FOREIGN KEY ("payment_id")
          REFERENCES "monthly_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_records_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ─── Indexes ──────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "IDX_products_user" ON "products" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_needs_shopping" ON "products" ("user_id", "needs_shopping")`);
    await queryRunner.query(`CREATE INDEX "IDX_shopping_items_user" ON "shopping_list_items" ("user_id", "is_purchased")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_user" ON "monthly_payments" ("user_id", "is_active")`);
    await queryRunner.query(`CREATE INDEX "IDX_records_user_month" ON "payment_records" ("user_id", "month", "year")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "monthly_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shopping_list_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
