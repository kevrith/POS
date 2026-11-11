/**
 * The checks a pharmacist makes in their head before handing a medicine over, written down so the till makes them every time:
 * is the patient allergic to it, does it clash with another medicine on the same prescription or one they are already
 * taking, is the daily dose above the usual maximum, is it a duplicate, is it unsuitable in pregnancy.
 *
 * Pure functions, no database: the service gathers the facts and these decide. A warning is BLOCK (the fill needs a
 * manager to set it aside, with a reason, and that is logged), WARN (shown, the pharmacist decides) or INFO.
 *
 * This is decision support for a pharmacist, not a substitute for one: it knows only what is in the patient's record, the
 * interaction table the business entered and the formulary. A drug it has no data for raises nothing.
 */

/** Words that describe a pack, not the drug: stripped before two drug names are compared. */
const FORM_WORDS = /\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|inj|cream|ointment|gel|drops|sachets?|solution|oral|iv|im|sr|xr|er|film[- ]coated)\b/g;
const STRENGTH = /\b\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|iu|%|units?)(\/\d*\.?\d*\s*(ml|mg|g))?\b/g;

/** "Warfarin 5 mg tablets" and "WARFARIN" are the same drug for an interaction check. */
export function normalizeDrugName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(STRENGTH, ' ')
    .replace(FORM_WORDS, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameDrug(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const within = (needle: string, hay: string) => new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay);
  return within(a, b) || within(b, a);
}

// ── Allergy classes ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Families of medicine, so an allergy written as "penicillin" stops amoxicillin and one written as "NSAIDs" stops
 * ibuprofen. Names and brands in common use in Kenya; a class the list does not know is still matched by name.
 */
export const DRUG_CLASSES: Record<string, { aliases: string[]; members: string[] }> = {
  penicillins: {
    aliases: ['penicillin', 'penicillins', 'beta lactam', 'beta-lactam', 'penicillin group'],
    members: ['penicillin', 'amoxicillin', 'ampicillin', 'flucloxacillin', 'cloxacillin', 'piperacillin', 'benzylpenicillin', 'phenoxymethylpenicillin', 'co-amoxiclav', 'amoxicillin clavulanate', 'augmentin', 'amoxil', 'ampiclox'],
  },
  cephalosporins: {
    aliases: ['cephalosporin', 'cephalosporins'],
    members: ['cefalexin', 'cephalexin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefotaxime', 'ceftazidime', 'cefpodoxime', 'cefadroxil', 'cefaclor', 'zinnat', 'rocephin'],
  },
  sulfonamides: {
    aliases: ['sulfa', 'sulpha', 'sulfonamide', 'sulfonamides', 'sulphonamide', 'sulfa drugs'],
    members: ['sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'trimethoprim-sulfamethoxazole', 'sulfadiazine', 'sulfasalazine', 'septrin', 'bactrim', 'fansidar', 'sulfadoxine'],
  },
  nsaids: {
    aliases: ['nsaid', 'nsaids', 'anti-inflammatory', 'anti inflammatory'],
    members: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'acetylsalicylic acid', 'indomethacin', 'ketoprofen', 'piroxicam', 'meloxicam', 'celecoxib', 'etoricoxib', 'mefenamic acid', 'ponstan', 'voltaren', 'brufen'],
  },
  macrolides: {
    aliases: ['macrolide', 'macrolides'],
    members: ['erythromycin', 'azithromycin', 'clarithromycin', 'zithromax'],
  },
  quinolones: {
    aliases: ['quinolone', 'quinolones', 'fluoroquinolone', 'fluoroquinolones'],
    members: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'norfloxacin', 'moxifloxacin', 'cipro'],
  },
  tetracyclines: {
    aliases: ['tetracycline', 'tetracyclines'],
    members: ['tetracycline', 'doxycycline', 'minocycline'],
  },
  opioids: {
    aliases: ['opioid', 'opioids', 'opiate', 'opiates'],
    members: ['morphine', 'codeine', 'tramadol', 'pethidine', 'fentanyl', 'oxycodone'],
  },
  ace_inhibitors: {
    aliases: ['ace inhibitor', 'ace inhibitors', 'ace-inhibitor'],
    members: ['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril'],
  },
  statins: {
    aliases: ['statin', 'statins'],
    members: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'],
  },
};

