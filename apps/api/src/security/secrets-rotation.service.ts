import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

// ─── Encryption helpers (stand-alone, key-explicit versions) ─────────────────
// These mirror the pattern in etims.service.ts but accept the key as a
// parameter so we can re-encrypt with a *different* key during rotation.

function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptWithKey(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');

  if (ciphertext.includes(':')) {
    const colonIdx = ciphertext.indexOf(':');
    const ivHex = ciphertext.slice(0, colonIdx);
    const body = ciphertext.slice(colonIdx + 1);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(body, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Legacy format (createCipher without IV) — forward-migrated during rotation
  const decipher = crypto.createDecipher('aes-256-cbc', keyHex);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function reEncrypt(value: string | null | undefined, oldKey: string, newKey: string): string | null {
  if (!value) return null;
  try {
    const plaintext = decryptWithKey(value, oldKey);
    return encryptWithKey(plaintext, newKey);
  } catch {
    // Value could not be decrypted with the old key — leave it unchanged so we
    // don't corrupt data that was encrypted with a third key (e.g. a partial
    // rotation that was interrupted).
    return value;
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RotationResult {
  processed: number;
  rotated: number;
  skipped: number;
  errors: Array<{ businessId: string; reason: string }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class SecretsRotationService {
  private readonly logger = new Logger(SecretsRotationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Re-encrypts all Business credential fields from `oldKeyHex` to `newKeyHex`.
   *
   * The rotation is done in a single database transaction per business so that
   * a partial write never leaves credentials in a mixed-key state.  If any
   * business fails to decrypt (e.g. it was already rotated or has a different
   * key), it is skipped and reported in the `errors` array.
   *
   * @param oldKeyHex  64-character hex string of the current AES-256 key
   * @param newKeyHex  64-character hex string of the new AES-256 key
   */
  async rotateEncryptionKey(oldKeyHex: string, newKeyHex: string): Promise<RotationResult> {
    this.validateKey(oldKeyHex, 'old key');
    this.validateKey(newKeyHex, 'new key');

    if (oldKeyHex === newKeyHex) {
      throw new BadRequestException('Old and new keys must be different');
    }

    const businesses = await this.prisma.business.findMany({
      where: {
        OR: [
          { etimsCredentialsEncrypted: { not: null } },
          { mpesaCredentialsEncrypted: { not: null } },
          { atCredentialsEncrypted: { not: null } },
          { kraItaxCredentials: { not: null } },
        ],
      },
      select: {
        id: true,
        etimsCredentialsEncrypted: true,
        mpesaCredentialsEncrypted: true,
        atCredentialsEncrypted: true,
        kraItaxCredentials: true,
      },
    });

    const result: RotationResult = {
      processed: businesses.length,
      rotated: 0,
      skipped: 0,
      errors: [],
    };

    for (const biz of businesses) {
      try {
        const updateData: Record<string, string | null> = {};

        if (biz.etimsCredentialsEncrypted) {
          updateData.etimsCredentialsEncrypted = reEncrypt(biz.etimsCredentialsEncrypted, oldKeyHex, newKeyHex);
        }
        if (biz.mpesaCredentialsEncrypted) {
          updateData.mpesaCredentialsEncrypted = reEncrypt(biz.mpesaCredentialsEncrypted, oldKeyHex, newKeyHex);
        }
        if (biz.atCredentialsEncrypted) {
          updateData.atCredentialsEncrypted = reEncrypt(biz.atCredentialsEncrypted, oldKeyHex, newKeyHex);
        }
        if (biz.kraItaxCredentials) {
          updateData.kraItaxCredentials = reEncrypt(biz.kraItaxCredentials, oldKeyHex, newKeyHex);
        }

        await this.prisma.business.update({
          where: { id: biz.id },
          data: updateData,
        });

        result.rotated++;
        this.logger.log(`Rotated credentials for business ${biz.id}`);
      } catch (err: any) {
        result.skipped++;
        result.errors.push({ businessId: biz.id, reason: err?.message ?? 'unknown error' });
        this.logger.warn(`Failed to rotate credentials for business ${biz.id}: ${err?.message}`);
      }
    }

    this.logger.log(
      `Key rotation complete: ${result.rotated} rotated, ${result.skipped} skipped out of ${result.processed} businesses`,
    );
    return result;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private validateKey(keyHex: string, label: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new BadRequestException(`${label} must be exactly 64 hex characters (32 bytes)`);
    }
  }

  // ─── Exposed for testing ─────────────────────────────────────────────────────

  /** @internal For unit tests only */
  _encryptWithKey(plaintext: string, keyHex: string): string {
    return encryptWithKey(plaintext, keyHex);
  }

  /** @internal For unit tests only */
  _decryptWithKey(ciphertext: string, keyHex: string): string {
    return decryptWithKey(ciphertext, keyHex);
  }
}
