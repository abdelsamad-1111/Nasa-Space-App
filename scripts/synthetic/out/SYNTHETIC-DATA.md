# VITALS-ORBIT synthetic dataset

SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.

## Plain-language summary

- These readings describe fictional people, and no real astronaut is represented.
- Research guides selected values; every additional design choice is identified.
- Illness, fluid loss, short sleep, spacewalks, and radiation changes are deliberately staged.
- The package includes complete readings and matching versions with missed check-ins.
- This package supports software demonstrations; it does not prove that a medical alert is correct.

## الملخص بالعربي

هذه بيانات اصطناعية مبنية جزئيًا على أبحاث، وليست قياسات رواد فضاء حقيقيين ولا تحققًا طبيًا. النسخة الأساسية فيها قراءات مفقودة واقعية، ونسخة clean فيها نفس القيم بلا غياب. الحالات الصحية معلّمة عمدًا حتى تستخدموها لاحقًا لاختبار البرنامج. لا توجد هنا نتائج لدقة التنبيهات أو التنبؤات، لأن محرك التطبيق غير متاح.

## Scope and compatibility

Created 20 fictional people × 180 mission days = 3,600 rows per mission CSV; seed 42. This is an illustrative collection, not a real simultaneous ISS crew. Only data generation, documentation, and data-level checks were requested at this stage.

The app source was not provided. Units, clipping guards, context names, weekly glucose phase, exercise units, and the Settings.baselines-compatible object are standalone assumptions. Exact app enum, range, and timestamp compatibility is NOT claimed. No app source, thresholds, tests, or build were changed or run. evaluateDay, detectPatterns, forecastAll, detection sensitivity, precision, lead time, AUC, Brier, and forecast MAE were NOT evaluated.

## Synthetic vs source — main clean scenario A

| Check | Synthetic | Target ± acceptance tolerance | Result | Meaning |
| --- | --- | --- | --- | --- |
| Event-free systolic after adaptation | 105.89953 | 106.00000 ± 2 | PASS | Input-consistency check; ambulatory-to-seated transfer is assumed |
| Sleep mean, all nights including events | 6.09000 | 6.09000 ± 0.03 | PASS | Calibrated input-consistency check |
| Nights with at least seven hours of sleep | 0.25583 | 0.24229 ± 0.05 | PASS | Only held-out independent source check; not used for calibration |
| Event-free oral temperature, main no-shift scenario | 36.16268 | 36.16000 ± 0.12 | PASS | Input-consistency check; Earth oral-temperature proxy |
| Event-free resting heart rate | 59.23390 | 59.50000 ± 1 | PASS | Input-consistency check against supplied Earth-proxy summary |
| Mean exported rounded mood, all days | 3.18000 | 3.18000 ± 0.002 | PASS | Calibrated input-consistency check against supplied summary |
| Days with mood two or lower | 0.09167 | 0.08300 ± 0.05 | PASS | Prior calibration diagnostic; NOT an independent source check |
| Per-person total mission effective dose, including solar event | 57.47 to 74.77 | 40 to 90 | PASS | Approximate input-consistency check; acceptance bounds are assumptions |

Most checks confirm the generator agrees with its own chosen inputs; calibrated means are not external validation. The share of nights with seven or more hours is the only held-out independent source check. Its source value is calculated from Table 2 as the sum of the ISS seven-to-eight-hour and eight-plus-hour counts divided by recorded ISS nights. Neither this proportion nor the mood-tail proportions are optimization objectives. Means are checked on complete data; missingness changes observed averages slightly.

The source sleep mean is measured by actigraphy. Simulated nightly variability uses an Earth proxy rather than the published astronaut aggregate SD. The source-match acceptance tolerances are team engineering choices, predeclared in the registry, not clinical validation limits. A passing tolerance does not mean an exact match to every research distribution.

## Scenarios — clean data, identical schedules and random draws

| Scenario | Event sizes | Assumed oral rise (C) | Sleep mean (h) | Mood mean | Temperature mean (C) | Per-person mission dose (mSv) |
| --- | --- | --- | --- | --- | --- | --- |
| A | default | 0.0 | 6.0900 | 3.1800 | 36.2087 | 57.47–74.77 |
| B | default | 1.0 | 6.0900 | 3.1800 | 37.0029 | 57.47–74.77 |
| C | small | 0.0 | 6.1238 | 3.1989 | 36.1956 | 57.08–74.33 |
| D | large | 0.0 | 6.0521 | 3.1592 | 36.2207 | 58.87–76.56 |

A = main, B = oral-temperature sensitivity, C = small events, D = large events. Sleep and rounded-mood means are calibrated ONCE using A. The same latent baselines, correction offsets, event times, event severity quantiles, daily noise, and missingness masks are reused in all scenarios. Therefore C and D intentionally have different overall sleep/mood means; they have not been re-fitted to conceal the different event sizes. B changes only oral temperature. The fever-to-HR coefficient applies only to infection temperature increments, not the assumed benign temperature adaptation.

## Parameters and source quality

| Status | Registry entries |
| --- | --- |
| VERIFIED | 17 |
| DATA | 11 |
| VERIFY | 0 |
| ASSUMPTION | 135 |

VERIFIED means the numerical finding was read in primary source text or an explicitly qualified indexed primary extract; it does not verify portability to this simulation. DATA means PMData summary values supplied in the brief from a prior analysis. Raw PMData files were not reprocessed, so those values have not been independently reproduced here. Each PMData entry is labelled Earth proxy (non-astronaut Fitbit users). The latent mood noise is classified ASSUMPTION because it is a calibration choice rather than an observed measurement. VERIFY has no entries: the unresolved Empirical Health BP-noise claim is conservatively classified ASSUMPTION.