/** Cross-reactivity worth a look (not a certainty): a penicillin allergy and a cephalosporin. */
const CROSS_REACTIVE: Array<[string, string]> = [['penicillins', 'cephalosporins']];

function classesOf(name: string, drugClass?: string | null): Set<string> {
  const canon = normalizeDrugName(name);
  const out = new Set<string>();
  const dc = drugClass ? normalizeDrugName(drugClass) : '';
  for (const [cls, def] of Object.entries(DRUG_CLASSES)) {
    const clsName = cls.replace(/_/g, ' ');
    if (canon && (canon === clsName || def.aliases.some((a) => sameDrug(normalizeDrugName(a), canon)))) out.add(cls);
    if (canon && def.members.some((m) => sameDrug(normalizeDrugName(m), canon))) out.add(cls);
    if (dc && (dc === clsName || def.aliases.some((a) => sameDrug(normalizeDrugName(a), dc)))) out.add(cls);
  }
  return out;
}

// ── Patient facts ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Allergy { substance: string; reaction?: string; severity?: string }

/** The allergy list as stored (JSON text); tolerant of old or hand-edited rows. */
export function parseAllergies(raw: unknown): Allergy[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => (typeof a === 'string' ? { substance: a } : a))
    .filter((a): a is Allergy => !!a && typeof a === 'object' && typeof (a as Allergy).substance === 'string' && (a as Allergy).substance.trim().length > 0)
    .map((a) => ({ substance: a.substance.trim(), ...(a.reaction ? { reaction: String(a.reaction) } : {}), ...(a.severity ? { severity: String(a.severity) } : {}) }));
}

export function parseStringList(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
}

// ── Doses ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const FREQUENCIES = ['OD', 'BD', 'TDS', 'QDS', 'Q4H', 'Q6H', 'Q8H', 'Q12H', 'MANE', 'NOCTE', 'WEEKLY', 'STAT', 'PRN'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'mg', 'g', 'mcg', 'sachet', 'drop', 'puff', 'patch', 'injection', 'unit'] as const;

/** Doses a day for each frequency; null when it cannot be worked out (as needed). */
const PER_DAY: Record<Frequency, number | null> = {
  OD: 1, BD: 2, TDS: 3, QDS: 4, Q4H: 6, Q6H: 4, Q8H: 3, Q12H: 2, MANE: 1, NOCTE: 1, WEEKLY: 1 / 7, STAT: 1, PRN: null,
};

/** Other ways the same frequency is written (QID is QDS, ON is at night, OM is in the morning). */
const FREQUENCY_ALIASES: Record<string, Frequency> = { QID: 'QDS', ON: 'NOCTE', OM: 'MANE', QD: 'OD', BID: 'BD', TID: 'TDS', Q24H: 'OD' };

/** The frequency in the form this app stores, or the input uppercased when it is not one it knows. */
export function normalizeFrequency(frequency?: string | null): string {
  const f = String(frequency ?? '').trim().toUpperCase();
  return FREQUENCY_ALIASES[f] ?? f;
}

export function dosesPerDay(frequency?: string | null): number | null {
  const f = normalizeFrequency(frequency) as Frequency;
  return f in PER_DAY ? PER_DAY[f] : null;
}

