import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/**
 * Encrypting a credential for storage (AES-256-CBC with the server's ENCRYPTION_KEY, a random IV each time).
 * Unlike older helpers it never falls back to a built-in key: with no valid key it refuses to store a secret at all.
 */
function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new BadRequestException('The server has no encryption key set, so a credential cannot be stored safely. Ask whoever runs the server to set ENCRYPTION_KEY.');
  return Buffer.from(hex, 'hex');
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key(), iv);
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex')}`;
}

export function openSecret(sealed: string): string {
  const [ivHex, data] = sealed.split(':');
  if (!ivHex || !data) throw new BadRequestException('The stored credential is unreadable. Enter it again.');
  try {
    const decipher = createDecipheriv('aes-256-cbc', key(), Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new BadRequestException('The stored credential cannot be read with this server\'s key. Enter it again.');
  }
}
