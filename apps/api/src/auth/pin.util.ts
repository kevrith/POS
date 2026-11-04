import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

interface PinUser { id: string; pinHash: string | null }

interface PinStore {
  user: {
    findMany(args: { where: Record<string, unknown>; select: { id: true; pinHash: true } }): Promise<PinUser[]>;
  };
}

/** Every user in `candidates` whose PIN is `pin`. More than one means the PIN is shared. */
export async function usersWithPin<T extends PinUser>(candidates: T[], pin: string): Promise<T[]> {
  const out: T[] = [];
  for (const u of candidates) {
    if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) out.push(u);
  }
  return out;
}

/**
 * A PIN identifies a person, so two people in one business must not share one.
 *
 * Without a name to go with it, a shared PIN logged whoever happened to be first
 * in the list in as both of them, and a manager override was recorded against
 * the wrong manager. Refusing the duplicate when the PIN is set closes that at
 * the source; the login paths separately refuse an already-shared PIN.
 */
export async function assertPinAvailable(
  prisma: PinStore,
  businessId: string,
  pin: string,
  exceptUserId?: string,
): Promise<void> {
  const others = await prisma.user.findMany({
    where: { businessId, pinHash: { not: null }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true, pinHash: true },
  });
  if ((await usersWithPin(others, pin)).length > 0) {
    throw new ConflictException('That PIN is already in use by someone else. Choose a different one.');
  }
}