The systolic spaceflight shift was measured in ambulatory averages over a full day including sleep and activity. Applying it to a seated morning sample is assumed. The spaceflight temperature study measured core temperature using a forehead heat-flux sensor. It did not establish the same oral-temperature shift; B is a sensitivity case, not an oral-temperature finding. The Earth fever HR coefficient and hypovolemia direction also require unverified transfer to this setting. Source access qualifications appear in synthetic-parameters.json; source titles are used without guessed author attributions.

All selected observational means, spreads, rates, event magnitudes, profiles, RNG seeds, missingness rates, units, precisions, technical guards, and acceptance tolerances are in parameters.py. Provenance Markdown/CSV and the JSON registry are exported from that registry. The data dictionary maps each measurement to parameter keys. Numbers computed by the generator—random draws, offsets, episode times, simulated pre-flight means—are derived outputs, not additional factual parameters.

This is not NASA-only data: several inputs are Earth studies, supplied PMData summaries, or team assumptions. It must not be presented as a NASA dataset. The career radiation limit is context only; the radiation column is a synthetic daily EFFECTIVE dose, not absorbed dose, a device raw count, or cumulative career dose.

## Event ground truth

| Event | Episodes (solar is one shared episode) | Affected person-days |
| --- | --- | --- |
| eva | 60 | 60 |
| sleep_debt | 60 | 471 |
| fluid_loss | 20 | 120 |
| infection | 40 | 200 |
| solar_event | 1 | 40 |

Episode counts and sizes are scenario-design choices, not estimates of real event incidence. Individual events are separated by a gap; the shared solar event may overlap other events. The events column is none when no episode is active, otherwise event:phase tokens. An episode is retained in ground truth when its readings are missing. Peak day, duration, severity quantiles, and size-specific magnitudes are in synthetic-events.json.

The sleep-to-mood effect uses the previous night's exported sleep, so it can persist one day after a sleep-affecting episode ends. synthetic-day-labels.csv flags that carryover separately. Future false-alarm analyses should define whether to exclude those carryover days; events=none alone does not guarantee that prior-event effects have vanished. Not every staged event necessarily crosses an app alarm threshold, and this package makes no event-detection claim.

## Missing data and baselines

The realistic files have 153 missed morning bundles and 89 missed evening dosimeter readings. Morning gaps remove BP, HR, oral temperature, oxygen saturation, sleep, mood, and glucose when scheduled. Exercise stays present. Glucose not scheduled is always not_measured. There are no silently empty measurement cells.

Clean files contain precisely the same underlying values as their realistic partner. Each scenario shares a missingness mask from a separate RNG. The context column is a JSON object: parse it as JSON after parsing the CSV, and map the strings to the app enums later. Radiation is an evening reading of that day's effective dose. BP and HR on EVA days use After EVA; the other indicators retain their individual contexts. The missing check-in bundle also applies to the rescheduled post-EVA BP/HR samples as an explicit operational assumption.

Latent personal baselines are re-centered and re-scaled to exact crew means and sample SDs before offsets, clipping, or rounding. The pre-flight object is instead calculated from simulated recorded daily calibration readings, so its finite-sample means and spread need not equal the latent targets. A broad per-astronaut dictionary and bp {sys,dia} candidate mapping are exported, but the app's Settings type has not been inspected. The synthetic pre-flight dose is only a reference for schema completeness, not a terrestrial exposure estimate.

Offline sleep and mood corrections compensate for average event and sleep-link effects, plus finite-sample and rounding drift. They are fixed for all cases and also applied to the synthetic pre-flight personal reference profile. This offline construction uses the full scenario and must not be mistaken for a prospective model trained only on past days.

## File selection

Use synthetic-astronauts.csv for the main realistic scenario and synthetic-astronauts-clean.csv for its complete counterpart. The tempshift, small, and large suffixes select B, C, and D; each has a clean counterpart. synthetic-preflight.csv contains calibration rows with negative mission days. synthetic-meta.json contains configuration and per-person baselines. synthetic-validation.json contains only data checks and descriptive summaries. synthetic-events.json and synthetic-day-labels.csv contain ground truth. synthetic-provenance.md/.csv and synthetic-parameters.json describe every parameter.

## Reproduction

```bash
python -m pip install -r requirements.txt
python generate.py
python verify_outputs.py
```

Run from scripts/synthetic. NumPy is the only third-party dependency. Change parameters.py to change model assumptions. Optional --seed, --crew-size, --days, and --out arguments are recorded as parameter-registry overrides in the output. If the mission length is shortened, edit the fixed solar event and event schedule parameters as well. Regenerate provenance and data together; do not edit generated CSV cells by hand.

## Findings and next steps

The delivered artifacts reproduce the declared main-scenario means within the predeclared tolerances. The held-out sleep-tail check and supplied mood-tail diagnostic are printed above even if they fail. Technical clipping and minimum pulse-pressure repair counts are retained per scenario in the validation JSON. These guard-induced changes should be reviewed before using the data for quantitative method comparisons.

Confirm the app's actual units, technical input bounds, context enums, routine, baseline structure, and timing before integration. Once its engine is available, evaluate event-size-specific episode detection and alert-day precision, separate adaptation-related alarms from noise, and report misses. No threshold recommendation is inferred from data generation alone.

**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**
