import { IsNull } from 'typeorm';
import { ScopeService } from './scope.service';

function buildService(user: { id: string; householdId: string | null } | null) {
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue(user),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ScopeService(usersRepo as any);
}

describe('ScopeService', () => {
  describe('resolve()', () => {
    it('returns householdId when user belongs to a household', async () => {
      const service = buildService({ id: 'u1', householdId: 'h1' });
      const scope = await service.resolve('u1');
      expect(scope).toEqual({ userId: 'u1', householdId: 'h1' });
    });

    it('returns null householdId when user has no household', async () => {
      const service = buildService({ id: 'u1', householdId: null });
      const scope = await service.resolve('u1');
      expect(scope).toEqual({ userId: 'u1', householdId: null });
    });

    it('returns null householdId when user not found', async () => {
      const service = buildService(null);
      const scope = await service.resolve('ghost');
      expect(scope).toEqual({ userId: 'ghost', householdId: null });
    });
  });

  describe('whereFragment()', () => {
    it('scopes to household when householdId is set', () => {
      const service = buildService(null);
      const frag = service.whereFragment({ userId: 'u1', householdId: 'h1' });
      expect(frag).toEqual({ householdId: 'h1' });
    });

    it('scopes to user + null householdId when no household', () => {
      const service = buildService(null);
      const frag = service.whereFragment({ userId: 'u1', householdId: null });
      expect(frag).toEqual({ userId: 'u1', householdId: IsNull() });
    });
  });
});
