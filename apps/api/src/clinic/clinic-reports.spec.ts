import { ageAt, demographics, doctorWorkload, labSummary, nairobiDay, resolveRange, revenueByService, statusCounts, topDiagnoses, visitsPerDay, waitStats, type PatientRow, type VisitRow } from './clinic-reports';

const at = (iso: string) => new Date(iso);
const visit = (o: Partial<VisitRow> = {}): VisitRow => ({
  id: 'v', status: 'COMPLETED', priority: 'NORMAL', createdAt: at('2026-11-10T06:00:00Z'), triagedAt: at('2026-11-10T06:10:00Z'), consultStartedAt: at('2026-11-10T06:30:00Z'),
  consultEndedAt: at('2026-11-10T06:50:00Z'), completedAt: at('2026-11-10T07:00:00Z'), doctorId: 'd1', doctorName: 'Dr Doe', patientId: 'p1', diagnoses: '[]', ...o,
});
const patients = (list: Array<[string, string | null, string | null]>): Map<string, PatientRow> =>
  new Map(list.map(([id, sex, dob]) => [id, { id, sex, dateOfBirth: dob ? at(dob) : null }]));

describe('resolveRange', () => {
  const now = at('2026-11-12T10:00:00Z');
  it('defaults to the last 30 days ending today in Nairobi', () => {
    const r = resolveRange(undefined, undefined, now);
    expect(r.to).toBe('2026-11-12');
    expect(r.from).toBe('2026-10-14');
    expect(r.days).toHaveLength(30);
  });
  it('is inclusive and starts and ends on Nairobi midnight', () => {
    const r = resolveRange('2026-11-01', '2026-11-03', now);
    expect(r.days).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(r.start.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-03T20:59:59.999Z');
  });
  it('refuses nonsense, a backwards range and more than a year', () => {
    expect(() => resolveRange('2026-13-01', '2026-11-03', now)).toThrow(/like 2026-11-30/);
    expect(() => resolveRange('2026-02-30', '2026-03-03', now)).toThrow(/like 2026-11-30/);
    expect(() => resolveRange('2026-11-05', '2026-11-03', now)).toThrow(/after the end/);
    expect(() => resolveRange('2025-01-01', '2026-11-03', now)).toThrow(/at most 366/);
  });
});

describe('visitsPerDay', () => {
  it('counts by Nairobi day, fills empty days, and splits completed and cancelled', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-12'];
    const rows = visitsPerDay([
      visit(), visit({ status: 'CANCELLED' }),
      visit({ createdAt: at('2026-11-10T21:30:00Z') }), // 00:30 on the 11th in Nairobi
      visit({ createdAt: at('2026-11-20T10:00:00Z') }), // outside
    ], days);
    expect(rows).toEqual([{ date: '2026-11-10', total: 2, completed: 1, cancelled: 1 }, { date: '2026-11-11', total: 1, completed: 1, cancelled: 0 }, { date: '2026-11-12', total: 0, completed: 0, cancelled: 0 }]);
    expect(nairobiDay(at('2026-11-10T21:30:00Z'))).toBe('2026-11-11');
  });
  it('counts statuses', () => {
    expect(statusCounts([visit(), visit(), visit({ status: 'WAITING' })])).toEqual({ COMPLETED: 2, WAITING: 1 });
  });
});

describe('waitStats', () => {
  it('averages the waits and the consultation, ignoring visits that never got that far', () => {
    const s = waitStats([visit(), visit({ triagedAt: at('2026-11-10T06:20:00Z'), consultStartedAt: null, consultEndedAt: null })]);
    expect(s.toTriage).toEqual({ avg: 15, n: 2 });
    expect(s.toDoctor).toEqual({ avg: 30, n: 1 });
    expect(s.consultation).toEqual({ avg: 20, n: 1 });
    expect(waitStats([]).toTriage).toEqual({ avg: null, n: 0 });
  });
});

describe('ageAt', () => {
  it('is the age on the day, and unknown without a birth date', () => {
    expect(ageAt(at('2021-11-11T00:00:00Z'), at('2026-11-10T06:00:00Z'))).toBe(4);
    expect(ageAt(at('2021-11-10T00:00:00Z'), at('2026-11-10T06:00:00Z'))).toBe(5);
    expect(ageAt(null, at('2026-11-10T06:00:00Z'))).toBeNull();
  });
});

