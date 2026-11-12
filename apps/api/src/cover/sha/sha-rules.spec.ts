import { classifyCoverage, cleanIdentifier, hostAllowed, interpretEligibility, outcomeOf, validateBaseUrl, validatePath } from './sha-rules';

describe('validateBaseUrl', () => {
  it('accepts SHA and DHA hosts over https and tidies the address', () => {
    expect(validateBaseUrl('https://ilm-dev.dha.go.ke/uat-middleware/api/v1/', [])).toBe('https://ilm-dev.dha.go.ke/uat-middleware/api/v1');
    expect(validateBaseUrl(' https://api.sha.go.ke/api/v1?x=1#y ', [])).toBe('https://api.sha.go.ke/api/v1');
  });
  it('refuses http, other hosts, look-alikes, IP addresses, credentials and rubbish', () => {
    for (const bad of ['http://ilm-dev.dha.go.ke/api', 'https://example.com/api', 'https://dha.go.ke.evil.com/api', 'https://evil-dha.go.ke/x', 'https://127.0.0.1/api', 'https://10.0.0.5/api', 'https://user:pw@ilm-dev.dha.go.ke/', 'ftp://x.dha.go.ke', 'not a url', '']) {
      expect(() => validateBaseUrl(bad, [])).toThrow();
    }
  });
  it('an operator-allowed host may be plain http, for a gateway or a test', () => {
    expect(validateBaseUrl('http://localhost:4010/api/v1', ['localhost'])).toBe('http://localhost:4010/api/v1');
    expect(() => validateBaseUrl('http://localhost:4010/api/v1', [])).toThrow();
    expect(hostAllowed('gw.example', ['gw.example'])).toBe(true);
  });
});

describe('validatePath', () => {
  it('takes a plain path only', () => {
    expect(validatePath('/patients/eligibility', 'Path')).toBe('/patients/eligibility');
    for (const bad of ['patients', '/a/../b', '//x', 'http://x', '/a b', '']) expect(() => validatePath(bad, 'Path')).toThrow(/must be a path/);
  });
});

describe('classifyCoverage', () => {
  it('reads clear wording and leaves the rest unknown', () => {
    for (const s of ['ACTIVE', 'Active', 'Active Coverage', 'eligible', 'true', 'Yes', true]) expect(classifyCoverage(s)).toBe('ELIGIBLE');
    for (const s of ['INACTIVE', 'Not Active', 'inactive', 'Ineligible', 'Not Eligible', 'expired', 'Suspended', 'in arrears', 'false', 'No', false]) expect(classifyCoverage(s)).toBe('NOT_ELIGIBLE');
    for (const s of ['', null, undefined, 'PENDING', 'under review', 42]) expect(classifyCoverage(s)).toBe('UNKNOWN');
  });
  it('"not active" is never read as active', () => {
    expect(classifyCoverage('Not Active')).toBe('NOT_ELIGIBLE');
    expect(classifyCoverage('No active coverage')).toBe('NOT_ELIGIBLE');
  });
});

describe('interpretEligibility', () => {
  const answer = (schemes: unknown[], more: Record<string, unknown> = {}) => ({ fullName: 'Jane Doe', memberCrNumber: 'CR-123', isAlive: true, schemes, ...more });
  const scheme = (schemeName: string, status: string, extra: Record<string, unknown> = {}) => ({ schemeName, coverage: { status, ...extra } });

  it('eligible when any scheme is clearly active', () => {
    const r = interpretEligibility(answer([scheme('SHIF', 'Active', { endDate: '2027-01-01' }), scheme('ECCIF', 'Inactive', { reason: 'Not registered' })]));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.memberCrNumber).toBe('CR-123');
    expect(r.summary).toContain('SHIF: Active');
    expect(r.schemes[0].endDate).toBe('2027-01-01');
  });
  it('not eligible only when every scheme clearly says so', () => {
    const r = interpretEligibility(answer([scheme('SHIF', 'Inactive', { reason: 'Contributions overdue' })]));
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.summary).toContain('Contributions overdue');
  });
  it('anything unclear is unknown, never eligible', () => {
    expect(interpretEligibility(answer([scheme('SHIF', 'PENDING')])).verdict).toBe('UNKNOWN');
    expect(interpretEligibility(answer([scheme('SHIF', 'Inactive'), scheme('PMF', 'PENDING')])).verdict).toBe('UNKNOWN');
    expect(interpretEligibility(answer([])).verdict).toBe('UNKNOWN');
    expect(interpretEligibility(null).verdict).toBe('UNKNOWN');
    expect(interpretEligibility('rubbish').verdict).toBe('UNKNOWN');
  });
  it('a person recorded as deceased is never eligible, whatever the coverage says', () => {
    const r = interpretEligibility(answer([scheme('SHIF', 'Active')], { isAlive: false }));
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.deceased).toBe(true);
  });
});

describe('outcomeOf and cleanIdentifier', () => {
  it('turns statuses into plain words', () => {
    expect(outcomeOf(200)).toEqual({ kind: 'OK' });
    expect(outcomeOf(404).kind).toBe('NOT_FOUND');
    expect(outcomeOf(400).kind).toBe('BAD_INPUT');
    expect(outcomeOf(401).kind).toBe('AUTH');
    expect(outcomeOf(403).kind).toBe('AUTH');
    expect(outcomeOf(503).kind).toBe('DOWN');
  });
  it('checks the identifier before anything is sent', () => {
    expect(cleanIdentifier('National ID', ' 12345678 ')).toEqual({ type: 'National ID', number: '12345678' });
    expect(() => cleanIdentifier('Passport', '123456')).toThrow(/Identifier type/);
    expect(() => cleanIdentifier('National ID', '1')).toThrow(/identifier number/);
    expect(() => cleanIdentifier('National ID', '12; DROP')).toThrow(/identifier number/);
  });
});
