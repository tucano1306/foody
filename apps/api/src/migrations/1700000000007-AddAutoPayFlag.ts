import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoPayFlag1700000000007 implements MigrationInterface {
  name = 'AddAutoPayFlag1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        ADD COLUMN IF NOT EXISTS "is_auto_pay" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "monthly_payments"
        DROP COLUMN IF EXISTS "is_auto_pay"
    `);
  }
}
