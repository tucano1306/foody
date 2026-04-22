import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { Household } from './household.entity';
import { HouseholdInvite } from './household-invite.entity';
import { User } from '../users/user.entity';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días
const CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

@Injectable()
export class HouseholdsService {
  constructor(
    @InjectRepository(Household) private readonly householdsRepo: Repository<Household>,
    @InjectRepository(HouseholdInvite) private readonly invitesRepo: Repository<HouseholdInvite>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async getMyHousehold(userId: string): Promise<{
    household: Household | null;
    members: Array<Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>>;
    isOwner: boolean;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.householdId) {
      return { household: null, members: [], isOwner: false };
    }
    const household = await this.householdsRepo.findOne({ where: { id: user.householdId } });
    if (!household) {
      return { household: null, members: [], isOwner: false };
    }
    const members = await this.usersRepo.find({
      where: { householdId: household.id },
      select: ['id', 'name', 'email', 'avatarUrl'],
    });
    return { household, members, isOwner: household.ownerId === userId };
  }

  async create(userId: string, name: string): Promise<Household> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.householdId) {
      throw new BadRequestException('Ya perteneces a un hogar. Sal de él antes de crear uno nuevo.');
    }

    return this.dataSource.transaction(async (manager) => {
      const household = manager.create(Household, { name, ownerId: userId });
      const saved = await manager.save(household);
      await manager.update(User, { id: userId }, { householdId: saved.id });
      return saved;
    });
  }

  async createInvite(userId: string): Promise<HouseholdInvite> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.householdId) throw new BadRequestException('No perteneces a ningún hogar');

    const invite = this.invitesRepo.create({
      code: generateCode(),
      householdId: user.householdId,
      createdBy: userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    return this.invitesRepo.save(invite);
  }

  async join(userId: string, code: string): Promise<Household> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.householdId) {
      throw new BadRequestException('Ya perteneces a un hogar. Sal de él primero.');
    }

    const invite = await this.invitesRepo.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!invite) throw new NotFoundException('Código de invitación inválido');
    if (invite.usedBy) throw new BadRequestException('Este código ya fue usado');
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código expirado');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.update(User, { id: userId }, { householdId: invite.householdId });
      await manager.update(
        HouseholdInvite,
        { id: invite.id },
        { usedBy: userId, usedAt: new Date() },
      );

      // Backfill user's personal products & shopping-list items into the household
      // so they become shared immediately with the other members.
      await manager.query(
        'UPDATE products SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL',
        [invite.householdId, userId],
      );
      await manager.query(
        'UPDATE shopping_list_items SET household_id = $1 WHERE user_id = $2 AND household_id IS NULL',
        [invite.householdId, userId],
      );

      const household = await manager.findOne(Household, { where: { id: invite.householdId } });
      if (!household) throw new NotFoundException('Hogar no encontrado');
      return household;
    });
  }

  async leave(userId: string): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.householdId) throw new BadRequestException('No perteneces a ningún hogar');

    const household = await this.householdsRepo.findOne({ where: { id: user.householdId } });
    if (household?.ownerId === userId) {
      // Count members. If owner is the last member, delete the household entirely.
      const count = await this.usersRepo.count({ where: { householdId: household.id } });
      if (count > 1) {
        throw new ForbiddenException(
          'Eres el propietario. Transfiere la propiedad o elimina el hogar.',
        );
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.update(User, { id: userId }, { householdId: null });
        await manager.delete(HouseholdInvite, { householdId: household.id });
        await manager.delete(Household, { id: household.id });
      });
      return;
    }

    await this.usersRepo.update({ id: userId }, { householdId: null });
  }
}
