# VITALS-ORBIT — app engine on the synthetic crew

**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**

## Plain-language summary

- On normal days (no illness or staged event), the app showed at least one non-green indicator on 91.6% of days. Most of these come from sleep (85.2% of days), exercise (74.4%) and blood pressure (67%).
- Many blood-pressure flags are the normal space adaptation: in flight the top number drops compared with the Earth (pre-flight) baseline, and the app marks it "Unusual for you" (about 28.2% of normal days).
- The "Unusual for you" rule also fires when things get better: sleeping more than usual (13.5% of normal days) or a better mood than usual (12.2%).
- Staged infections: the temperature rule caught 24 of 40. When it fired, it was inside a real infection on 45 of 54 days. The missed ones never reached 37.5 °C (highest readings 36.6–37.4 °C). Staged fluid loss: 11 of 20 caught, but its low-BP signal also fires on many normal days (only 27 of 333 alert days were inside a real fluid-loss event).
- If body temperature really rises about 1 °C in flight (scenario B, an assumption), the temperature card turns non-green on 22% of normal days, and only 140 of 827 temperature alert days are real infections.

These results describe how the app's rules behave on simulated data with staged events of an assumed size. They are not real-world accuracy and not clinical validation.

## Recommendations for the team (NOT applied — thresholds were not changed)

1. Make "Unusual for you" one-directional for sleep, mood and SpO2: flag only changes in the worse direction.
2. Use an in-flight baseline (for example the median of mission days 8–21) for blood pressure and temperature, so the normal space adaptation is not flagged every day.
3. Sleep: 85.2% of normal days are non-green because the published ISS average is about 6 h. Consider judging sleep against the astronaut's own in-flight usual, and keep ACT for clearly short or persistent sleep loss.
4. Exercise target: the app uses 150 min/day; the astronauts in the 2019 Circulation BP study trained up to about 2 h/day. Consider 120 min.
5. Very low temperature: 12 healthy-day readings were below 35.0 °C and triggered a hypothermia ACT. They follow the published healthy day-to-day temperature spread (0.40 °C), so one low oral reading is not rare. Consider "re-measure first" before a hypothermia alert from a single oral reading.
6. Heart rate: readings below 50 bpm are always WATCH, and 50–59 bpm are WATCH when the baseline is 60 or more. Fit astronauts often sit in this range, so heart rate is non-green on 20.8% of normal days (range rule 19.4%). Consider judging low heart rate against the personal baseline only.

## How the data was fed to the app

| Synthetic field | App field | Time | Context / notes |
| --- | --- | --- | --- |
| bp_sys + bp_dia | bp {sys, dia} | 07:30 | context.bp "After EVA" → ["After EVA"], otherwise ["Just woke up"] |
| hr | hr | 07:31 | context.hr "After EVA" → ["After EVA"], otherwise ["Just woke up"] |
| temp | temp | 07:32 | ["Just woke up"] |
| spo2 | spo2 | 07:33 | ["Just woke up"] |
| glucose | glucose | 07:34 | ["Just woke up"]; "not_measured" → no measurement |
| sleep | sleep | 07:35 | ["Just woke up"] |
| mood | mood | 07:36 | ["Just woke up"] |
| radiation | radiation (daily dose) | 19:00 | ["None"]; "missed_dosimeter" → no measurement |
| exercise | exercise (minutes) | 07:38 | ["None"] |
| "missed_checkin" in any morning cell | no measurement for that indicator |  |  |
| synthetic-meta.json candidate_settings_baselines | Settings.baselines (BASELINE_INDICATORS + bp), rounded to app input precision |  | location ISS, careerRadiationLimit 600 |

Normal ("event-free") day: active_events = none, previous_day_sleep_event = none, mission day > 7; days with no morning readings are not counted.

## False alarms on normal days

| Scenario | Normal days | Any non-green | Any ACT | Pattern cards | Readings < 35.0 °C |
| --- | --- | --- | --- | --- | --- |
| A — Main: default events, no temperature rise | 2479 | 91.6% | 56% | 0% | 12 |
| B — Assumed +1.0 °C oral temperature rise in flight | 2479 | 92.5% | 57.2% | 2.1% | 1 |
| C — Small events | 2479 | 91.6% | 55.9% | 0% | 12 |
| D — Large events | 2479 | 91.6% | 56% | 0% | 12 |

### Per indicator, scenario A (share of normal days)

| Indicator | Days | Non-green | ACT | Range rule | "Unusual for you" | "Trending worse" | Space adaptation (BP) | Better than usual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bp | 2370 | 67% | 4.7% | 47.2% | 35% | 3.2% | 28.2% | — |
| hr | 2370 | 20.8% | 0% | 19.4% | 0.4% | 1.5% | — | — |
| temp | 2370 | 2.6% | 0.5% | 0.7% | 0% | 2% | — | — |
| spo2 | 2370 | 0.5% | 0% | 0.2% | 0% | 0.3% | — | 0% |
| glucose | 334 | 9.3% | 0% | 0% | 7.8% | 2.1% | — | — |
| sleep | 2370 | 85.2% | 56.7% | 71.4% | 43.7% | 4.3% | — | 13.5% |
| mood | 2370 | 30.1% | 0.2% | 5.7% | 30.1% | 0% | — | 12.2% |
| radiation | 2425 | 0% | 0% | 0% | 0% | 0% | — | — |
| exercise | 2479 | 74.4% | 9.5% | 74.4% | 0% | 0% | — | — |

