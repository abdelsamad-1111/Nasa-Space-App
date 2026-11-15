// VITALS-ORBIT — single source of truth for thresholds, texts and links.
// Every number used by evaluate.ts lives here.

export type IndicatorId = 'bp' | 'hr' | 'temp' | 'spo2' | 'glucose' | 'sleep' | 'mood' | 'radiation';
/** The 8 health indicators plus daily leg exercise (shown on the Legs zone only). */
export type MetricId = IndicatorId | 'exercise';
export type Status = 'OK' | 'WATCH' | 'ACT' | 'CRITICAL';
export type Location = 'ISS' | 'MOON' | 'MARS';
export type ZoneId = 'head' | 'lungs' | 'heart' | 'abdomen' | 'legs' | 'body' | 'dosimeter';
export type BpValue = { sys: number; dia: number };
export type ReadingValue = number | BpValue;

export const STATUS_ORDER: Status[] = ['OK', 'WATCH', 'ACT', 'CRITICAL'];

export const STATUS_COLOR: Record<Status, string> = {
  OK: '#2E7D4F',
  WATCH: '#D9961A',
  ACT: '#C62828',
  CRITICAL: '#C62828',
};

export const STATUS_WORD: Record<Status, string> = {
  OK: 'OK',
  WATCH: 'Watch',
  ACT: 'Act',
  CRITICAL: 'Critical',
};

// ---------------------------------------------------------------------------
// Reference values and app alert settings. See METRIC_EVIDENCE for applicability.
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  bp: {
    okSysBelow: 120,
    okDiaBelow: 80,
    watchSysMin: 120, // 120–139
    watchDiaMin: 80, // 80–89
    lowSysBelow: 90,
    lowDiaBelow: 60,
    actSysMin: 140,
    actDiaMin: 90,
    critSysAbove: 180,
    critDiaAbove: 120,
  },
  hr: {
    okMin: 60,
    okMax: 100,
    okLowMin: 50, // 50–59 is OK when personal baseline < 60
    lowBaselineCut: 60,
    watchMax: 120, // 101–120
    actAbove: 120,
    actBelow: 40,
  },
  temp: {
    okMin: 35.0,
    okMax: 37.4,
    watchMin: 37.5, // 37.5–37.9
    actMin: 38.0,
    actBelow: 35.0,
    critMin: 39.4,
    escalateAfterHours: 24,
  },
  spo2: {
    okMin: 95,
    watchMin: 90, // 90–94
  },
  glucose: {
    okMin: 70,
    okMax: 140,
    watchLowMin: 54, // 54–69
    watchHighMax: 180, // 141–180
    critAbove: 250,
  },
  sleep: {
    okMin: 7,
    watchMin: 6, // 6–6.9
    nightsInRow: 3,
  },
  mood: {
    okMin: 3,
    lowMax: 2,
    daysInRow: 3,
  },
  radiation: {
    careerLimitDefault: 600,
    watchPct: 50, // 50–79 %
    actPct: 80,
    spikeFactor: 3,
    avgWindowDays: 7,
  },
  rules: {
    baselinePct: 15,
    trendReadings: 3,
  },
  exercise: {
    targetMin: 150, // 2 h 30 min per day
    okPct: 90, // ≥ 90 % of target
    watchPct: 60, // 60–89 %; below 60 % → ACT
  },
} as const;

// ---------------------------------------------------------------------------
// Rule texts
// ---------------------------------------------------------------------------
export const CONTEXT_OPTIONS = ['Just exercised', 'After EVA', 'Just woke up', 'None'] as const;
export type ContextOption = (typeof CONTEXT_OPTIONS)[number];
export const EXERTION_CONTEXTS: ContextOption[] = ['Just exercised', 'After EVA'];
export const EXERTION_NOTE = 'Exercise or EVA can affect this reading. Follow its current guidance and re-measure; the alert remains active.';
export const EXERTION_RECHECK = 'Rest and re-measure as directed above.';

export const LABEL_UNUSUAL = 'Unusual for you';
export const LABEL_TRENDING = 'Trending worse';
export const LABEL_LOW_BP = 'Fainting risk';
export const LABEL_SOLAR = 'Dose spike';

export const FOOTER_TEXT = 'Decision support — app alert rules are not clinically validated and do not diagnose illness.';
export const GLUCOSE_NOTE = 'The 70–140 mg/dL finger-stick band and high-glucose alerts are app-designed; fasting, meal timing and test method affect interpretation.';
export const RADIATION_LIMIT_NOTE = 'NASA’s limit applies to career effective dose, including past flights; this app sums mission entries only.';
export const APP_DESIGNED_NOTE = 'Alert colors and escalation rules are app-designed. Linked references show which facts they support.';
export const WHY_HEADER = 'Contributing factors — not a diagnosis.';

