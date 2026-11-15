# VITALS-ORBIT — early-warning model

**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**

## Plain-language summary

- Every morning the model gives each astronaut one risk number: will an infection or a fluid-loss episode peak in the next 2 days? If the risk is high it also says which one is more likely.
- It was trained on a separate synthetic crew (200 people) and tested on the 20 delivered astronauts it never saw.
- Infection: the model warned before the peak in 32 of 40 cases (named the right problem in 29). The app's rules alerted before the peak in 6.
- Fluid loss: the model warned before the peak in 18 of 20 cases (right problem in 14). The rules alerted before the peak in 7.
- On normal days it warns on 1.8% of days (about 0.54 warnings per astronaut per 30 normal days). 160 of 212 warning days fell during a real infection or fluid-loss episode.

The model learns the patterns built into the synthetic data. The results show the method works end to end; they are not real-world accuracy. With real crew data the same pipeline would be retrained.

## Results per scenario

| Scenario | Problem | Episodes | Model warned before peak | Right problem named | Median days before peak | Rules alerted before peak | Only the model warned early |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A — Main: default events | infection | 40 | 32 | 29 | 1.0 | 6 | 26 |
| A — Main: default events | fluid_loss | 20 | 18 | 14 | 2.0 | 7 | 11 |
| B — Assumed +1.0 °C temperature rise in flight | infection | 40 | 32 | 29 | 1.0 | 33 | 4 |
| B — Assumed +1.0 °C temperature rise in flight | fluid_loss | 20 | 18 | 14 | 2.0 | 7 | 11 |
| C — Small events | infection | 40 | 26 | 23 | 1.0 | 3 | 23 |
| C — Small events | fluid_loss | 20 | 16 | 13 | 2.0 | 6 | 11 |
| D — Large events | infection | 40 | 36 | 33 | 1.5 | 13 | 23 |
| D — Large events | fluid_loss | 20 | 20 | 15 | 2.0 | 7 | 13 |

In scenario B the rules look early (temperature crosses 37.5 °C sooner) only because the assumed in-flight rise also turns the temperature card non-green on many normal days (see APP-EVALUATION.md). The model uses each astronaut's own recent median, so its results barely change.

| Scenario | Normal-day warnings | Warning days | Where the warnings fell |
| --- | --- | --- | --- |
| A | 43 of 2370 (1.8%) | 212 | infection 99, fluid_loss 61, normal day 43, sleep_debt 9 |
| B | 44 of 2370 (1.9%) | 219 | infection 102, fluid_loss 61, normal day 44, sleep_debt 12 |
| C | 44 of 2370 (1.9%) | 183 | infection 78, fluid_loss 52, normal day 44, sleep_debt 9 |
| D | 42 of 2370 (1.8%) | 249 | infection 125, fluid_loss 71, normal day 42, sleep_debt 11 |

"Where the warnings fell" uses the episode window from the day before onset to the last day of the episode. Warnings during sleep debt or EVA days are counted separately; they are not infection or fluid loss.

## How it works

- Model: one multinomial logistic regression with 3 classes (none / infection / fluid loss), trained with scikit-learn and exported as plain numbers to `src/brain/forecastModel.ts`. `src/brain/forecast.ts` runs it in the browser (no server).
- Inputs (15): for temperature, heart rate, systolic, diastolic, SpO2, sleep and mood — today's change from the astronaut's own median of the previous 14 days, and the change over the last 2 days; plus whether BP/HR were taken right after an EVA.
- Using the astronaut's own recent median (not the Earth baseline) means the normal space adaptation is not treated as a warning sign.
- No forecast on a day without a morning check-in.
- Threshold: chosen on the TRAINING crew so that 2% of training normal days warn. Nothing was tuned on the test crew.
- Rules column = the app's strict detectors from APP-EVALUATION.md (temperature ≥ 37.5 °C or P1; low-BP label, resting HR > 100 or P3).

## Reproduce

```bash
python scripts/synthetic/generate.py --seed 2026 --crew-size 200 --out /tmp/train_crew
python scripts/synthetic/forecast/train_forecast.py --train /tmp/train_crew
npx vite-node scripts/synthetic/evaluate_synthetic.ts
python scripts/synthetic/forecast/evaluate_forecast.py
```

**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**
