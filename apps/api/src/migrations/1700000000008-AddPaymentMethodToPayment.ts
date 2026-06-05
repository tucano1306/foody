import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodToPayment1700000000008 implements MigrationInterface {
  name = 'AddPaymentMethodToPayment1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(20)  NULL,
        ADD COLUMN IF NOT EXISTS "bank_name"      VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS "account_last4"  VARCHAR(4)   NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        DROP COLUMN IF EXISTS "payment_method",
        DROP COLUMN IF EXISTS "bank_name",
        DROP COLUMN IF EXISTS "account_last4"
    `);
  }
}