export const ESCALATION: Record<Location, string> = {
  ISS: 'Contact the flight surgeon on the ground now.',
  MOON: 'About 1.3 s delay. Contact the ground and start the first steps while you talk.',
  MARS: 'Messages take several minutes (up to ~20 min one way). Do the self-care checklist first, with the crew medical officer, then send the summary report to Earth.',
};

export const LOCATION_LABEL: Record<Location, string> = { ISS: 'ISS', MOON: 'Moon', MARS: 'Mars' };

export type PatternId = 'P1' | 'P2' | 'P3';
export interface PatternDef {
  id: PatternId;
  title: string;
  rule: string;
  actions: string[];
  escalate: boolean;
  indicators: IndicatorId[];
}

export const PATTERNS: Record<PatternId, PatternDef> = {
  P1: {
    id: 'P1',
    title: 'Possible infection / immune stress',
    rule: 'Temperature 37.5 °C or higher, sleep under 6 h and mood 2 or lower (same day or previous day).',
    actions: [
      'Drink fluids and rest.',
      'Re-measure temperature in 4 hours.',
      'Tell the crew medical officer today.',
    ],
    escalate: true,
    indicators: ['temp', 'sleep', 'mood'],
  },
  P2: {
    id: 'P2',
    title: 'Possible breathing or oxygen problem',
    rule: 'Heart rate above 100 bpm and SpO2 below 95 %.',
    actions: [
      'Sit still and re-check the finger probe.',
      'Re-measure SpO2 and heart rate now.',
      'Escalate.',
    ],
    escalate: true,
    indicators: ['hr', 'spo2'],
  },
  P3: {
    id: 'P3',
    title: 'Possible fluid loss / fainting risk',
    rule: 'Systolic blood pressure below 90 mmHg and heart rate above 100 bpm.',
    actions: ['Drink fluids.', 'Lie down.', 'Escalate.'],
    escalate: true,
    indicators: ['bp', 'hr'],
  },
};

// ---------------------------------------------------------------------------
// Body zones (hotspots on the 3D suit)
// ---------------------------------------------------------------------------
export interface ZoneDef {
  id: ZoneId;
  name: string;
  indicators: MetricId[];
  side: 'left' | 'right';
}

// Each zone sits on the same side as its organ (front view; viewer's left = astronaut's right).
// Within a side, zones are ordered top to bottom by the vertical position of their organ.
export const ZONES: ZoneDef[] = [
  { id: 'head', name: 'Head / Brain', indicators: ['sleep', 'mood'], side: 'left' },
  { id: 'lungs', name: 'Lungs', indicators: ['spo2'], side: 'left' },
  { id: 'abdomen', name: 'Abdomen', indicators: ['glucose'], side: 'left' },
  { id: 'dosimeter', name: 'Chest dosimeter', indicators: ['radiation'], side: 'right' },
  { id: 'heart', name: 'Heart', indicators: ['bp', 'hr'], side: 'right' },
  { id: 'body', name: 'Whole body', indicators: ['temp'], side: 'right' },
  { id: 'legs', name: 'Muscles & Bones', indicators: ['exercise'], side: 'right' },
];

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------
export interface ChartBand {
  from: number;
  to: number;
  status: Status;
}

export interface Indicator {
  id: MetricId;
  name: string;
  unit: string;
  decimals: number;
  inputMin: number;
  inputMax: number;
  inputStep: number;
  inputHint: string;
  thresholds: Record<Status, string>;
  chartBands: ChartBand[];
  chartDomain: [number, number];
  spaceFactors: string[];
  guidance: Record<Status, string[]>;
  meaning: Record<Status, string>;
  bodyZone: ZoneId;
  nasaRiskUrl: string;
  sourceLabel: string;
  appDesigned?: string;
}

const NASA_CARDIO = 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/';

