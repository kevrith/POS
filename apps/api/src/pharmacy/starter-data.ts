/**
 * A starting set of drug interactions and dose limits for a new pharmacy, so the safety check has something to check against on
 * day one. Common, well-established combinations and ordinary adult daily maximums, not a complete reference: a pharmacist
 * should review it, add what they stock, and correct anything that does not match their practice or local guidance.
 *
 * Names are generic names; the safety check also reads a brand through the list's brand column.
 */

export type Severity = 'MILD' | 'MODERATE' | 'SEVERE' | 'CONTRAINDICATED';
export interface StarterInteraction { drug1Name: string; drug2Name: string; severity: Severity; description: string }
export interface StarterDrug {
  genericName: string;
  brandName?: string;
  strength: string;
  dosageForm: string;
  category: string;
  /** Usual adult maximum in a day, in `unit` (omit when it depends on the patient, such as warfarin). */
  maxDailyDose?: number;
  unit?: 'mg' | 'g' | 'mcg';
  contraindicationsText?: string;
}

const NSAIDS = ['ibuprofen', 'diclofenac', 'naproxen'];
const ACE_INHIBITORS = ['enalapril', 'lisinopril', 'captopril', 'ramipril'];

const pairs = (a: string[], b: string[], severity: Severity, description: string): StarterInteraction[] =>
  a.flatMap((x) => b.map((y) => ({ drug1Name: x, drug2Name: y, severity, description })));

export const STARTER_INTERACTIONS: StarterInteraction[] = [
  ...pairs(['warfarin'], ['aspirin', ...NSAIDS], 'SEVERE', 'Raises the risk of serious bleeding'),
  ...pairs(['warfarin'], ['metronidazole', 'co-trimoxazole', 'fluconazole'], 'SEVERE', 'Strengthens warfarin: bleeding risk rises sharply'),
  ...pairs(['warfarin'], ['rifampicin'], 'SEVERE', 'Weakens warfarin: clots are not prevented'),
  ...pairs(['warfarin'], ['ciprofloxacin', 'erythromycin', 'clarithromycin'], 'MODERATE', 'Can raise the INR: check clotting'),
  ...pairs(['simvastatin'], ['clarithromycin', 'erythromycin', 'itraconazole', 'ketoconazole'], 'SEVERE', 'Raises simvastatin levels: risk of muscle breakdown'),
  ...pairs(['atorvastatin'], ['clarithromycin'], 'MODERATE', 'Raises atorvastatin levels: watch for muscle pain'),
  ...pairs(['amlodipine'], ['simvastatin'], 'MODERATE', 'Raises simvastatin levels: keep the simvastatin dose low'),
  ...pairs(['sildenafil', 'tadalafil'], ['isosorbide dinitrate', 'glyceryl trinitrate'], 'CONTRAINDICATED', 'Dangerous fall in blood pressure'),
  ...pairs(['methotrexate'], ['co-trimoxazole', 'trimethoprim'], 'SEVERE', 'Methotrexate toxicity: blood and bone marrow damage'),
  ...pairs(['methotrexate'], ['aspirin', ...NSAIDS], 'MODERATE', 'Raises methotrexate levels'),
  ...pairs(ACE_INHIBITORS, ['spironolactone', 'potassium chloride'], 'MODERATE', 'Potassium can rise too high'),
  ...pairs(ACE_INHIBITORS, NSAIDS, 'MODERATE', 'Can harm the kidneys and weaken the blood pressure effect'),
  ...pairs(['spironolactone'], ['potassium chloride'], 'MODERATE', 'Potassium can rise too high'),
  ...pairs(['tramadol'], ['fluoxetine', 'sertraline'], 'SEVERE', 'Risk of serotonin syndrome and seizures'),
  ...pairs(['tramadol', 'codeine', 'morphine'], ['diazepam'], 'SEVERE', 'Together they can slow breathing dangerously'),
  ...pairs(['digoxin'], ['amiodarone', 'clarithromycin'], 'SEVERE', 'Raises digoxin levels: risk of toxicity'),
  ...pairs(['digoxin'], ['furosemide'], 'MODERATE', 'Low potassium makes digoxin toxicity more likely'),
  ...pairs(['clopidogrel'], ['omeprazole'], 'MODERATE', 'Omeprazole can weaken clopidogrel'),
  ...pairs(['ciprofloxacin'], ['theophylline'], 'SEVERE', 'Raises theophylline levels: risk of seizures'),
  ...pairs(['theophylline'], ['erythromycin'], 'MODERATE', 'Raises theophylline levels'),
  ...pairs(['rifampicin'], ['levonorgestrel', 'ethinylestradiol'], 'SEVERE', 'Weakens hormonal contraception: pregnancy is possible'),
  ...pairs(['lithium'], NSAIDS, 'SEVERE', 'Raises lithium to toxic levels'),
  ...pairs(['lithium'], [...ACE_INHIBITORS, 'hydrochlorothiazide'], 'MODERATE', 'Raises lithium levels'),
  ...pairs(['allopurinol'], ['azathioprine'], 'SEVERE', 'Azathioprine toxicity: the dose must be cut'),
  ...pairs(['aspirin'], ['ibuprofen'], 'MODERATE', 'Ibuprofen can block the heart-protecting effect of aspirin'),
  ...pairs(['carbamazepine'], ['erythromycin', 'clarithromycin'], 'SEVERE', 'Raises carbamazepine levels: toxicity'),
  ...pairs(['propranolol'], ['salbutamol'], 'MODERATE', 'Opposite effects: can bring on wheezing'),
  ...pairs(['prednisolone'], ['aspirin', ...NSAIDS], 'MODERATE', 'Raises the risk of stomach bleeding'),
  ...pairs(['furosemide'], ['gentamicin'], 'MODERATE', 'Raises the risk of kidney and hearing damage'),
];

