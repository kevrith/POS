import * as crypto from 'crypto';

/**
 * Check the signature a fingerprint / Face ID / Windows Hello device made over `signedData`
 * (authenticatorData followed by the SHA-256 of clientDataJSON).
 *
 * Uses Node's own `crypto.verify`, which reads the signature exactly as the device writes it: an ASN.1 DER
 * `ECDSA-Sig-Value` for ES256 keys (Touch ID, Android, many Windows Hello setups), PKCS#1 v1.5 for RS256 keys (other
 * Windows Hello setups). This used to go through WebCrypto, whose ECDSA `verify` expects the raw 64-byte r||s form instead,
 * so EVERY ES256 sign-in was refused with "Signature verification failed" even though registration had worked.
 *
 * `publicKeyDer` is the SubjectPublicKeyInfo from `response.getPublicKey()`. Returns false, never throws, for anything it
 * cannot verify (a damaged key, the wrong key type, a bad signature).
 */
export function verifyAssertionSignature(publicKeyDer: Buffer, signedData: Buffer, signature: Buffer): boolean {
  try {
    const key = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' && key.asymmetricKeyType !== 'rsa') return false;
    return crypto.verify('sha256', signedData, key, signature);
  } catch {
    return false;
  }
}