export const INDICATORS: Record<IndicatorId, Indicator> = {
  bp: {
    id: 'bp',
    name: 'Blood pressure',
    unit: 'mmHg',
    decimals: 0,
    inputMin: 50,
    inputMax: 260,
    inputStep: 1,
    inputHint: 'Systolic / diastolic, at rest',
    thresholds: {
      OK: 'Systolic below 120 and diastolic below 80',
      WATCH: 'Systolic 120–139 or diastolic 80–89; or low: systolic below 90 or diastolic below 60 (fainting risk; source: NHLBI)',
      ACT: 'Systolic 140 or higher, or diastolic 90 or higher',
      CRITICAL: 'Systolic above 180 or diastolic above 120',
    },
    chartBands: [
      { from: 40, to: 90, status: 'WATCH' },
      { from: 90, to: 120, status: 'OK' },
      { from: 120, to: 140, status: 'WATCH' },
      { from: 140, to: 180, status: 'ACT' },
      { from: 180, to: 220, status: 'CRITICAL' },
    ],
    chartDomain: [40, 200],
    spaceFactors: [
      'Microgravity shifts body fluids toward the head and changes how the heart and vessels work.',
      'Low blood pressure raises fainting risk at landing.',
      'Longer missions raise the risk.',
    ],
    guidance: {
      OK: ['Keep up regular exercise.', 'Eat a healthy diet.', 'Drink fluids, especially before landing or a gravity change.'],
      WATCH: [
        'Re-measure at rest.',
        'Drink fluids, especially before landing or a gravity change.',
        'Use lower-body compression garments.',
      ],
      ACT: ['Re-measure at rest.', 'Keep up regular exercise and a healthy diet.', 'Report the reading to the crew medical officer.'],
      CRITICAL: [
        'If you have chest pain, trouble breathing, weakness or other new concerning symptoms, escalate now.',
        'Otherwise, wait 1 minute and re-measure. If still this high, contact the crew medical officer immediately.',
      ],
    },
    meaning: {
      OK: 'Your blood pressure is in the normal range.',
      WATCH: 'Your blood pressure is outside the normal range. Keep an eye on it.',
      ACT: 'Your blood pressure is high. Take action today.',
      CRITICAL: 'Your blood pressure is very high. With new concerning symptoms, escalate now; otherwise repeat after 1 minute and contact the crew medical officer if still high.',
    },
    bodyZone: 'heart',
    nasaRiskUrl: NASA_CARDIO,
    sourceLabel: 'AHA blood pressure categories',
    appDesigned: 'The app combines AHA categories into its own alert colors; either low component also triggers Watch.',
  },
  hr: {
    id: 'hr',
    name: 'Heart rate',
    unit: 'bpm',
    decimals: 0,
    inputMin: 20,
    inputMax: 240,
    inputStep: 1,
    inputHint: 'Resting heart rate',
    thresholds: {
      OK: '60–100 bpm; also 50–59 if your personal baseline is below 60',
      WATCH: '101–120 bpm, or below 50 when your baseline is 60 or higher',
      ACT: 'Above 120 bpm (app-designed), or below 40 bpm (app-designed)',
      CRITICAL: '—',
    },
    chartBands: [
      { from: 20, to: 40, status: 'ACT' },
      { from: 40, to: 50, status: 'WATCH' },
      { from: 50, to: 100, status: 'OK' },
      { from: 100, to: 120, status: 'WATCH' },
      { from: 120, to: 180, status: 'ACT' },
    ],
    chartDomain: [30, 140],
    spaceFactors: [
      'Microgravity changes how the heart and vessels work.',
      'Stress, poor sleep, exercise and EVA all raise heart rate.',
    ],
    guidance: {
      OK: ['No action needed. Measure again tomorrow.'],
      WATCH: [
        'For an unusually low or high pulse with chest pain, trouble breathing, dizziness or fainting, get urgent medical help now.',
        'Otherwise, rest 10 minutes and re-measure. If it remains outside your usual range, contact the crew medical officer.',
      ],
      ACT: [
        'For an unusually low or high pulse with chest pain, trouble breathing, dizziness or fainting, get urgent medical help now.',
        'Otherwise, rest 10 minutes and re-measure. If it remains outside your usual range, contact the crew medical officer.',
      ],
      CRITICAL: [
        'For an unusually low or high pulse with chest pain, trouble breathing, dizziness or fainting, get urgent medical help now.',
        'Otherwise, rest 10 minutes and re-measure. If it remains outside your usual range, contact the crew medical officer.',
      ],
    },
    meaning: {
      OK: 'Your resting heart rate is normal.',
      WATCH: 'Your heart rate is outside your normal range.',
      ACT: 'Your heart rate is far outside the normal range.',
      CRITICAL: 'Your heart rate needs attention now.',
    },
    bodyZone: 'heart',
    nasaRiskUrl: NASA_CARDIO,
    sourceLabel: 'AHA resting heart rate',
    appDesigned: 'The 40 / 50 / 120 bpm cutoffs, baseline exception and alert mapping are app-designed.',
  },
  temp: {
    id: 'temp',
    name: 'Body temperature',
    unit: '°C',
    decimals: 1,
    inputMin: 30,
    inputMax: 43,
    inputStep: 0.1,
    inputHint: 'Oral or ear thermometer',
    thresholds: {
      OK: '35.0–37.4 °C',
      WATCH: '37.5–37.9 °C (app-designed)',
      ACT: '38.0 °C or higher (fever; source: CDC), or below 35.0 °C (hypothermia; source: Mayo Clinic)',
      CRITICAL: '39.4 °C or higher (source: Cleveland Clinic)',
    },
    chartBands: [
      { from: 34, to: 35, status: 'ACT' },
      { from: 35, to: 37.5, status: 'OK' },
      { from: 37.5, to: 38, status: 'WATCH' },
      { from: 38, to: 39.4, status: 'ACT' },
      { from: 39.4, to: 41, status: 'CRITICAL' },
    ],
    chartDomain: [35.5, 39.5],
    spaceFactors: [
      'Spaceflight stress can wake up dormant viruses.',
      'The closed environment and its microbes affect the immune system.',
    ],
    guidance: {
      OK: ['No action needed. Measure again tomorrow.'],
      WATCH: ['Drink fluids.', 'Rest.', 'Re-measure in 4 hours.'],
      ACT: [
        'Rest and drink fluids if you can do so safely.',
        'Follow the crew medical officer’s advice and re-measure as directed.',
        'Get urgent help now for serious symptoms such as trouble breathing, confusion or a stiff neck.',
      ],
      CRITICAL: ['Drink fluids and rest.', 'Escalate now.'],
    },
    meaning: {
      OK: 'Your temperature is normal.',
      WATCH: 'Your temperature is slightly raised.',
      ACT: 'Your temperature is above the app action threshold. Review symptoms and follow the recheck guidance.',
      CRITICAL: 'You have a very high fever.',
    },
    bodyZone: 'body',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/',
    sourceLabel: 'CDC fever / Cleveland Clinic fever / Mayo Clinic hypothermia',
    appDesigned: 'The 37.5 °C Watch band, color labels and fever recheck timers are app-designed; oral and ear readings differ.',
  },
  spo2: {
    id: 'spo2',
    name: 'Oxygen saturation SpO2',
    unit: '%',
    decimals: 0,
    inputMin: 50,
    inputMax: 100,
    inputStep: 1,
    inputHint: 'Finger pulse oximeter, sitting still',
    thresholds: {
      OK: '95 % or higher',
      WATCH: '90–94 %',
      ACT: '—',
      CRITICAL: 'Below 90 %',
    },
    chartBands: [
      { from: 80, to: 90, status: 'CRITICAL' },
      { from: 90, to: 95, status: 'WATCH' },
      { from: 95, to: 100, status: 'OK' },
    ],
    chartDomain: [85, 100],
    spaceFactors: [
      'Pre-EVA procedures can cause mild hypoxia.',
      'Problems with the cabin atmosphere can lower oxygen.',
    ],
    guidance: {
      OK: ['No action needed. Measure again tomorrow.'],
      WATCH: ['Sit still.', 'Check the finger probe placement.', 'Re-measure. Report if it repeats.'],
      ACT: ['Sit still.', 'Check the finger probe placement.', 'Re-measure. Report if it repeats.'],
      CRITICAL: ['Sit still and check the finger probe placement.', 'Re-measure now.', 'If it repeats, escalate.'],
    },
    meaning: {
      OK: 'Your blood oxygen is normal.',
      WATCH: 'Your blood oxygen is a little low.',
      ACT: 'Your blood oxygen is low.',
      CRITICAL: 'Your blood oxygen is too low.',
    },
    bodyZone: 'lungs',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-hypoxia/',
    sourceLabel: 'WHO Pulse Oximetry Manual',
    appDesigned: 'Watch / Critical labels adapt WHO reference values; the manual is not an astronaut self-triage protocol.',
  },
  glucose: {
    id: 'glucose',
    name: 'Blood glucose',
    unit: 'mg/dL',
    decimals: 0,
    inputMin: 20,
    inputMax: 600,
    inputStep: 1,
    inputHint: 'Finger-stick glucose meter',
    thresholds: {
      OK: '70–140 mg/dL',
      WATCH: '54–69 or 141–180 mg/dL',
      ACT: 'Below 54 or above 180 mg/dL',
      CRITICAL: 'Above 250 mg/dL',
    },
    chartBands: [
      { from: 30, to: 54, status: 'ACT' },
      { from: 54, to: 70, status: 'WATCH' },
      { from: 70, to: 140, status: 'OK' },
      { from: 140, to: 180, status: 'WATCH' },
      { from: 180, to: 250, status: 'ACT' },
      { from: 250, to: 320, status: 'CRITICAL' },
    ],
    chartDomain: [40, 200],
    spaceFactors: [
      'Food can be limited or unappealing.',
      'Appetite changes in space.',
      'Heavy workload changes how much and when you eat.',
    ],
    guidance: {
      OK: ['No action needed. Measure again tomorrow.'],
      WATCH: [
        'If low and not fully awake or unable to swallow safely: get urgent medical help now; do not give food or drink by mouth.',
        'If low, fully awake and able to swallow safely: take 15 g fast carbs, re-check after 15 minutes, repeat until 70 or higher.',
        'If high: eat a regular meal, avoid extra sweets and re-check later.',
      ],
      ACT: [
        'If low and not fully awake or unable to swallow safely: get urgent medical help now; do not give food or drink by mouth.',
        'If low, fully awake and able to swallow safely: take 15 g fast carbs, re-check after 15 minutes, repeat until 70 or higher.',
        'If high: re-check, then report to the crew medical officer.',
      ],
      CRITICAL: ['Re-check now.', 'Report to the crew medical officer and escalate.'],
    },
    meaning: {
      OK: 'Your blood glucose is within the app alert band; interpretation depends on when and how it was measured.',
      WATCH: 'Your blood glucose is outside the app alert band.',
      ACT: 'Your blood glucose crossed an app action threshold.',
      CRITICAL: 'Your blood glucose is very high.',
    },
    bodyZone: 'abdomen',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/',
    sourceLabel: 'ADA hypoglycemia / test definitions',
    appDesigned: GLUCOSE_NOTE,
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    unit: 'h',
    decimals: 1,
    inputMin: 0,
    inputMax: 16,
    inputStep: 0.1,
    inputHint: 'Hours slept last night',
    thresholds: {
      OK: '7 h or more',
      WATCH: '6–6.9 h',
      ACT: 'Below 6 h, or 3 nights in a row below 7 h',
      CRITICAL: '—',
    },
    chartBands: [
      { from: 0, to: 6, status: 'ACT' },
      { from: 6, to: 7, status: 'WATCH' },
      { from: 7, to: 12, status: 'OK' },
    ],
    chartDomain: [3, 10],
    spaceFactors: [
      'Heavy workload.',
      'Irregular light and dark: the ISS sees 16 sunrises and sunsets per day.',
      'Schedule changes disrupt sleep.',
    ],
    guidance: {
      OK: ['Keep your fixed sleep window.'],
      WATCH: ['Follow the habitat light schedule.', 'Keep a fixed sleep window.', 'Avoid late caffeine.'],
      ACT: ['Follow the habitat light schedule.', 'Keep a fixed sleep window and avoid late caffeine.', 'Use scheduled relaxation time.'],
      CRITICAL: ['Follow the habitat light schedule.', 'Keep a fixed sleep window and avoid late caffeine.', 'Use scheduled relaxation time.'],
    },
    meaning: {
      OK: 'You slept enough.',
      WATCH: 'You slept a little less than you need.',
      ACT: 'You are building sleep debt.',
      CRITICAL: 'You are building sleep debt.',
    },
    bodyZone: 'head',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/',
    sourceLabel: 'AASM/SRS',
    appDesigned: 'The 6-hour action boundary and 3-night escalation rule are app-designed.',
  },
  mood: {
    id: 'mood',
    name: 'Mood',
    unit: '/ 5',
    decimals: 0,
    inputMin: 1,
    inputMax: 5,
    inputStep: 1,
    inputHint: '1 very low … 5 very good',
    thresholds: {
      OK: '3–5',
      WATCH: '1–2 once',
      ACT: '2 or lower for 3 days in a row',
      CRITICAL: '—',
    },
    chartBands: [
      { from: 0.5, to: 2.5, status: 'WATCH' },
      { from: 2.5, to: 5.5, status: 'OK' },
    ],
    chartDomain: [1, 5],
    spaceFactors: ['Isolation and confinement.', 'Distance from Earth.', 'Tension in the team.'],
    guidance: {
      OK: ['Keep in contact with family and keep your hobby time.'],
      WATCH: ['Contact your family.', 'Exercise or take hobby time.', 'Talk to a crewmate.'],
      ACT: [
        'Have a private talk with the crew medical officer or ground psychological support.',
        'Contact your family.',
        'Talk to a crewmate.',
      ],
      CRITICAL: [
        'Have a private talk with the crew medical officer or ground psychological support.',
        'Contact your family.',
        'Talk to a crewmate.',
      ],
    },
    meaning: {
      OK: 'Your mood is fine.',
      WATCH: 'Your mood is low today.',
      ACT: 'Your mood has been low for several days.',
      CRITICAL: 'Your mood has been low for several days.',
    },
    bodyZone: 'head',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-behavioral-changes-and-psychiatric-disorders/',
    sourceLabel: 'NASA HRP',
    appDesigned: 'The 1–5 mood scale, alert levels and 3-day rule are app-designed and are not a validated psychiatric screen.',
  },
  radiation: {
    id: 'radiation',
    name: 'Radiation',
    unit: 'mSv',
    decimals: 1,
    inputMin: 0,
    inputMax: 100,
    inputStep: 0.1,
    inputHint: "Today's dose from your dosimeter",
    thresholds: {
      OK: 'Mission dose below 50 % of the career limit',
      WATCH: 'Mission dose 50–79 % of the career limit',
      ACT: 'Mission dose 80 % or more of the limit, or daily dose more than 3× the 7-day average (dose spike; cause unconfirmed)',
      CRITICAL: '—',
    },
    chartBands: [],
    chartDomain: [0, 3],
    spaceFactors: [
      'Space radiation comes from the Sun and from deep space.',
      'Solar events can raise the dose quickly.',
      'The dose adds up over your career.',
    ],
    guidance: {
      OK: ['No action needed. Keep wearing your dosimeter.'],
      WATCH: ['Keep wearing your dosimeter.', 'Follow mission control instructions on dose planning.'],
      ACT: ['Move to the shielded area of the habitat.', 'Follow mission control instructions.'],
      CRITICAL: ['Move to the shielded area of the habitat.', 'Follow mission control instructions.'],
    },
    meaning: {
      OK: 'Your logged mission dose is below the app warning band; prior career exposure is not included.',
      WATCH: 'Your mission dose is past half of your career limit.',
      ACT: 'Your logged dose crossed an app warning level or changed sharply; confirm the reading and follow mission instructions.',
      CRITICAL: 'Your logged dose crossed an app warning level or changed sharply; confirm the reading and follow mission instructions.',
    },
    bodyZone: 'dosimeter',
    nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/',
    sourceLabel: 'NASA-STD-3001 Vol.1',
    appDesigned: 'The 50% / 80% warnings and 3× dose-spike rule are app-designed; a spike does not establish a solar event.',
  },
};

