import type { LabParameter } from './lab-results';

/**
 * A starting list of common tests with usual adult reference ranges, so the lab can begin on day one. These are general
 * information, not a substitute for the ranges of the lab's own analysers and methods: the lab lead must review them.
 * Loading only adds tests whose name is not already in the catalogue, and never touches the ones that are.
 */
const num = (name: string, unit: string, low?: number, high?: number, extra: Partial<LabParameter> = {}): LabParameter => ({ name, kind: 'NUMERIC', unit, ...(low !== undefined ? { low } : {}), ...(high !== undefined ? { high } : {}), ...extra });
const pick = (name: string, choices: string[], abnormal: string[] = []): LabParameter => ({ name, kind: 'CHOICE', choices, ...(abnormal.length ? { abnormal } : {}) });
const reactive = (name = 'Result') => pick(name, ['Non-reactive', 'Reactive'], ['Reactive']);
const posNeg = (name = 'Result', abnormal = ['Positive']) => pick(name, ['Negative', 'Positive'], abnormal);
const report = (): LabParameter[] => [{ name: 'Findings', kind: 'TEXT' }, { name: 'Impression', kind: 'TEXT' }];
const dip = (name: string) => pick(name, ['Negative', 'Trace', '+', '++', '+++'], ['Trace', '+', '++', '+++']);

export interface StarterTest { name: string; code: string; category: string; specimen: string; parameters: LabParameter[]; turnaroundHours?: number }

export const STARTER_TESTS: readonly StarterTest[] = [
  { name: 'Malaria test (RDT / blood slide)', code: 'MAL', category: 'PARASITOLOGY', specimen: 'BLOOD', parameters: [posNeg()], turnaroundHours: 1 },
  { name: 'Full blood count', code: 'FBC', category: 'HAEMATOLOGY', specimen: 'BLOOD', turnaroundHours: 2, parameters: [
    num('Haemoglobin', 'g/dL', 13, 17, { lowF: 12, highF: 15, lowC: 11.5, highC: 15.5, critLow: 7 }),
    num('WBC', 'x10^9/L', 4, 11, { critLow: 2, critHigh: 30 }),
    num('Platelets', 'x10^9/L', 150, 450, { critLow: 20 }),
    num('Haematocrit', '%', 40, 52, { lowF: 36, highF: 48 }),
    num('MCV', 'fL', 80, 100),
  ] },
  { name: 'Haemoglobin', code: 'HB', category: 'HAEMATOLOGY', specimen: 'BLOOD', turnaroundHours: 1, parameters: [num('Haemoglobin', 'g/dL', 13, 17, { lowF: 12, highF: 15, lowC: 11.5, highC: 15.5, critLow: 7 })] },
  { name: 'ESR', code: 'ESR', category: 'HAEMATOLOGY', specimen: 'BLOOD', parameters: [num('ESR', 'mm/hr', 0, 15, { lowF: 0, highF: 20 })] },
  { name: 'Blood group and rhesus', code: 'GRP', category: 'HAEMATOLOGY', specimen: 'BLOOD', parameters: [pick('ABO group', ['A', 'B', 'AB', 'O']), pick('Rhesus', ['Positive', 'Negative'])] },
  { name: 'Random blood sugar', code: 'RBS', category: 'CHEMISTRY', specimen: 'BLOOD', turnaroundHours: 1, parameters: [num('Glucose', 'mmol/L', 3.9, 7.8, { critLow: 2.5, critHigh: 25 })] },
  { name: 'Fasting blood sugar', code: 'FBS', category: 'CHEMISTRY', specimen: 'BLOOD', turnaroundHours: 1, parameters: [num('Glucose', 'mmol/L', 3.9, 5.5, { critLow: 2.5, critHigh: 25 })] },
  { name: 'HbA1c', code: 'A1C', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('HbA1c', '%', 4, 5.6)] },
  { name: 'Urea and creatinine', code: 'UEC', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('Urea', 'mmol/L', 2.5, 7.8), num('Creatinine', 'umol/L', 62, 106, { lowF: 44, highF: 80 })] },
  { name: 'Electrolytes', code: 'ELE', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('Sodium', 'mmol/L', 135, 145, { critLow: 120, critHigh: 160 }), num('Potassium', 'mmol/L', 3.5, 5.1, { critLow: 2.5, critHigh: 6.5 })] },
  { name: 'Liver enzymes (ALT, AST)', code: 'LFT', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('ALT', 'U/L', 7, 55), num('AST', 'U/L', 8, 48)] },
  { name: 'Lipid profile', code: 'LIP', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('Total cholesterol', 'mmol/L', 0, 5.2), num('Triglycerides', 'mmol/L', 0, 1.7)] },
  { name: 'CRP', code: 'CRP', category: 'CHEMISTRY', specimen: 'BLOOD', parameters: [num('CRP', 'mg/L', 0, 5)] },
  { name: 'HIV rapid test', code: 'HIV', category: 'SEROLOGY', specimen: 'BLOOD', turnaroundHours: 1, parameters: [reactive()] },
  { name: 'Hepatitis B surface antigen', code: 'HBS', category: 'SEROLOGY', specimen: 'BLOOD', parameters: [reactive()] },
  { name: 'Syphilis (VDRL / RPR)', code: 'VDR', category: 'SEROLOGY', specimen: 'BLOOD', parameters: [reactive()] },
  { name: 'H. pylori antigen', code: 'HPY', category: 'SEROLOGY', specimen: 'STOOL', parameters: [posNeg()] },
  { name: 'Pregnancy test (urine)', code: 'PRG', category: 'SEROLOGY', specimen: 'URINE', turnaroundHours: 1, parameters: [posNeg('Result', [])] },
  { name: 'Urinalysis (dipstick)', code: 'URI', category: 'URINALYSIS', specimen: 'URINE', turnaroundHours: 1, parameters: [
    num('pH', '', 4.5, 8),
    dip('Protein'), dip('Glucose'), dip('Blood'), dip('Leucocytes'),
    posNeg('Nitrites'),
  ] },
  { name: 'Urine microscopy', code: 'UMI', category: 'MICROBIOLOGY', specimen: 'URINE', parameters: [{ name: 'Findings', kind: 'TEXT' }] },
  { name: 'Stool microscopy', code: 'STM', category: 'MICROBIOLOGY', specimen: 'STOOL', parameters: [{ name: 'Findings', kind: 'TEXT' }] },
  // Imaging: the radiographer or sonographer types the report. No specimen is taken; the images themselves are not stored here.
  { name: 'Chest X-ray', code: 'CXR', category: 'IMAGING', specimen: 'NONE', parameters: report(), turnaroundHours: 4 },
  { name: 'Abdominal ultrasound', code: 'USA', category: 'IMAGING', specimen: 'NONE', parameters: report(), turnaroundHours: 4 },
  { name: 'Obstetric ultrasound', code: 'USO', category: 'IMAGING', specimen: 'NONE', parameters: report(), turnaroundHours: 4 },
  { name: 'Pelvic ultrasound', code: 'USP', category: 'IMAGING', specimen: 'NONE', parameters: report(), turnaroundHours: 4 },
  { name: 'Sputum AFB (TB smear)', code: 'AFB', category: 'MICROBIOLOGY', specimen: 'SPUTUM', parameters: [pick('Result', ['Negative', 'Scanty', '1+', '2+', '3+'], ['Scanty', '1+', '2+', '3+'])] },
];