describe('topDiagnoses', () => {
  const dx = (...d: Array<{ code?: string; label: string; icd11?: string }>) => JSON.stringify(d);
  const pts = patients([['child', 'F', '2023-01-01'], ['adult', 'M', '1990-05-05'], ['nodob', null, null]]);

  it('counts a diagnosis once per visit and splits under 5 from everyone else', () => {
    const rows = topDiagnoses([
      visit({ patientId: 'child', diagnoses: dx({ code: 'B50.9', label: 'Malaria' }, { code: 'B50.9', label: 'Malaria again' }) }),
      visit({ patientId: 'adult', diagnoses: dx({ code: 'B50.9', label: 'Malaria', icd11: '1F40' }, { code: 'I10', label: 'Hypertension' }) }),
      visit({ patientId: 'nodob', status: 'READY_TO_BILL', diagnoses: dx({ code: 'B50.9', label: 'Malaria' }) }),
    ], pts);
    expect(rows[0]).toMatchObject({ code: 'B50.9', icd11: '1F40', total: 3, under5: 1, fiveAndOver: 1, unknownAge: 1 });
    expect(rows[1]).toMatchObject({ code: 'I10', total: 1, fiveAndOver: 1 });
  });

  it('leaves out visits still in progress and cancelled ones, and groups free-text by label', () => {
    const rows = topDiagnoses([
      visit({ status: 'IN_CONSULTATION', diagnoses: dx({ label: 'Cough' }) }),
      visit({ status: 'CANCELLED', diagnoses: dx({ label: 'Cough' }) }),
      visit({ patientId: 'adult', diagnoses: dx({ label: 'Back pain' }) }),
      visit({ patientId: 'adult', diagnoses: dx({ label: 'BACK PAIN' }) }),
    ], pts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Back pain', total: 2, code: null });
  });

  it('keeps only the top few', () => {
    const many = Array.from({ length: 30 }, (_, i) => visit({ diagnoses: dx({ label: `D${i}` }) }));
    expect(topDiagnoses(many, pts, 10)).toHaveLength(10);
  });
});

describe('doctorWorkload', () => {
  it('counts what each doctor did, busiest first, and ignores visits nobody took in', () => {
    const rows = doctorWorkload([
      visit({ patientId: 'a' }), visit({ patientId: 'a', status: 'READY_TO_BILL' }), visit({ patientId: 'b' }),
      visit({ doctorId: 'd2', doctorName: 'Dr Roe', patientId: 'c' }),
      visit({ consultStartedAt: null, doctorId: null, doctorName: null, status: 'WAITING' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ doctorName: 'Dr Doe', seen: 3, completed: 2, patients: 2, avgConsultMinutes: 20, avgWaitMinutes: 30 });
    expect(rows[1]).toMatchObject({ doctorName: 'Dr Roe', seen: 1 });
  });
});

describe('demographics', () => {
  it('counts each person once, by sex and age band at their first visit, leaving out cancelled visits', () => {
    const pts = patients([['a', 'F', '2024-01-01'], ['b', 'M', '1950-01-01'], ['c', 'F', null], ['d', 'M', '1990-01-01']]);
    const d = demographics([
      visit({ patientId: 'a' }), visit({ patientId: 'a', createdAt: at('2026-11-11T06:00:00Z') }), visit({ patientId: 'b' }), visit({ patientId: 'c' }),
      visit({ patientId: 'd', status: 'CANCELLED' }),
    ], pts);
    expect(d.patients).toBe(3);
    expect(d.sex).toEqual({ F: 2, M: 1, other: 0 });
    expect(Object.fromEntries(d.ageBands.map((b) => [b.band, b.count]))).toEqual({ '0-4': 1, '5-17': 0, '18-39': 0, '40-59': 0, '60+': 1, Unknown: 1 });
  });
});

describe('revenueByService and labSummary', () => {
  it('adds up services', () => {
    const r = revenueByService([{ visitId: 'v', name: 'Consultation', quantity: 1, unitPriceCents: 50000 }, { visitId: 'w', name: 'Consultation', quantity: 2, unitPriceCents: 50000 }, { visitId: 'v', name: 'Dressing', quantity: 1, unitPriceCents: 10000 }]);
    expect(r.totalCents).toBe(160000);
    expect(r.services[0]).toEqual({ name: 'Consultation', count: 3, totalCents: 150000 });
  });

  it('summarises the lab: ordered, released, turnaround and critical', () => {
    const s = labSummary([
      { testName: 'Hb', status: 'VERIFIED', hasCritical: true, createdAt: at('2026-11-10T06:00:00Z'), verifiedAt: at('2026-11-10T08:00:00Z') },
      { testName: 'Hb', status: 'VERIFIED', hasCritical: false, createdAt: at('2026-11-10T06:00:00Z'), verifiedAt: at('2026-11-10T07:00:00Z') },
      { testName: 'Hb', status: 'PENDING', hasCritical: false, createdAt: at('2026-11-10T06:00:00Z'), verifiedAt: null },
      { testName: 'Malaria', status: 'RESULTED', hasCritical: false, createdAt: at('2026-11-10T06:00:00Z'), verifiedAt: null },
    ]);
    expect(s.totalOrdered).toBe(4);
    expect(s.totalReleased).toBe(2);
    expect(s.tests[0]).toEqual({ testName: 'Hb', ordered: 3, released: 2, critical: 1, avgTurnaroundHours: 1.5 });
    expect(s.tests[1]).toMatchObject({ testName: 'Malaria', released: 0, avgTurnaroundHours: null });
  });
});