const NSAID_CAUTION = 'Avoid in pregnancy (especially the last 3 months), stomach ulcer, kidney disease and asthma made worse by NSAIDs';
const STATIN_CAUTION = 'Not for use in pregnancy or breastfeeding, or with active liver disease';
const ACE_CAUTION = 'Not for use in pregnancy; stop if the face or lips swell';

export const STARTER_DRUGS: StarterDrug[] = [
  { genericName: 'Paracetamol', brandName: 'Panadol', strength: '500mg', dosageForm: 'TABLET', category: 'ANALGESIC', maxDailyDose: 4000, unit: 'mg', contraindicationsText: 'Liver disease and heavy alcohol use; do not combine with other paracetamol products' },
  { genericName: 'Ibuprofen', brandName: 'Brufen', strength: '400mg', dosageForm: 'TABLET', category: 'ANALGESIC', maxDailyDose: 2400, unit: 'mg', contraindicationsText: NSAID_CAUTION },
  { genericName: 'Diclofenac', brandName: 'Voltaren', strength: '50mg', dosageForm: 'TABLET', category: 'ANALGESIC', maxDailyDose: 150, unit: 'mg', contraindicationsText: NSAID_CAUTION },
  { genericName: 'Naproxen', strength: '500mg', dosageForm: 'TABLET', category: 'ANALGESIC', maxDailyDose: 1250, unit: 'mg', contraindicationsText: NSAID_CAUTION },
  { genericName: 'Aspirin', strength: '300mg', dosageForm: 'TABLET', category: 'ANALGESIC', maxDailyDose: 4000, unit: 'mg', contraindicationsText: 'Not for children under 16; avoid in pregnancy, stomach ulcer and bleeding disorders' },
  { genericName: 'Tramadol', strength: '50mg', dosageForm: 'CAPSULE', category: 'ANALGESIC', maxDailyDose: 400, unit: 'mg', contraindicationsText: 'Seizure disorders; do not combine with antidepressants or sedatives' },
  { genericName: 'Amoxicillin', brandName: 'Amoxil', strength: '500mg', dosageForm: 'CAPSULE', category: 'ANTIBIOTIC', maxDailyDose: 3000, unit: 'mg', contraindicationsText: 'Penicillin allergy' },
  { genericName: 'Flucloxacillin', strength: '500mg', dosageForm: 'CAPSULE', category: 'ANTIBIOTIC', maxDailyDose: 4000, unit: 'mg', contraindicationsText: 'Penicillin allergy; liver problems with long courses' },
  { genericName: 'Metronidazole', brandName: 'Flagyl', strength: '400mg', dosageForm: 'TABLET', category: 'ANTIBIOTIC', maxDailyDose: 2400, unit: 'mg', contraindicationsText: 'No alcohol during the course and for 2 days after' },
  { genericName: 'Ciprofloxacin', brandName: 'Cipro', strength: '500mg', dosageForm: 'TABLET', category: 'ANTIBIOTIC', maxDailyDose: 1500, unit: 'mg', contraindicationsText: 'Avoid in pregnancy and in children; tendon pain is a reason to stop' },
  { genericName: 'Doxycycline', strength: '100mg', dosageForm: 'CAPSULE', category: 'ANTIBIOTIC', maxDailyDose: 200, unit: 'mg', contraindicationsText: 'Not for use in pregnancy, breastfeeding or children under 12' },
  { genericName: 'Azithromycin', brandName: 'Zithromax', strength: '500mg', dosageForm: 'TABLET', category: 'ANTIBIOTIC', maxDailyDose: 1000, unit: 'mg' },
  { genericName: 'Co-trimoxazole', brandName: 'Septrin', strength: '480mg', dosageForm: 'TABLET', category: 'ANTIBIOTIC', maxDailyDose: 1920, unit: 'mg', contraindicationsText: 'Sulfa allergy; avoid in pregnancy and in babies under 6 weeks' },
  { genericName: 'Fluconazole', strength: '150mg', dosageForm: 'CAPSULE', category: 'ANTIFUNGAL', maxDailyDose: 400, unit: 'mg', contraindicationsText: 'Avoid in pregnancy' },
  { genericName: 'Cetirizine', brandName: 'Zyrtec', strength: '10mg', dosageForm: 'TABLET', category: 'ANTIHISTAMINE', maxDailyDose: 10, unit: 'mg' },
  { genericName: 'Loratadine', brandName: 'Clarityn', strength: '10mg', dosageForm: 'TABLET', category: 'ANTIHISTAMINE', maxDailyDose: 10, unit: 'mg' },
  { genericName: 'Omeprazole', brandName: 'Losec', strength: '20mg', dosageForm: 'CAPSULE', category: 'OTHER', maxDailyDose: 80, unit: 'mg' },
  { genericName: 'Metoclopramide', strength: '10mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 30, unit: 'mg', contraindicationsText: 'Children and young adults are prone to muscle spasms; short courses only' },
  { genericName: 'Metformin', strength: '500mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 3000, unit: 'mg', contraindicationsText: 'Kidney or liver disease' },
  { genericName: 'Amlodipine', brandName: 'Norvasc', strength: '5mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 10, unit: 'mg' },
  { genericName: 'Atorvastatin', strength: '20mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 80, unit: 'mg', contraindicationsText: STATIN_CAUTION },
  { genericName: 'Simvastatin', strength: '20mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 80, unit: 'mg', contraindicationsText: STATIN_CAUTION },
  { genericName: 'Enalapril', strength: '10mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 40, unit: 'mg', contraindicationsText: ACE_CAUTION },
  { genericName: 'Lisinopril', strength: '10mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 80, unit: 'mg', contraindicationsText: ACE_CAUTION },
  { genericName: 'Hydrochlorothiazide', strength: '25mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 50, unit: 'mg' },
  { genericName: 'Furosemide', strength: '40mg', dosageForm: 'TABLET', category: 'OTHER', maxDailyDose: 600, unit: 'mg' },
  { genericName: 'Warfarin', strength: '5mg', dosageForm: 'TABLET', category: 'OTHER', contraindicationsText: 'Not for use in pregnancy; dose is set by the INR, never by a fixed maximum' },
];
