import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushSubscription1700000000006 implements MigrationInterface {
  name = 'AddPushSubscription1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "push_subscription" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "push_subscription"`);
  }
}
