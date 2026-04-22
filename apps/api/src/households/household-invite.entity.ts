import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('household_invites')
export class HouseholdInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10, unique: true })
  @Index()
  code: string;

  @Column({ name: 'household_id', type: 'uuid' })
  @Index()
  householdId: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_by', nullable: true, type: 'uuid' })
  usedBy: string | null;

  @Column({ name: 'used_at', nullable: true, type: 'timestamptz' })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
