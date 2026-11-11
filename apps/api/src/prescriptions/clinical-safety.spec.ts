import { blockers, dailyDoseMg, dosesPerDay, evaluateSafety, normalizeDrugName, parseAllergies, parseStrength, type SafetyInput } from './clinical-safety';

const base = (o: Partial<SafetyInput> = {}): SafetyInput => ({
  patient: { name: 'Jane Doe', allergies: '[]' },
  lines: [{ name: 'Amoxicillin 500mg capsules' }],
  interactions: [],
  formulary: [],
  ...o,
});

describe('normalizeDrugName', () => {
  it('drops strength and pack words', () => {
    expect(normalizeDrugName('Warfarin 5 mg tablets')).toBe('warfarin');
    expect(normalizeDrugName('Augmentin 625mg (GSK)')).toBe('augmentin');
  });
});

describe('parseAllergies', () => {
  it('reads stored JSON, bare strings and rubbish', () => {
    expect(parseAllergies('[{"substance":"Penicillin","reaction":"rash"}]')).toEqual([{ substance: 'Penicillin', reaction: 'rash' }]);
    expect(parseAllergies(['Sulfa'])).toEqual([{ substance: 'Sulfa' }]);
    expect(parseAllergies('not json')).toEqual([]);
    expect(parseAllergies('[{"substance":"  "}]')).toEqual([]);
    expect(parseAllergies(null)).toEqual([]);
  });
});

describe('allergies', () => {
  it('blocks the medicine itself', () => {
    const w = evaluateSafety(base({ patient: { name: 'Jane', allergies: [{ substance: 'amoxicillin' }] } }));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'ALLERGY', severity: 'BLOCK', drugs: ['Amoxicillin 500mg capsules'] });
  });

  it('blocks a medicine in the allergy family ("penicillin" stops amoxicillin and Augmentin)', () => {
    for (const name of ['Amoxicillin 500mg', 'Augmentin 625mg', 'Flucloxacillin capsules']) {
      const w = evaluateSafety(base({ lines: [{ name }], patient: { name: 'Jane', allergies: [{ substance: 'Penicillin', reaction: 'anaphylaxis' }] } }));
      expect(blockers(w)).toHaveLength(1);
    }
  });

  it('knows brand names through the item\'s generic name and class', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Panadol Extra', genericName: 'paracetamol' }, { name: 'Brufen 400', drugClass: 'NSAID' }], patient: { name: 'J', allergies: ['NSAIDs'] } }));
    expect(w.map((x) => x.drugs[0])).toEqual(['Brufen 400']);
  });

  it('warns, not blocks, on cross-reactivity (penicillin and a cephalosporin)', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Ceftriaxone 1g' }], patient: { name: 'J', allergies: ['Penicillin'] } }));
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('WARN');
  });

  it('does not flag an unrelated medicine', () => {
    expect(evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg' }], patient: { name: 'J', allergies: ['Penicillin'] } }))).toEqual([]);
  });

  it('says so when there is no patient record, and does not block', () => {
    const w = evaluateSafety(base({ patient: null }));
    expect(w).toEqual([expect.objectContaining({ kind: 'NO_PATIENT', severity: 'INFO' })]);
    expect(blockers(w)).toHaveLength(0);
  });
});

describe('interactions', () => {
  const warf = { drug1Name: 'Warfarin', drug2Name: 'Aspirin', severity: 'SEVERE', description: 'Bleeding risk' };

  it('finds a pair on the same prescription whatever the order or pack wording', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Aspirin 75mg tablets' }, { name: 'WARFARIN 5MG' }], interactions: [warf] }));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'INTERACTION', severity: 'BLOCK' });
    expect(w[0].message).toContain('Bleeding risk');
  });

  it('finds one with a medicine the patient is already taking', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Aspirin 75mg' }], alsoTaking: [{ name: 'Warfarin 5mg', from: 'RX-1' }], interactions: [warf] }));
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('already being taken');
  });

  it('grades by severity: moderate warns, mild is information', () => {
    const rows = [
      { drug1Name: 'A', drug2Name: 'B', severity: 'MODERATE', description: 'x' },
      { drug1Name: 'C', drug2Name: 'D', severity: 'MILD', description: 'y' },
    ];
    expect(evaluateSafety(base({ lines: [{ name: 'A' }, { name: 'B' }], interactions: rows }))[0].severity).toBe('WARN');
    expect(evaluateSafety(base({ lines: [{ name: 'C' }, { name: 'D' }], interactions: rows }))[0].severity).toBe('INFO');
  });

  it('reports a pair once', () => {
    const rows = [warf, { ...warf }];
    expect(evaluateSafety(base({ lines: [{ name: 'Warfarin' }, { name: 'Aspirin' }], interactions: rows }))).toHaveLength(1);
  });

  it('sees a brand as its generic through the catalogue', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Disprin' }, { name: 'Warfarin' }], interactions: [warf], brandToGeneric: new Map([['disprin', 'aspirin']]) }));
    expect(w).toHaveLength(1);
  });
});