A reading can be raised by more than one rule, so the rule columns can add up to more than "Non-green". "Space adaptation (BP)" counts BP alerts that are either the low-BP "Fainting risk" label or only "Unusual for you" with the top number below the pre-flight baseline. "Better than usual" counts "Unusual for you" alerts where the reading is higher (better) than the baseline.

Scenario B changes only temperature: its temperature row is 22% non-green (A: 2.6%).

## Staged events — detection

Strict detectors (what a crew member would act on) and lenient detectors (any non-green card on the related indicators).

| Scenario | Detector | Caught | Before peak | Median days before peak | Alert days | Inside a real event |
| --- | --- | --- | --- | --- | --- | --- |
| A | infection: temperature ≥ 37.5 °C or pattern P1 | 24 of 40 | 6 | 0 | 54 | 45 (83.3%) |
| A | fluid_loss: BP "Fainting risk" label, heart rate > 100 at rest, or pattern P3 | 11 of 20 | 7 | 1 | 333 | 27 (8.1%) |
| A | infection_any_alert: any non-OK temperature status (range, baseline or trend) or pattern P1 | 27 of 40 | 16 | 1 | 154 | 60 (39%) |
| A | fluid_loss_any_alert: any non-OK blood pressure or heart rate status, or pattern P3 | 20 of 20 | 20 | 3 | 2402 | 99 (4.1%) |
| B | infection: temperature ≥ 37.5 °C or pattern P1 | 38 of 40 | 33 | 2 | 827 | 140 (16.9%) |
| B | fluid_loss: BP "Fainting risk" label, heart rate > 100 at rest, or pattern P3 | 11 of 20 | 7 | 1 | 333 | 27 (8.1%) |
| B | infection_any_alert: any non-OK temperature status (range, baseline or trend) or pattern P1 | 38 of 40 | 33 | 2 | 879 | 141 (16%) |
| B | fluid_loss_any_alert: any non-OK blood pressure or heart rate status, or pattern P3 | 20 of 20 | 20 | 3 | 2402 | 99 (4.1%) |
| C | infection: temperature ≥ 37.5 °C or pattern P1 | 19 of 40 | 3 | 0 | 36 | 27 (75%) |
| C | fluid_loss: BP "Fainting risk" label, heart rate > 100 at rest, or pattern P3 | 9 of 20 | 6 | 1 | 328 | 22 (6.7%) |
| C | infection_any_alert: any non-OK temperature status (range, baseline or trend) or pattern P1 | 25 of 40 | 10 | 0 | 134 | 39 (29.1%) |
| C | fluid_loss_any_alert: any non-OK blood pressure or heart rate status, or pattern P3 | 20 of 20 | 20 | 3 | 2385 | 95 (4%) |
| D | infection: temperature ≥ 37.5 °C or pattern P1 | 35 of 40 | 13 | 0 | 80 | 71 (88.8%) |
| D | fluid_loss: BP "Fainting risk" label, heart rate > 100 at rest, or pattern P3 | 14 of 20 | 7 | 0.5 | 338 | 32 (9.5%) |
| D | infection_any_alert: any non-OK temperature status (range, baseline or trend) or pattern P1 | 36 of 40 | 20 | 1 | 176 | 82 (46.6%) |
| D | fluid_loss_any_alert: any non-OK blood pressure or heart rate status, or pattern P3 | 20 of 20 | 20 | 3 | 2412 | 100 (4.1%) |

Event sizes are assumptions (C = small, D = large). Read results as "detects events of this size", never as real-world accuracy. Missed episodes with their daily readings are listed in app-evaluation.json.

## Other checks

- Evaluated separately: see FORECAST.md (src/brain/forecast.ts, early-warning model trained on a separate synthetic crew).
- Not evaluated as a separate task: the early-warning model covers fluid loss (see FORECAST.md).

## Data changes in this version

- `exercise_mean` changed from 100 to 120 min/day (still an ASSUMPTION; see the parameter note). All other columns are byte-identical to the delivered dataset; regenerated with seed 42 and `verify_outputs.py` passes.
- Temperature data were NOT changed: the readings below 35.0 °C follow the published healthy within-person spread (0.40 °C) and are reported as an app finding.

## Reproduce

```bash
cd scripts/synthetic && python generate.py && python verify_outputs.py
cd ../.. && npx vite-node scripts/synthetic/evaluate_synthetic.ts
```

**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**
