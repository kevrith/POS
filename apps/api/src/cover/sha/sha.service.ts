import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { oneOf, optionalText, text } from '../../common/validate';
import { openSecret, sealSecret } from '../../common/secret-box';
import { CoverService } from '../cover.service';
import { cleanIdentifier, interpretEligibility, outcomeOf, UAT_BASE_URL, validateBaseUrl, validatePath, type Interpretation } from './sha-rules';

interface Actor { id: string; name: string }
type Http = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

const TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_MS = 5 * 60_000;

/** Why a call to SHA failed before an answer came back. */
class Unreachable extends Error {}

@Injectable()
export class ShaService {
  private readonly logger = new Logger(ShaService.name);
  /** Swapped in tests. */
  http: Http = (url, init) => fetch(url, init);
  private tokens = new Map<string, { token: string; until: number; version: number }>();

  constructor(private prisma: PrismaService, private cover: CoverService) {}

  // ── the facility's own connection settings ──────────────────────────────────────────────────────────────────────

  private row(businessId: string) {
    return this.prisma.shaConnection.findFirst({ where: { businessId } });
  }

  /** What the settings screen shows. The secret is never sent back: only whether one is stored. */
  async getConfig(businessId: string) {
    const c = await this.row(businessId);
    return {
      defaults: { baseUrl: UAT_BASE_URL, tokenPath: '/tenants/token', eligibilityPath: '/patients/eligibility', tokenFormat: 'json' },
      connection: c && { baseUrl: c.baseUrl, clientId: c.clientId, facilityCode: c.facilityCode, tokenPath: c.tokenPath, eligibilityPath: c.eligibilityPath, tokenFormat: c.tokenFormat, enabled: c.enabled, secretSet: true, lastTestAt: c.lastTestAt, lastTestOk: c.lastTestOk, lastTestMessage: c.lastTestMessage },
    };
  }

  /** Whether clerks can use "Check with SHA". Says nothing about the credentials themselves. */
  async status(businessId: string) {
    const c = await this.prisma.shaConnection.findFirst({ where: { businessId }, select: { enabled: true } });
    return { configured: !!c, enabled: !!c?.enabled };
  }

  async saveConfig(businessId: string, dto: Record<string, unknown>, actor: Actor) {
    const existing = await this.row(businessId);
    const secret = typeof dto.clientSecret === 'string' ? dto.clientSecret.trim() : '';
    if (!existing && !secret) throw new BadRequestException('Enter the client secret SHA gave you');
    const data = {
      baseUrl: validateBaseUrl(dto.baseUrl),
      clientId: text(dto.clientId, 'Client id', 200),
      facilityCode: text(dto.facilityCode, 'Facility code', 60),
      tokenPath: dto.tokenPath === undefined || dto.tokenPath === '' ? '/tenants/token' : validatePath(dto.tokenPath, 'Token path'),
      eligibilityPath: dto.eligibilityPath === undefined || dto.eligibilityPath === '' ? '/patients/eligibility' : validatePath(dto.eligibilityPath, 'Eligibility path'),
      tokenFormat: oneOf(String(dto.tokenFormat ?? 'json'), 'Token request format', ['json', 'form'] as const),
      enabled: dto.enabled === undefined ? true : dto.enabled === true,
      updatedBy: actor.name,
      // Changing anything about the connection clears the last test result, which no longer describes it.
      lastTestAt: null, lastTestOk: null, lastTestMessage: null,
      ...(secret ? { clientSecretEnc: sealSecret(secret) } : {}),
    };
    if (existing) await this.prisma.shaConnection.updateMany({ where: { id: existing.id, businessId }, data });
    else await this.prisma.shaConnection.create({ data: { ...data, businessId, clientSecretEnc: sealSecret(secret) } });
    this.tokens.delete(businessId);
    return this.getConfig(businessId);
  }

  async removeConfig(businessId: string) {
    await this.prisma.shaConnection.deleteMany({ where: { businessId } });
    this.tokens.delete(businessId);
    return { ok: true };
  }

  // ── talking to SHA ──────────────────────────────────────────────────────────────────────────────────────────────