describe('duplicates', () => {
  it('warns when the same medicine is on twice', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg' }, { name: 'Paracetamol 1g' }] }));
    expect(w).toEqual([expect.objectContaining({ kind: 'DUPLICATE', severity: 'WARN' })]);
  });
});

describe('doses', () => {
  it('doses a day for each frequency', () => {
    expect(dosesPerDay('TDS')).toBe(3);
    expect(dosesPerDay('q6h')).toBe(4);
    expect(dosesPerDay('QID')).toBe(4);
    expect(dosesPerDay('ON')).toBe(1);
    expect(dosesPerDay('PRN')).toBeNull();
    expect(dosesPerDay('whenever')).toBeNull();
  });

  it('reads strengths', () => {
    expect(parseStrength('500mg')).toEqual({ mg: 500 });
    expect(parseStrength('1 g')).toEqual({ mg: 1000 });
    expect(parseStrength('250mcg')).toEqual({ mg: 0.25 });
    expect(parseStrength('125mg/5ml')).toEqual({ mg: 125, perMl: 5 });
    expect(parseStrength('syrup')).toBeNull();
  });

  it('works out milligrams a day', () => {
    expect(dailyDoseMg({ dose: 2, doseUnit: 'tablet', frequency: 'TDS' }, '500mg')).toBe(3000);
    expect(dailyDoseMg({ dose: 5, doseUnit: 'ml', frequency: 'BD' }, '125mg/5ml')).toBe(250);
    expect(dailyDoseMg({ dose: 400, doseUnit: 'mg', frequency: 'TDS' })).toBe(1200);
    expect(dailyDoseMg({ dose: 2, doseUnit: 'tablet', frequency: 'PRN' }, '500mg')).toBeNull();
    expect(dailyDoseMg({ dose: 2, doseUnit: 'tablet', frequency: 'BD' }, 'no strength')).toBeNull();
  });

  const para = { genericName: 'Paracetamol', maxDailyDose: 4000, unit: 'mg' };

  it('blocks a daily dose above the formulary maximum', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg', dose: 3, doseUnit: 'tablet', frequency: 'QDS' }], formulary: [para] }));
    expect(w).toEqual([expect.objectContaining({ kind: 'MAX_DOSE', severity: 'BLOCK' })]);
    expect(w[0].message).toContain('6000');
  });

  it('allows a dose at the maximum, and says nothing when the dose cannot be worked out', () => {
    expect(evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg', dose: 2, doseUnit: 'tablet', frequency: 'QDS' }], formulary: [para] }))).toEqual([]);
    expect(evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg' }], formulary: [para] }))).toEqual([]);
  });

  it('reads the strength from the medicine\'s own name before the list\'s typical strength', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Paracetamol 1g tablets', dose: 2, doseUnit: 'tablet', frequency: 'QDS' }], formulary: [{ ...para, strength: '500mg' }] }));
    expect(w).toEqual([expect.objectContaining({ kind: 'MAX_DOSE' })]);
  });

  it('takes the maximum in grams', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Paracetamol 500mg', dose: 3, doseUnit: 'tablet', frequency: 'QDS' }], formulary: [{ genericName: 'Paracetamol', maxDailyDose: 4, unit: 'g' }] }));
    expect(w).toHaveLength(1);
  });
});

describe('pregnancy', () => {
  const entry = { genericName: 'Ibuprofen', contraindicationsText: 'Avoid in pregnancy (third trimester), peptic ulcer' };

  it('warns when the patient is pregnant', () => {
    const w = evaluateSafety(base({ lines: [{ name: 'Ibuprofen 400mg' }], patient: { name: 'J', allergies: '[]', pregnant: true }, formulary: [entry] }));
    expect(w).toEqual([expect.objectContaining({ kind: 'PREGNANCY', severity: 'WARN' })]);
  });

  it('is quiet when she is not', () => {
    expect(evaluateSafety(base({ lines: [{ name: 'Ibuprofen 400mg' }], formulary: [entry] }))).toEqual([]);
  });
});
