import type { MetricId } from '../brain/indicators';

export const HEALTH_SOURCES = {
  'aha-bp': {
    id: 'aha-bp',
    label: 'AHA — Blood pressure categories',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings',
    scope: 'Adult blood pressure categories and symptom-dependent urgent follow-up; reviewed by AHA August 2025.',
  },
  'aha-low-bp': {
    id: 'aha-low-bp',
    label: 'AHA — Low blood pressure',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/low-blood-pressure-when-blood-pressure-is-too-low',
    scope: 'Low pressure around 90/60 mmHg; symptoms and individual circumstances determine its significance.',
  },
  'nhlbi-low-bp': {
    id: 'nhlbi-low-bp',
    label: 'NHLBI — Low blood pressure',
    url: 'https://www.nhlbi.nih.gov/health-topics/low-blood-pressure',
    scope: 'Defines low blood pressure as lower than 90/60 mmHg; the app uses this for its low-pressure Watch rule.',
  },
  'aha-heart-rate': {
    id: 'aha-heart-rate',
    label: 'AHA — Resting heart rate',
    url: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',
    scope: 'Adult resting heart rate, athletic variation, exercise effects and concerning symptoms.',
  },
  'mayo-fever': {
    id: 'mayo-fever',
    label: 'Mayo Clinic — Fever',
    url: 'https://www.mayoclinic.org/diseases-conditions/fever/symptoms-causes/syc-20352759',
    scope: 'Oral temperature, adult fever advice and symptom-dependent medical review; updated December 2025.',
  },
  'cdc-fever': {
    id: 'cdc-fever',
    label: 'CDC — Definition of fever (ill travelers)',
    url: 'https://www.cdc.gov/port-health/php/definitions-symptoms-reportable-illness/',
    scope: 'A measured temperature of 38 °C (100.4 °F) or greater counts as fever; the app uses this for its 38.0 °C Act threshold.',
  },
  'cleveland-fever': {
    id: 'cleveland-fever',
    label: 'Cleveland Clinic — Fever',
    url: 'https://my.clevelandclinic.org/health/articles/fever',
    scope: 'Adults should call a healthcare provider for a fever above 39.4 °C (103 °F); the app uses this for its Critical threshold.',
  },
  'mayo-hypothermia': {
    id: 'mayo-hypothermia',
    label: 'Mayo Clinic — Hypothermia',
    url: 'https://www.mayoclinic.org/diseases-conditions/hypothermia/symptoms-causes/syc-20352682',
    scope: 'Core temperature below 35 °C is a medical emergency; measurement method matters.',
  },
  'who-oximetry': {
    id: 'who-oximetry',
    label: 'WHO — Pulse oximetry training manual',
    url: 'https://cdn.who.int/media/docs/default-source/patient-safety/pulse-oximetry/who-ps-pulse-oxymetry-training-manual-en.pdf',
    scope: 'Healthy sea-level oxygen saturation and urgent low saturation, in an anaesthesia training context (pages 8–12).',
  },
  'ada-hypoglycemia': {
    id: 'ada-hypoglycemia',
    label: 'ADA — Low blood glucose',
    url: 'https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose',
    scope: 'Low glucose below 70 mg/dL and the 15 g / 15-minute treatment approach for people able to swallow safely.',
  },
  'ada-standards-2026': {
    id: 'ada-standards-2026',
    label: 'ADA — Standards of Care 2026, section 6',
    url: 'https://diabetesjournals.org/care/article/49/Supplement_1/S132/163927/6-Glycemic-Goals-Hypoglycemia-and-Hyperglycemic',
    scope: 'Diabetes-care hypoglycemia definitions: level 1 below 70 and at least 54 mg/dL; level 2 below 54 mg/dL.',
  },
  'ada-glucose-diagnosis': {
    id: 'ada-glucose-diagnosis',
    label: 'ADA — Glucose tests and diagnosis',
    url: 'https://diabetes.org/about-diabetes/diagnosis',
    scope: 'Laboratory fasting and oral glucose-tolerance tests; these are different measurement contexts from an arbitrary finger-stick.',
  },
  'aasm-srs-sleep': {
    id: 'aasm-srs-sleep',
    label: 'AASM / SRS — Adult sleep consensus',
    url: 'https://aasm.org/resources/pdf/pressroom/adult-sleep-duration-consensus.pdf',
    scope: 'The joint adult recommendation is at least 7 hours regularly; it does not define this app’s alert colors or persistence rules.',
  },
  'nasa-behavioral-health': {
    id: 'nasa-behavioral-health',
    label: 'NASA HRP — Isolation and confinement',
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
    scope: 'Spaceflight behavioral-health monitoring context, not a validated 1–5 mood scale.',
  },
  'nasa-std3001-v1': {
    id: 'nasa-std3001-v1',
    label: 'NASA-STD-3001 Vol.1 — Radiation, section 4.8',
    url: 'https://www.nasa.gov/reference/4-0-human-performance/',
    scope: 'Requirement V1 4030 limits total career effective spaceflight dose to less than 600 mSv; ALARA also applies.',
  },
  'nasa-iss-exercise': {
    id: 'nasa-iss-exercise',
    label: 'NASA — Astronaut health care and exercise',
    url: 'https://www.nasa.gov/missions/station/faq-the-real-story-about-astronaut-health-care-in-space/',
    scope: 'ISS crews have 2.5 hours scheduled for daily exercise; their fitness plans are individualized.',
  },
  'nasa-exercise-schedule': {
    id: 'nasa-exercise-schedule',
    label: 'NASA — What the exercise allocation includes',
    url: 'https://www.nasa.gov/podcasts/houston-we-have-a-podcast/the-zero-g-workout/',
    scope: 'The scheduled exercise allocation includes changing, setup, recovery and cleanup; it is not all active exercise time.',
  },
  'nasa-bone-risk': {
    id: 'nasa-bone-risk',
    label: 'NASA — Risk of spaceflight-induced bone changes',
    url: 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/',
    scope: 'On average, bones lose 1–1.5% of their density per month during 4–6 month missions; exercise is part of the countermeasures.',
  },
  'nasa-hrp-hazards': {
    id: 'nasa-hrp-hazards',
    label: 'NASA HRP — Five hazards of human spaceflight',
    url: 'https://www.nasa.gov/hrp/hazards/',
    scope: 'Mission environment and human-health context; not clinical thresholds for individual measurements.',
  },
  'nasa-hrp-risks': {
    id: 'nasa-hrp-risks',
    label: 'NASA HRP — Risks of human spaceflight',
    url: 'https://www.nasa.gov/hrp/risks/',
    scope: 'Research risk overview; it does not validate this app’s multi-indicator patterns or triage rules.',
  },
} as const;

