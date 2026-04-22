import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHouseholds1700000000002 implements MigrationInterface {
  name = 'AddHouseholds1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS households (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        owner_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_households_owner ON households(owner_id);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS household_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(10) UNIQUE NOT NULL,
        household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        created_by UUID NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_by UUID NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_household_invites_code ON household_invites(code);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id);`,
    );

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS household_id UUID NULL REFERENCES households(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_household;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS household_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS household_invites;`);
    await queryRunner.query(`DROP TABLE IF EXISTS households;`);
  }
}
