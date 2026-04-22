import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHouseholdScope1700000000003 implements MigrationInterface {
  name = 'AddHouseholdScope1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── products.household_id ───────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "household_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_household"
        FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_household_id" ON "products" ("household_id")`,
    );

    // ─── shopping_list_items.household_id ────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD COLUMN IF NOT EXISTS "household_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" ADD CONSTRAINT "FK_shopping_list_items_household"
        FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shopping_list_items_household_id" ON "shopping_list_items" ("household_id")`,
    );

    // ─── Backfill existing rows for users who already belong to a household ──
    await queryRunner.query(
      `UPDATE "products" p
         SET "household_id" = u."household_id"
        FROM "users" u
        WHERE p."user_id" = u."id"
          AND p."household_id" IS NULL
          AND u."household_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "shopping_list_items" s
         SET "household_id" = u."household_id"
        FROM "users" u
        WHERE s."user_id" = u."id"
          AND s."household_id" IS NULL
          AND u."household_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_shopping_list_items_household_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP CONSTRAINT IF EXISTS "FK_shopping_list_items_household"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping_list_items" DROP COLUMN IF EXISTS "household_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_household_id"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_household"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "household_id"`,
    );
  }
}
