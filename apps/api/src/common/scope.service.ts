import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';

export interface Scope {
  readonly userId: string;
  readonly householdId: string | null;
}

/**
 * Resolves the data-access scope for a user.
 * - When the user belongs to a household, queries are scoped to `householdId`
 *   so every member sees shared products and shopping list items.
 * - Otherwise, queries are scoped to `userId`.
 *
 * On create, callers should stamp BOTH `userId` (creator) and `householdId`
 * (from this scope) so ownership is preserved across joins/leaves.
 */
@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async resolve(userId: string): Promise<Scope> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'householdId'],
    });
    return { userId, householdId: user?.householdId ?? null };
  }

  /**
   * Returns a TypeORM `where` fragment that scopes a query to the given scope.
   * - If `householdId` is set → `{ householdId }` (shared data).
   * - Otherwise → `{ userId, householdId IS NULL }` (personal data only).
   */
  whereFragment(
    scope: Scope,
  ): { householdId: string } | { userId: string; householdId: ReturnType<typeof IsNull> } {
    if (scope.householdId) {
      return { householdId: scope.householdId };
    }
    return { userId: scope.userId, householdId: IsNull() };
  }
}
