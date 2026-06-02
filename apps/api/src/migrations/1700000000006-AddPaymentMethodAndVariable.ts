import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodAndVariable1700000000006 implements MigrationInterface {
  name = 'AddPaymentMethodAndVariable1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        ADD COLUMN IF NOT EXISTS "is_variable_amount" BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
        ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS "bank_account"   VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS "actual_amount"  DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "notes"          TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_records"
        DROP COLUMN IF EXISTS "payment_method",
        DROP COLUMN IF EXISTS "bank_account",
        DROP COLUMN IF EXISTS "actual_amount",
        DROP COLUMN IF EXISTS "notes"
    `);
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        DROP COLUMN IF EXISTS "is_variable_amount"
    `);
  }
}