export const INDICATOR_ORDER: IndicatorId[] = ['bp', 'hr', 'temp', 'spo2', 'glucose', 'sleep', 'mood', 'radiation'];

// Indicators that have a personal pre-flight baseline (radiation uses its 7-day average instead).
export const BASELINE_INDICATORS: IndicatorId[] = ['bp', 'hr', 'temp', 'spo2', 'glucose', 'sleep', 'mood'];

export type Baselines = Partial<Record<IndicatorId, ReadingValue>>;

export { SOURCES } from '../data/healthSources';

export const MODEL_CREDIT = {
  title: 'Human anatomy — skin, brain, heart, lungs, liver, stomach, leg bones and leg muscles',
  attribution:
    'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
  licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  note: 'Source attribution and rebuild instructions are documented in scripts/anatomy-sources.md. The derived anatomy model retains its source attribution.',
  changes:
    'Selected BodyParts3D 4.0 meshes and complete lung lobe surfaces from 3.0, merged, smoothly shaded, simplified and Draco-compressed; a skin outline and chest dosimeter marker were added.',
};

/** 2D body diagram credit (not used on screen while the 3D model is shown). */
export const BODY_CREDIT = {
  author: 'Mikael Häggström',
  project: 'Wikimedia Commons — Human body diagrams',
  projectUrl: 'https://commons.wikimedia.org/wiki/Human_body_diagrams',
  license: 'Public domain',
  files: [
    {
      name: 'Man shadow anatomy - expanded.svg',
      url: 'https://commons.wikimedia.org/wiki/File:Man_shadow_anatomy_-_expanded.svg',
      license: 'Public domain',
      used: 'Male silhouette and the organ layers: brain, heart and lungs, heart, liver, stomach, thigh and lower-leg muscles.',
    },
  ],
  changes: 'Silhouette and organ layers extracted unchanged (scripts/extract-body.py); colors applied at runtime by status.',
};

