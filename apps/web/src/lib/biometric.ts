/**
 * Biometric Authentication — WebAuthn (FIDO2) API.
 *
 * Supports fingerprint, Face ID, Windows Hello, and any platform authenticator.
 * Used for:
 *   1. Staff login at POS terminal (replaces PIN for supported devices)
 *   2. Manager approval for price overrides / voids
 *   3. Secure access to reports
 *
 * The credential is stored on the device. The server receives a signed
 * assertion which it verifies against the stored public key.
 */

/** Returns true if the platform supports biometric authentication. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface BiometricRegistrationOptions {
  userId: string;
  userName: string;
  displayName: string;
  /** RP ID — should match the domain, e.g. "pos.kastra.co.ke" */
  rpId?: string;
  rpName?: string;
}

export interface BiometricCredential {
  credentialId: string;
  publicKey: string;
  userId: string;
}

/**
 * Register a new biometric credential for a user.
 * Returns the credential ID and public key to store server-side.
 */
export async function registerBiometric(
  opts: BiometricRegistrationOptions,
): Promise<BiometricCredential> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(opts.userId);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        id: opts.rpId ?? window.location.hostname,
        name: opts.rpName ?? 'Kastra POS',
      },
      user: {
        id: userIdBytes,
        name: opts.userName,
        displayName: opts.displayName,
      },
      pubKeyCredParams: [
        { alg: -7,   type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  }) as PublicKeyCredential;

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = bufferToBase64url(credential.rawId);
  const publicKey = bufferToBase64url(response.getPublicKey()!);

  return { credentialId, publicKey, userId: opts.userId };
}

// ─── Authentication ───────────────────────────────────────────────────────────

export interface BiometricAuthOptions {
  /** Credential IDs previously registered for this user */
  credentialIds: string[];
  rpId?: string;
  /** Challenge from the server (base64url) */
  challenge?: string;
}

export interface BiometricAuthResult {
  credentialId: string;
  /** Signed assertion — send to server for verification */
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
}

/**
 * Authenticate using a registered biometric credential.
 * The returned assertion should be sent to the server for verification.
 */
export async function authenticateBiometric(
  opts: BiometricAuthOptions,
): Promise<BiometricAuthResult> {
  const challenge = opts.challenge
    ? base64urlToBuffer(opts.challenge)
    : crypto.getRandomValues(new Uint8Array(32));

  const allowCredentials = opts.credentialIds.map((id) => ({
    id: base64urlToBuffer(id),
    type: 'public-key' as const,
    transports: ['internal'] as AuthenticatorTransport[],
  }));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: opts.rpId ?? window.location.hostname,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    credentialId: bufferToBase64url(assertion.rawId),
    signature: bufferToBase64url(response.signature),
    authenticatorData: bufferToBase64url(response.authenticatorData),
    clientDataJSON: bufferToBase64url(response.clientDataJSON),
  };
}

/**
 * Quick biometric prompt — resolves true if the user verifies successfully,
 * false if they cancel or it fails. Used for manager approval flows.
 */
export async function promptBiometric(credentialIds: string[]): Promise<boolean> {
  try {
    await authenticateBiometric({ credentialIds });
    return true;
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