export type HealthSourceId = keyof typeof HEALTH_SOURCES;

export interface HealthSource {
  id: HealthSourceId;
  label: string;
  url: string;
  scope: string;
}

export interface MetricEvidence {
  sourceIds: readonly HealthSourceId[];
  reference: string;
  appRules: string;
  limitation: string;
}

export const METRIC_EVIDENCE: Record<MetricId, MetricEvidence> = {
  bp: {
    sourceIds: ['aha-bp', 'nhlbi-low-bp', 'aha-low-bp'],
    reference: 'AHA: normal below 120/80; elevated 120–129 with diastolic below 80; stage 1 at 130–139 or 80–89; stage 2 at 140 or 90; severe above 180 or 120. NHLBI: low blood pressure is lower than 90/60 mmHg.',
    appRules: 'Watch combines AHA elevated and stage 1 categories and flags either low component. The OK / Watch / Act / Critical mapping is designed by this app.',
    limitation: 'A reading is not a hypertension diagnosis. Symptoms can require immediate help; low pressure is not automatically dangerous.',
  },
  hr: {
    sourceIds: ['aha-heart-rate'],
    reference: 'AHA gives 60–100 bpm for calm adult rest and notes that trained athletes may have lower rates. Exercise can temporarily raise the pulse.',
    appRules: 'The 40, 50 and 120 bpm boundaries, 50–59 baseline exception, alert colors and fixed recheck intervals are app-designed.',
    limitation: 'Fitness, medication, symptoms and measurement context matter. A personal baseline cannot establish that an abnormal pulse is safe.',
  },
  temp: {
    sourceIds: ['cdc-fever', 'cleveland-fever', 'mayo-hypothermia', 'mayo-fever'],
    reference: 'CDC: fever is a measured 38 °C (100.4 °F) or higher (Act). Cleveland Clinic: adults should call a provider for fever above 39.4 °C (103 °F) (Critical). Mayo Clinic: core temperature below 35 °C is hypothermia, a medical emergency (Act).',
    appRules: 'The 37.5 °C Watch band, the OK range of 35.0–37.4 °C, the alert colors and the 4-hour / 24-hour timers are app-designed; they are not a CDC, Cleveland Clinic or Mayo triage protocol. A steadily falling temperature can still be flagged by the trend rule.',
    limitation: 'Oral, ear and core readings differ. Serious symptoms or a very low temperature require prompt help regardless of the app color or fever timer.',
  },
  spo2: {
    sourceIds: ['who-oximetry'],
    reference: 'WHO describes healthy sea-level saturation around 95–100% and treats saturation below 90% as urgent in its pulse-oximetry manual.',
    appRules: 'The app maps 90–94% to Watch and below 90% to Critical. These labels and the follow-up workflow are app-designed.',
    limitation: 'The manual concerns anaesthesia, not validated astronaut self-triage. Cabin oxygen/pressure, altitude, probe quality and symptoms affect interpretation; do not wait for a repeat reading if seriously unwell.',
  },
  glucose: {
    sourceIds: ['ada-hypoglycemia', 'ada-standards-2026', 'ada-glucose-diagnosis'],
    reference: 'ADA defines hypoglycemia below 70 mg/dL and level 2 below 54. Diagnostic normal fasting plasma glucose is below 100; the below-140 value applies to a laboratory 2-hour glucose-tolerance test.',
    appRules: 'The general finger-stick band of 70–140, high alerts above 140 / 180 / 250 and their color mapping are app-designed, not ADA diagnostic categories for healthy astronauts.',
    limitation: 'Fasting, meal timing and test method are essential. A random finger-stick cannot diagnose diabetes. Oral carbohydrate advice applies only when awake and able to swallow safely.',
  },
  sleep: {
    sourceIds: ['aasm-srs-sleep'],
    reference: 'AASM and SRS recommend adults regularly obtain at least 7 hours of sleep per night.',
    appRules: 'Watch at 6–6.9 hours, Act below 6 hours, and escalation after 3 nights below 7 hours are app-designed.',
    limitation: 'The source is adult population guidance, not a mission-specific sleep prescription or a diagnosis from a single self-reported night.',
  },
  mood: {
    sourceIds: ['nasa-behavioral-health'],
    reference: 'NASA HRP studies behavioral-health monitoring, isolation, workload and disrupted sleep during spaceflight.',
    appRules: 'The 1–5 self-report scale, OK at 3–5, low mood at 1–2 and the 3-day Act rule are entirely app-designed.',
    limitation: 'This is not a validated psychiatric questionnaire, diagnosis or safety assessment. A high score does not rule out a need for support.',
  },
  radiation: {
    sourceIds: ['nasa-std3001-v1'],
    reference: 'NASA-STD-3001 Vol.1 section 4.8.2 sets a career effective spaceflight dose limit below 600 mSv, including past flights and planned exposure.',
    appRules: 'Watch at 50%, Act at 80%, and the daily-dose spike above 3× the prior 7-day average are app-designed. A spike alone cannot identify a solar event.',
    limitation: 'This app sums mission dose entries, not total career effective dose; dosimeter readings are not automatically equivalent to the NASA effective-dose calculation. Editing the setting does not redefine NASA’s limit.',
  },
  exercise: {
    sourceIds: ['nasa-iss-exercise', 'nasa-exercise-schedule', 'nasa-bone-risk'],
    reference: 'NASA describes a 2.5-hour scheduled ISS exercise allocation and individualized exercise plans. The allocation includes preparation and recovery. On 4–6 month missions, bones lose on average 1–1.5% of their density per month.',
    appRules: 'Using 150 logged minutes as a daily target for every location, OK at 90% and Watch at 60% are app-designed planning rules.',
    limitation: 'Scheduled time is not equivalent to active leg-exercise minutes or a universal Moon/Mars prescription. Follow the crew’s prescribed duration, intensity and activity mix.',
  },
};

export const SOURCES: readonly HealthSource[] = Object.values(HEALTH_SOURCES);
export const SOURCE_REVIEWED_ON = '2026-11-15';

export function sourcesForMetric(id: MetricId): HealthSource[] {
  return METRIC_EVIDENCE[id].sourceIds.map((sourceId) => HEALTH_SOURCES[sourceId]);
}
