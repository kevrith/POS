import { BadRequestException } from '@nestjs/common';
import { optionalText, text } from '../common/validate';

/**
 * Common outpatient diagnoses with their ICD-10 codes, so a doctor picks rather than types, and a report can count by code.
 * A starting set, not the whole classification: a diagnosis that is not here is typed in full and kept as written.
 */
export const COMMON_DIAGNOSES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'B50.9', label: 'Malaria (Plasmodium falciparum), unspecified' },
  { code: 'B54', label: 'Malaria, unspecified' },
  { code: 'J06.9', label: 'Upper respiratory tract infection' },
  { code: 'J02.9', label: 'Acute pharyngitis (sore throat)' },
  { code: 'J03.9', label: 'Acute tonsillitis' },
  { code: 'J00', label: 'Common cold' },
  { code: 'J18.9', label: 'Pneumonia' },
  { code: 'J20.9', label: 'Acute bronchitis' },
  { code: 'J45.9', label: 'Asthma' },
  { code: 'J30.4', label: 'Allergic rhinitis' },
  { code: 'H66.9', label: 'Otitis media' },
  { code: 'H10.9', label: 'Conjunctivitis' },
  { code: 'A09', label: 'Gastroenteritis (diarrhoea and vomiting)' },
  { code: 'A01.0', label: 'Typhoid fever' },
  { code: 'A06.0', label: 'Amoebic dysentery' },
  { code: 'B82.9', label: 'Intestinal worms' },
  { code: 'K29.7', label: 'Gastritis' },
  { code: 'K30', label: 'Dyspepsia' },
  { code: 'K59.0', label: 'Constipation' },
  { code: 'K21.9', label: 'Gastro-oesophageal reflux' },
  { code: 'N39.0', label: 'Urinary tract infection' },
  { code: 'N76.0', label: 'Vaginitis' },
  { code: 'A64', label: 'Sexually transmitted infection' },
  { code: 'I10', label: 'Hypertension' },
  { code: 'E11.9', label: 'Type 2 diabetes mellitus' },
  { code: 'E10.9', label: 'Type 1 diabetes mellitus' },
  { code: 'D50.9', label: 'Iron-deficiency anaemia' },
  { code: 'E66.9', label: 'Obesity' },
  { code: 'E86', label: 'Dehydration' },
  { code: 'B20', label: 'HIV disease' },
  { code: 'A15.9', label: 'Tuberculosis' },
  { code: 'L30.9', label: 'Dermatitis' },
  { code: 'L02.9', label: 'Skin abscess' },
  { code: 'B35.9', label: 'Fungal skin infection (tinea)' },
  { code: 'B86', label: 'Scabies' },
  { code: 'L70.9', label: 'Acne' },
  { code: 'M54.5', label: 'Low back pain' },
  { code: 'M79.1', label: 'Muscle pain (myalgia)' },
  { code: 'M25.5', label: 'Joint pain' },
  { code: 'M19.9', label: 'Osteoarthritis' },
  { code: 'S09.9', label: 'Head injury' },
  { code: 'T14.9', label: 'Injury, unspecified' },
  { code: 'S61.9', label: 'Open wound of hand or wrist' },
  { code: 'S93.4', label: 'Sprained ankle' },
  { code: 'G43.9', label: 'Migraine' },
  { code: 'R51', label: 'Headache' },
  { code: 'R50.9', label: 'Fever, unspecified' },
  { code: 'R05', label: 'Cough' },
  { code: 'R10.4', label: 'Abdominal pain' },
  { code: 'R11', label: 'Nausea and vomiting' },
  { code: 'R42', label: 'Dizziness' },
  { code: 'R53', label: 'Fatigue' },
  { code: 'F41.9', label: 'Anxiety disorder' },
  { code: 'F32.9', label: 'Depression' },
  { code: 'G47.0', label: 'Insomnia' },
  { code: 'Z34.9', label: 'Antenatal care, normal pregnancy' },
  { code: 'Z30.9', label: 'Family planning' },
  { code: 'Z23', label: 'Immunisation' },
  { code: 'Z00.0', label: 'General medical examination' },
  { code: 'O20.9', label: 'Bleeding in early pregnancy' },
  { code: 'N94.6', label: 'Painful periods (dysmenorrhoea)' },
  { code: 'E40', label: 'Malnutrition' },
  { code: 'A38', label: 'Scarlet fever' },
  { code: 'B01.9', label: 'Chickenpox' },
  { code: 'B05.9', label: 'Measles' },
  { code: 'K02.9', label: 'Dental caries' },
];

/** The common diagnoses that match what was typed, by code or by any word of the name. */
export function searchDiagnoses(q: string, limit = 15): Array<{ code: string; label: string }> {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return COMMON_DIAGNOSES.slice(0, limit).map((d) => ({ ...d }));
  return COMMON_DIAGNOSES.filter((d) => {
    const hay = `${d.code} ${d.label}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  }).slice(0, limit).map((d) => ({ ...d }));
}

export interface Diagnosis { code?: string; label: string }

/** The diagnoses a doctor sent, cleaned: a label each, an optional code, no duplicates, no more than ten. */
export function cleanDiagnoses(value: unknown): Diagnosis[] {
  if (!Array.isArray(value)) throw new BadRequestException('Diagnoses must be a list');
  if (value.length > 10) throw new BadRequestException('At most 10 diagnoses on a visit');
  const seen = new Set<string>();
  const out: Diagnosis[] = [];
  for (const raw of value) {
    const d = typeof raw === 'string' ? { label: raw } : (raw as Diagnosis);
    const label = text(d?.label, 'Diagnosis', 160);
    const code = optionalText(d?.code, 'Diagnosis code', 12)?.toUpperCase();
    if (code && !/^[A-Z]\d{2}(\.\d{1,2})?$/.test(code)) throw new BadRequestException(`"${code}" is not an ICD-10 code (like J06.9)`);
    const key = (code ?? label).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...(code ? { code } : {}), label });
  }
  return out;
}

export function parseDiagnoses(raw: unknown): Diagnosis[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((d): d is Diagnosis => !!d && typeof d.label === 'string') : [];
  } catch {
    return [];
  }
}
