import * as bcrypt from 'bcrypt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { assertPinAvailable, usersWithPin } from './pin.util';

const UUID = '11111111-1111-4111-8111-111111111111';

async function staff(entries: Array<[id: string, pin: string, extra?: Record<string, unknown>]>) {
  return Promise.all(entries.map(async ([id, pin, extra]) => ({
    id, name: id, businessId: UUID, role: 'KITCHEN', email: null, pinHash: await bcrypt.hash(pin, 4), ...extra,
  })));
}

function makeAuth(users: any[]) {
  const prisma: any = {
    user: { findMany: jest.fn().mockImplementation(async ({ where }: any) =>
      users.filter((u) => (!where.id || u.id === where.id) && u.pinHash)) },
    business: { findUnique: jest.fn().mockResolvedValue({ planName: 'STARTER', subscriptionTier: 'GROWTH' }) },
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('token') };
  return new AuthService(prisma, jwt, {} as any, {} as any);
}

describe('usersWithPin', () => {
  it('returns every user holding the PIN', async () => {
    const users = await staff([['a', '1234'], ['b', '5678'], ['c', '1234']]);
    expect((await usersWithPin(users, '1234')).map((u) => u.id)).toEqual(['a', 'c']);
    expect(await usersWithPin(users, '0000')).toEqual([]);
  });
});

describe('assertPinAvailable', () => {
  it('refuses a PIN someone else already has', async () => {
    const users = await staff([['a', '1234']]);
    const prisma: any = { user: { findMany: jest.fn().mockResolvedValue(users) } };
    await expect(assertPinAvailable(prisma, UUID, '1234')).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts a fresh PIN, and ignores the user changing their own', async () => {
    const users = await staff([['a', '1234']]);
    // Honour the "everyone except me" filter the way the database would.
    const prisma: any = { user: { findMany: jest.fn().mockImplementation(async ({ where }: any) =>
      users.filter((u) => !where.id?.not || u.id !== where.id.not)) } };
    await expect(assertPinAvailable(prisma, UUID, '9999')).resolves.toBeUndefined();
    await expect(assertPinAvailable(prisma, UUID, '1234', 'a')).resolves.toBeUndefined();
    await expect(assertPinAvailable(prisma, UUID, '1234', 'someone-else')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not name the person who has the PIN', async () => {
    const users = await staff([['secret-name', '1234']]);
    const prisma: any = { user: { findMany: jest.fn().mockResolvedValue(users) } };
    await expect(assertPinAvailable(prisma, UUID, '1234')).rejects.toThrow(/^(?!.*secret-name)/);
  });
});

describe('loginWithPin with a shared PIN', () => {
  it('refuses to guess between two people who share a PIN', async () => {
    const auth = makeAuth(await staff([['a', '1234'], ['b', '1234']]));
    await expect(auth.loginWithPin('1234', UUID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs in the right person when the name is given', async () => {
    const auth = makeAuth(await staff([['a', '1234'], ['b', '1234']]));
    const res = await auth.loginWithPin('1234', UUID, undefined, 'b');
    expect(res.user.id).toBe('b');
  });

  it('still signs in a unique PIN without a name, and rejects a wrong one', async () => {
    const auth = makeAuth(await staff([['a', '1234'], ['b', '5678']]));
    expect((await auth.loginWithPin('5678', UUID)).user.id).toBe('b');
    await expect(auth.loginWithPin('0000', UUID)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('verifyManagerPin with a shared PIN', () => {
  it('will not attribute an override to one of two managers', async () => {
    const auth = makeAuth(await staff([['m1', '4321', { role: 'MANAGER' }], ['m2', '4321', { role: 'MANAGER' }]]));
    await expect(auth.verifyManagerPin('4321', UUID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a PIN only one manager has', async () => {
    const auth = makeAuth(await staff([['m1', '4321', { role: 'MANAGER' }], ['m2', '8765', { role: 'MANAGER' }]]));
    expect((await auth.verifyManagerPin('8765', UUID)).userId).toBe('m2');
  });
});
