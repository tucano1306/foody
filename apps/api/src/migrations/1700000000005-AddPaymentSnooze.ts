import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentSnooze1700000000005 implements MigrationInterface {
  name = 'AddPaymentSnooze1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        ADD COLUMN IF NOT EXISTS "snoozed_until" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        DROP COLUMN IF EXISTS "snoozed_until"
    `);
  }
}