// ---------------------------------------------------------------------------
// Context Explorer ("Why" tab) — factor names and texts
// ---------------------------------------------------------------------------
export type FactorId = 'workload' | 'sleep' | 'eva' | 'hydration' | 'missionDay' | 'location';
export type FactorLevel = 'Low' | 'Medium' | 'High';

export const FACTOR_NAMES: Record<FactorId, string> = {
  workload: 'Workload / exercise',
  sleep: 'Sleep loss',
  eva: 'EVA',
  hydration: 'Hydration',
  missionDay: 'Mission day',
  location: 'Location',
};

export const FACTOR_TEXT = {
  workloadHigh: 'You measured right after exercise or EVA.',
  workloadMedium: 'Exercise or EVA was logged in the last 2 days.',
  workloadLow: 'No exercise logged before this reading.',
  sleepNoData: 'No sleep data for this day.',
  sleepDebt: (n: number) => `${n} nights in a row under 7 h.`,
  sleepHours: (h: string) => `${h} h of sleep last night.`,
  evaHigh: 'This reading was taken after an EVA.',
  evaMedium: 'An EVA was logged in the last 3 days.',
  evaLow: 'No EVA in the last 3 days.',
  hydrationHigh: 'Estimated: low blood pressure or a fast heart rate can mean fluid loss.',
  hydrationMedium: 'Estimated: a raised temperature increases fluid loss.',
  hydrationLow: 'Estimated from blood pressure, heart rate and temperature: no sign of fluid loss.',
  missionEarly: 'First week: the body is still adapting to microgravity.',
  missionLate: 'Longer time in space adds up the effects of spaceflight.',
  missionMid: 'The body has adapted to microgravity.',
  location: {
    ISS: 'ISS: help from the ground is near real-time.',
    MOON: 'Moon: about 1.3 s delay; help is further away.',
    MARS: 'Mars: messages take up to ~20 min one way; the crew must act alone first.',
  } as Record<Location, string>,
};