/** "500 mg" -> { mg: 500 }, "1g" -> { mg: 1000 }, "250mcg" -> { mg: 0.25 }, "125mg/5ml" -> { mg: 125, perMl: 5 }. */
export function parseStrength(text?: string | null): { mg: number; perMl?: number } | null {
  const m = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g)\b(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*ml)?/i.exec(String(text ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mg = unit === 'g' ? n * 1000 : unit === 'mg' ? n : n / 1000;
  if (/\/\s*(\d+(?:\.\d+)?)?\s*ml/i.test(m[0])) return { mg, perMl: m[3] ? parseFloat(m[3]) : 1 };
  return { mg };
}

/** Milligrams a day this line gives, or null when the dose, frequency or strength is not enough to say. */
export function dailyDoseMg(line: { dose?: number; doseUnit?: string; frequency?: string }, strengthText?: string | null): number | null {
  const perDay = dosesPerDay(line.frequency);
  if (!(line.dose && line.dose > 0) || perDay === null) return null;
  const unit = String(line.doseUnit ?? 'tablet').toLowerCase();
  const perDose = line.dose * perDay;
  if (unit === 'mg') return perDose;
  if (unit === 'g') return perDose * 1000;
  if (unit === 'mcg') return perDose / 1000;
  const strength = parseStrength(strengthText);
  if (!strength) return null;
  if (unit === 'ml') return strength.perMl ? (perDose / strength.perMl) * strength.mg : null;
  if (['tablet', 'capsule', 'sachet', 'unit'].includes(unit)) return strength.perMl ? null : perDose * strength.mg;
  return null;
}

/** A formulary maximum in milligrams (it may be kept in g or mcg). */
function maxDailyMg(max: number, unit?: string | null): number | null {
  const u = String(unit ?? 'mg').toLowerCase();
  if (u === 'mg') return max;
  if (u === 'g') return max * 1000;
  if (u === 'mcg' || u === 'µg') return max / 1000;
  return null;
}

// ── The check ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type Severity = 'BLOCK' | 'WARN' | 'INFO';
export type WarningKind = 'ALLERGY' | 'INTERACTION' | 'MAX_DOSE' | 'DUPLICATE' | 'PREGNANCY' | 'NO_PATIENT';

export interface SafetyWarning {
  kind: WarningKind;
  severity: Severity;
  message: string;
  /** The medicines involved, as written on the prescription. */
  drugs: string[];
}

export interface SafetyLine {
  name: string;
  genericName?: string | null;
  drugClass?: string | null;
  strength?: string | null;
  dose?: number;
  doseUnit?: string;
  frequency?: string;
}
export interface InteractionRow { drug1Name: string; drug2Name: string; severity: string; description: string }
export interface FormularyRow { genericName: string; brandName?: string | null; strength?: string | null; maxDailyDose?: number | null; unit?: string | null; contraindicationsText?: string | null }

export interface SafetyInput {
  patient: { name: string; allergies: unknown; pregnant?: boolean; breastfeeding?: boolean } | null;
  lines: SafetyLine[];
  /** What the patient is already taking: medicines from their other recent prescriptions. */
  alsoTaking?: Array<{ name: string; from: string }>;
  interactions: InteractionRow[];
  formulary: FormularyRow[];
  /** brand (normalised) to generic (normalised), from the drug catalogue. */
  brandToGeneric?: Map<string, string>;
}

const BLOCKING_SEVERITIES = ['SEVERE', 'MAJOR', 'CONTRAINDICATED'];

export function evaluateSafety(input: SafetyInput): SafetyWarning[] {
  const out: SafetyWarning[] = [];
  const brands = input.brandToGeneric ?? new Map<string, string>();
  const canon = (n: string) => {
    const norm = normalizeDrugName(n);
    return brands.get(norm) ?? norm;
  };
  const lineCanon = input.lines.map((l) => canon(l.genericName || l.name));

  // Allergies
  if (!input.patient) {
    out.push({ kind: 'NO_PATIENT', severity: 'INFO', drugs: [], message: 'No patient record is linked to this prescription, so allergies and other medicines were not checked.' });
  } else {
    const allergies = parseAllergies(input.patient.allergies);
    for (const allergy of allergies) {
      const allergyName = canon(allergy.substance);
      const allergyClasses = classesOf(allergy.substance);
      input.lines.forEach((line, i) => {
        const drugClasses = classesOf(line.genericName || line.name, line.drugClass);
        const direct = sameDrug(allergyName, lineCanon[i]) || sameDrug(allergyName, canon(line.name));
        const sameClass = [...allergyClasses].some((c) => drugClasses.has(c));
        const cross = !sameClass && CROSS_REACTIVE.some(([a, b]) => (allergyClasses.has(a) && drugClasses.has(b)) || (allergyClasses.has(b) && drugClasses.has(a)));
        if (direct || sameClass) {
          out.push({
            kind: 'ALLERGY',
            severity: 'BLOCK',
            drugs: [line.name],
            message: `${input.patient!.name} is allergic to ${allergy.substance}${allergy.reaction ? ` (${allergy.reaction})` : ''}. ${line.name} is ${direct ? 'that medicine' : 'in the same family'}.`,
          });
        } else if (cross) {
          out.push({
            kind: 'ALLERGY',
            severity: 'WARN',
            drugs: [line.name],
            message: `${input.patient!.name} is allergic to ${allergy.substance}. ${line.name} can cross-react with it: check with the prescriber.`,
          });
        }
      });
    }
  }

  // Interactions: within the prescription, and with what the patient already takes
  const seen = new Set<string>();
  const pushInteraction = (a: { shown: string; canon: string; from?: string }, b: { shown: string; canon: string; from?: string }) => {
    for (const it of input.interactions) {
      const x = canon(it.drug1Name);
      const y = canon(it.drug2Name);
      if (!((sameDrug(x, a.canon) && sameDrug(y, b.canon)) || (sameDrug(x, b.canon) && sameDrug(y, a.canon)))) continue;
      const key = [a.canon, b.canon].sort().join('+') + ':' + it.severity;
      if (seen.has(key)) continue;
      seen.add(key);
      const sev = String(it.severity ?? '').toUpperCase();
      const severity: Severity = BLOCKING_SEVERITIES.includes(sev) ? 'BLOCK' : sev === 'MILD' ? 'INFO' : 'WARN';
      const where = a.from || b.from ? ` (${a.from ? `${a.shown} is from ${a.from}` : `${b.shown} is from ${b.from}`}, already being taken)` : '';
      out.push({ kind: 'INTERACTION', severity, drugs: [a.shown, b.shown], message: `${a.shown} and ${b.shown}: ${it.description || sev.toLowerCase() + ' interaction'}${where}` });
    }
  };
  for (let i = 0; i < input.lines.length; i++) {
    for (let j = i + 1; j < input.lines.length; j++) {
      pushInteraction({ shown: input.lines[i].name, canon: lineCanon[i] }, { shown: input.lines[j].name, canon: lineCanon[j] });
    }
    for (const other of input.alsoTaking ?? []) {
      pushInteraction({ shown: input.lines[i].name, canon: lineCanon[i] }, { shown: other.name, canon: canon(other.name), from: other.from });
    }
  }

  // The same medicine twice
  for (let i = 0; i < input.lines.length; i++) {
    for (let j = i + 1; j < input.lines.length; j++) {
      if (lineCanon[i] && sameDrug(lineCanon[i], lineCanon[j])) {
        out.push({ kind: 'DUPLICATE', severity: 'WARN', drugs: [input.lines[i].name, input.lines[j].name], message: `${input.lines[i].name} and ${input.lines[j].name} are the same medicine: the patient would get it twice.` });
      }
    }
  }

  // Dose above the usual maximum, and unsuitable in pregnancy
  input.lines.forEach((line, i) => {
    const entry = input.formulary.find((f) => sameDrug(canon(f.genericName), lineCanon[i]) || (f.brandName ? sameDrug(canon(f.brandName), lineCanon[i]) : false));
    if (!entry) return;
    if (entry.maxDailyDose && entry.maxDailyDose > 0) {
      const max = maxDailyMg(entry.maxDailyDose, entry.unit);
      // The strength of what is actually on the line (its item, then its name) beats the list's typical strength.
      const daily = dailyDoseMg(line, line.strength || (parseStrength(line.name) ? line.name : undefined) || entry.strength);
      if (max !== null && daily !== null && daily > max + 1e-9) {
        out.push({ kind: 'MAX_DOSE', severity: 'BLOCK', drugs: [line.name], message: `${line.name}: ${round(daily)} mg a day is above the usual maximum of ${round(max)} mg.` });
      }
    }
    const warn = entry.contraindicationsText ?? '';
    if (input.patient?.pregnant && /pregnan/i.test(warn)) {
      out.push({ kind: 'PREGNANCY', severity: 'WARN', drugs: [line.name], message: `${line.name} is not advised in pregnancy (${warn.slice(0, 120)}). ${input.patient.name} is recorded as pregnant.` });
    }
    if (input.patient?.breastfeeding && /breast|lactat/i.test(warn)) {
      out.push({ kind: 'PREGNANCY', severity: 'WARN', drugs: [line.name], message: `${line.name} is not advised while breastfeeding (${warn.slice(0, 120)}). ${input.patient.name} is recorded as breastfeeding.` });
    }
  });

  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The warnings a fill cannot go past without a manager setting them aside. */
export const blockers = (w: SafetyWarning[]) => w.filter((x) => x.severity === 'BLOCK');
