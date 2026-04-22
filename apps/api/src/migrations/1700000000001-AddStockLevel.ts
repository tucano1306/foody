import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockLevel1700000000001 implements MigrationInterface {
  name = 'AddStockLevel1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "stock_level" VARCHAR(10) NOT NULL DEFAULT 'full'
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "CK_products_stock_level"
      CHECK ("stock_level" IN ('full', 'half', 'empty'))
    `);

    // Backfill from existing flags
    await queryRunner.query(`
      UPDATE "products"
      SET "stock_level" = CASE
        WHEN "current_quantity" <= 0 THEN 'empty'
        WHEN "is_running_low" = true OR "needs_shopping" = true THEN 'half'
        ELSE 'full'
      END
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_products_stock_level"
      ON "products" ("user_id", "stock_level")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_stock_level"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_stock_level"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "stock_level"`);
  }
}