// ---------------------------------------------------------------------------
// Interpretation sentences (panel Overview + check-in result)
// ---------------------------------------------------------------------------
export const INTERPRET_TEXT = {
  unusual: (pct: string, dir: 'above' | 'below') => `That is ${pct} ${dir} your personal baseline.`,
  trending: 'It got worse in each of the last 3 readings.',
  lowBp: 'Low blood pressure can make you faint, especially at landing.',
  solar: "Today's dose is more than 3× your 7-day average. This app-designed spike flag does not determine the cause.",
  noData: 'No reading for this day.',
  exercise: (min: number, target: number) => `That is ${Math.round((min / target) * 100)}% of your ${target}-minute daily target.`,
};

export const STORY_STEPS = [
  { id: 'measure', label: 'Measure', help: 'Start a check-in to record today’s 8 indicators.' },
  { id: 'visualize', label: 'Visualize', help: 'See each reading on the body.' },
  { id: 'compare', label: 'Compare', help: 'Compare with your own baseline and trend.' },
  { id: 'interpret', label: 'Interpret', help: 'Understand why space affects this reading.' },
  { id: 'followup', label: 'Follow-up', help: 'Tick the actions you take; escalate when needed.' },
] as const;
export type StoryStepId = (typeof STORY_STEPS)[number]['id'];

