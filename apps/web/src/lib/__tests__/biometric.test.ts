import { describe, expect, it } from 'vitest';
import { explainBiometricError } from '../biometric';
import { hasFeature } from '../featureGates';

const dom = (name: string, message = 'browser text') => new DOMException(message, name);

describe('explainBiometricError', () => {
  it('names every situation the browser reports as NotAllowedError, for sign-in and for registration', () => {
    const signIn = explainBiometricError(dom('NotAllowedError'), 'sign-in');
    expect(signIn).toMatch(/cancelled or timed out/);
    expect(signIn).toMatch(/no fingerprint saved for this site/);
    expect(signIn).toMatch(/PIN/);
    expect(explainBiometricError(dom('NotAllowedError'), 'register')).toMatch(/registration was cancelled or timed out/);
  });

  it('explains the other browser errors in words', () => {
    expect(explainBiometricError(dom('InvalidStateError'), 'register')).toMatch(/already registered/);
    expect(explainBiometricError(dom('SecurityError'), 'sign-in')).toMatch(/https/);
    expect(explainBiometricError(dom('NotSupportedError'), 'sign-in')).toMatch(/does not support/);
    expect(explainBiometricError(dom('AbortError'), 'sign-in')).toMatch(/stopped/);
  });

  it('passes our own server messages through unchanged', () => {
    const server = new Error('No fingerprint or Face ID is registered for this account. Use your PIN.');
    expect(explainBiometricError(server, 'sign-in')).toBe(server.message);
  });

  it('never says nothing', () => {
    expect(explainBiometricError(new Error(''), 'sign-in')).toMatch(/failed/);
    expect(explainBiometricError(undefined, 'register')).toMatch(/failed/);
  });
});

describe('who may register a fingerprint (Settings > Users)', () => {
  const can = (plan: string | undefined, status: string | undefined, tier: string | undefined) => hasFeature(plan, 'biometric', status, tier);

  it('is open to a business on its trial, whatever its plan name says (the bug: the button was hidden)', () => {
    expect(can('FREE', 'TRIAL', 'FREE')).toBe(true);
  });

  it('is a PRO feature otherwise', () => {
    expect(can('PRO', 'ACTIVE', 'PRO')).toBe(true);
    expect(can('ENTERPRISE', 'ACTIVE', 'ENTERPRISE')).toBe(true);
    expect(can('FREE', 'ACTIVE', 'FREE')).toBe(false);
    expect(can('GROWTH', 'ACTIVE', 'GROWTH')).toBe(false);
  });
});
