import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricesCacheAndTickets1700000000004 implements MigrationInterface {
  name = 'AddPricesCacheAndTickets1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── prices_cache ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prices_cache" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "product_id"  UUID         NOT NULL,
        "supermarket" TEXT         NOT NULL,
        "price"       NUMERIC(10,2) NOT NULL,
        "currency"    TEXT         NOT NULL DEFAULT 'MXN',
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prices_cache" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prices_cache_product_store" UNIQUE ("product_id", "supermarket"),
        CONSTRAINT "FK_prices_cache_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prices_cache_product"
        ON "prices_cache" ("product_id")
    `);

    // ─── tickets ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tickets" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID         NOT NULL,
        "raw_text"     TEXT,
        "total"        NUMERIC(10,2),
        "store_name"   TEXT,
        "receipt_date" DATE,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tickets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tickets_user"
        ON "tickets" ("user_id")
    `);

    // ─── ticket_items ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_items" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "ticket_id"       UUID         NOT NULL,
        "product_name"    TEXT         NOT NULL,
        "normalized_name" TEXT,
        "price"           NUMERIC(10,2),
        "quantity"        INT          NOT NULL DEFAULT 1,
        CONSTRAINT "PK_ticket_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ticket_items_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "tickets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ticket_items_ticket"
        ON "ticket_items" ("ticket_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prices_cache"`);
  }
}