// ---------------------------------------------------------------------------
// Leg exercise (Legs zone). Not one of the 8 check-in indicators.
// ---------------------------------------------------------------------------
export const EXERCISE: Indicator = {
  id: 'exercise',
  name: 'Leg exercise',
  unit: 'min',
  decimals: 0,
  inputMin: 0,
  inputMax: 1440,
  inputStep: 5,
  inputHint: 'Minutes of exercise today',
  thresholds: {
    OK: '90 % of the daily target or more',
    WATCH: '60–89 % of the daily target',
    ACT: 'Below 60 % of the daily target',
    CRITICAL: '—',
  },
  chartBands: [
    { from: 0, to: 90, status: 'ACT' },
    { from: 90, to: 135, status: 'WATCH' },
    { from: 135, to: 300, status: 'OK' },
  ],
  chartDomain: [0, 180],
  spaceFactors: [
    'In microgravity the legs carry no body weight.',
    'Without load, leg muscles shrink and bones lose mineral.',
    'Daily resistance and treadmill exercise protects muscles and bones.',
  ],
  guidance: {
    OK: ['Keep your daily exercise schedule.'],
    WATCH: ['Add the missing minutes later today.', 'Include resistance exercise for the legs.'],
    ACT: [
      'Add the missing minutes later today.',
      'Include resistance exercise for the legs.',
      'Tell the crew medical officer if you cannot exercise.',
    ],
    CRITICAL: ['Add the missing minutes later today.', 'Tell the crew medical officer if you cannot exercise.'],
  },
  meaning: {
    OK: 'Your logged exercise is within the app planning range.',
    WATCH: 'You are below your exercise target today.',
    ACT: 'You did much less exercise than your target today.',
    CRITICAL: 'You did much less exercise than your target today.',
  },
  bodyZone: 'legs',
  nasaRiskUrl: 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/',
  sourceLabel: 'NASA ISS exercise allocation',
  appDesigned: 'The app uses 150 logged minutes as a planning target. The 90% / 60% alerts are app-designed; scheduled ISS time includes setup and recovery.',
};