  private async call(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    try {
      const res = await this.http(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const raw = await res.text();
      let body: unknown = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      return { status: res.status, body };
    } catch (err) {
      const timedOut = (err as { name?: string })?.name === 'TimeoutError' || (err as { name?: string })?.name === 'AbortError';
      throw new Unreachable(timedOut ? 'SHA did not answer in time' : 'SHA\'s service could not be reached');
    }
  }

  /** A token for this facility, kept until shortly before it expires and dropped when the settings change. */
  private async token(c: NonNullable<Awaited<ReturnType<ShaService['row']>>>, fresh = false): Promise<string> {
    const version = c.updatedAt.getTime();
    const hit = this.tokens.get(c.businessId);
    if (!fresh && hit && hit.version === version && hit.until > Date.now()) return hit.token;
    const secret = openSecret(c.clientSecretEnc);
    const form = c.tokenFormat === 'form';
    const res = await this.call(`${validateBaseUrl(c.baseUrl)}${c.tokenPath}`, {
      method: 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', Accept: 'application/json' },
      body: form ? new URLSearchParams({ client_id: c.clientId, client_secret: secret }).toString() : JSON.stringify({ client_id: c.clientId, client_secret: secret }),
    });
    const out = outcomeOf(res.status);
    if (out.kind !== 'OK') throw new BadRequestException(out.kind === 'AUTH' || out.kind === 'BAD_INPUT' || out.kind === 'NOT_FOUND' ? 'SHA did not accept the facility\'s client id and secret (or the token path is wrong). Check them under SHA connection.' : out.message);
    const b = (res.body ?? {}) as Record<string, unknown>;
    const token = typeof b.access_token === 'string' ? b.access_token : '';
    if (!token) throw new BadRequestException('SHA answered the sign-in but sent no access token. The token path or request format may be wrong.');
    const secs = typeof b.expires_in === 'number' && b.expires_in > 90 ? b.expires_in * 1000 - 60_000 : DEFAULT_TOKEN_MS;
    this.tokens.set(c.businessId, { token, until: Date.now() + secs, version });
    return token;
  }

  /** Sign in only, to prove the credentials work. Records the result on the connection so the screen can show it. */
  async test(businessId: string) {
    const c = await this.row(businessId);
    if (!c) throw new NotFoundException('SHA is not set up yet');
    let ok = false;
    let message: string;
    try {
      await this.token(c, true);
      ok = true;
      message = 'Signed in to SHA with these credentials.';
    } catch (err) {
      message = err instanceof Unreachable ? `${err.message}. Check the service address and your internet connection.` : err instanceof BadRequestException ? String(err.message) : 'The test failed.';
      if (!(err instanceof Unreachable) && !(err instanceof BadRequestException)) this.logger.warn(`SHA test failed: ${String(err)}`);
    }
    await this.prisma.shaConnection.updateMany({ where: { id: c.id, businessId }, data: { lastTestAt: new Date(), lastTestOk: ok, lastTestMessage: message.slice(0, 300) } });
    return { ok, message };
  }

  /**
   * Ask SHA whether this person is covered, and record the answer as a cover check made by the integration. Only a clear
   * "active" or "not active" is recorded as eligible or not eligible; an answer that cannot be read is recorded as "could not
   * check" with what SHA said, so a person decides. A failure to reach SHA, or a refusal of the credentials, records nothing.
   */
  async checkEligibility(businessId: string, dto: { patientId?: string; providerId?: string; visitId?: string; identificationType?: string; identificationNumber?: string }, actor: Actor) {
    const c = await this.row(businessId);
    if (!c || !c.enabled) throw new BadRequestException('SHA is not connected. An owner or manager sets it up under Insurance Claims, SHA connection. Until then, record the result by hand.');
    const id = cleanIdentifier(dto.identificationType, dto.identificationNumber);
    const patientId = text(dto.patientId, 'Patient', 64);
    const [patient, provider] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: patientId, businessId }, select: { id: true } }),
      this.prisma.insuranceProvider.findFirst({ where: { id: text(dto.providerId, 'Insurer', 64), businessId, kind: 'SHA', isActive: true }, select: { id: true } }),
    ]);
    if (!patient) throw new NotFoundException('Patient not found');
    if (!provider) throw new BadRequestException('That insurer is not set up as SHA');

    const query = `?identification_number=${encodeURIComponent(id.number)}&identification_type=${encodeURIComponent(id.type)}`;
    const send = async (token: string) => this.call(`${validateBaseUrl(c.baseUrl)}${c.eligibilityPath}${query}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Facility-Id': c.facilityCode, 'X-Facility-Id-Type': 'fr-code' },
    });
    let res: { status: number; body: unknown };
    try {
      res = await send(await this.token(c));
      // A token that has expired early is replaced once, not argued with.
      if (res.status === 401) res = await send(await this.token(c, true));
    } catch (err) {
      if (err instanceof Unreachable) return { recorded: false as const, verdict: 'UNREACHABLE' as const, message: `${err.message}. Record the result by hand, or try again.` };
      // Signing in failed (wrong or changed credentials, or an unreadable stored secret): nothing is recorded and the message says where to look.
      if (err instanceof BadRequestException) return { recorded: false as const, verdict: 'AUTH' as const, message: String(err.message) };
      throw err;
    }
    const outcome = outcomeOf(res.status);
    if (outcome.kind === 'AUTH' || outcome.kind === 'BAD_INPUT' || outcome.kind === 'DOWN') return { recorded: false as const, verdict: outcome.kind, message: outcome.message };

    let read: Interpretation;
    if (outcome.kind === 'NOT_FOUND') read = { verdict: 'NOT_ELIGIBLE', summary: outcome.message, memberCrNumber: null, fullName: null, schemes: [], deceased: false };
    else read = interpretEligibility(res.body);

    const status = read.verdict === 'ELIGIBLE' ? 'ELIGIBLE' : read.verdict === 'NOT_ELIGIBLE' ? 'NOT_ELIGIBLE' : 'UNAVAILABLE';
    const numbers = [id.number];
    if (read.memberCrNumber && read.memberCrNumber.replace(/\s+/g, '').toLowerCase() !== id.number.replace(/\s+/g, '').toLowerCase()) numbers.push(read.memberCrNumber);
    const checks = [];
    for (const memberNumber of numbers) {
      checks.push(await this.cover.recordCheck(businessId, { patientId, providerId: provider.id, visitId: dto.visitId, memberNumber, status, reference: read.memberCrNumber ? `CR ${read.memberCrNumber}` : undefined, notes: optionalText(`SHA: ${read.summary}`, 'Notes', 300) }, actor, 'SHA_API'));
    }
    return {
      recorded: true as const, verdict: read.verdict, status, summary: read.summary, schemes: read.schemes, memberCrNumber: read.memberCrNumber, fullName: read.fullName,
      checkIds: checks.map((k) => k.id),
      message: read.verdict === 'UNKNOWN' ? 'SHA answered, but the coverage could not be read as active or inactive. It is noted as "could not check": decide from what SHA said below, and record the result by hand if you are sure.' : undefined,
    };
  }
}