export function metricDef(id: MetricId): Indicator {
  return id === 'exercise' ? EXERCISE : INDICATORS[id];
}

/** "2 h 10 min" */
export function fmtMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r.toLocaleString('en-US')} min`;
  return `${h.toLocaleString('en-US')} h${r ? ` ${r.toLocaleString('en-US')} min` : ''}`;
}

/** Short labels used inside the callout cards. */
export const CARD_LABEL: Record<MetricId, string> = {
  bp: 'Blood pressure',
  hr: 'Heart rate',
  temp: 'Temperature',
  spo2: 'SpO2',
  glucose: 'Glucose',
  sleep: 'Sleep',
  mood: 'Mood',
  radiation: 'Mission dose',
  exercise: 'Exercise today',
};

/** Shorter labels for cards that show two values side by side (unit shown in the label). */
export const CARD_LABEL_DUAL: Partial<Record<MetricId, string>> = { bp: 'BP', hr: 'HR', sleep: 'Sleep', mood: 'Mood' };

/** Long explanation for the Legs zone (shown in the side panel). */
export const LEGS_TEXT =
  'Microgravity weakens leg muscles and bones. Do your daily resistance and treadmill exercise to protect them.';

/** Bone-loss fact shown in the Muscles & Bones side panel (source: NASA bone risk page). */
export const BONE_TEXT =
  'In space, bones lose 1–1.5% of their density per month on 4–6 month missions. Exercise is a key part of preventing this.';

// ---------------------------------------------------------------------------
// How to measure — 3 short steps per indicator (check-in + side panel)
// ---------------------------------------------------------------------------
export const HOW_TO: Record<IndicatorId, [string, string, string]> = {
  bp: [
    'Sit still for 5 minutes, feet flat, arm resting at heart level.',
    'Wrap the cuff on your bare upper arm, about 2 cm above the elbow.',
    'Stay still and silent during the reading; note both numbers.',
  ],
  hr: [
    'Rest seated for 5 minutes before measuring.',
    'Read the monitor, or count your wrist pulse for 30 seconds and double it.',
    'If you just exercised or did an EVA, say so in the context question.',
  ],
  temp: [
    'Do not eat or drink for 15 minutes before measuring.',
    'Place the thermometer under your tongue (or in the ear for an ear thermometer).',
    'Keep your mouth closed until it beeps, then read the value.',
  ],
  spo2: [
    'Sit still for 1 minute.',
    'Clip the oximeter on a finger without nail polish.',
    'Wait for a stable reading for 30 seconds.',
  ],
  glucose: [
    'Wash and dry your hands.',
    'Prick the side of a fingertip and put the first good drop on the test strip.',
    'Read the value and note if you ate in the last 2 hours.',
  ],
  sleep: [
    'Open your sleep tracker, or note when you fell asleep and woke up.',
    'Count only time asleep, not time awake in the sleep station.',
    'Enter hours with one decimal, for example 6.5.',
  ],
  mood: [
    'Take a quiet moment before answering.',
    'Think about the last 24 hours, not only this minute.',
    'Choose 1 (very low) to 5 (very good). There is no wrong answer.',
  ],
  radiation: [
    'Read your personal dosimeter at the end of the day.',
    "Enter today's dose in mSv, not the mission total.",
    'Keep wearing the dosimeter on your chest.',
  ],
};

// ---------------------------------------------------------------------------
// Daily routine, reminders and light gamification
// ---------------------------------------------------------------------------
export type RoutineSlot = 'morning' | 'evening' | 'weekly';
export interface RoutineGroup {
  slot: RoutineSlot;
  label: string;
  indicators: IndicatorId[];
  /** Local hour from which the check is due (today only). */
  dueFromHour: number;
  daily: boolean;
}
export const ROUTINE: RoutineGroup[] = [
  { slot: 'morning', label: 'Morning', indicators: ['hr', 'bp', 'spo2', 'temp', 'sleep', 'mood'], dueFromHour: 5, daily: true },
  { slot: 'evening', label: 'Evening', indicators: ['radiation'], dueFromHour: 18, daily: true },
  { slot: 'weekly', label: 'Weekly', indicators: ['glucose'], dueFromHour: 5, daily: false },
];
export const ROUTINE_LABEL: Record<IndicatorId, string> = {
  hr: 'Heart rate',
  bp: 'Blood pressure',
  spo2: 'SpO2',
  temp: 'Temperature',
  sleep: 'Sleep',
  mood: 'Mood',
  radiation: 'Dosimeter',
  glucose: 'Glucose',
};
export const GAMIFICATION = {
  pointsPerCheck: 10,
  weeklyWindowDays: 7,
};
