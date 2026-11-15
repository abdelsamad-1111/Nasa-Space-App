"""Test the early-warning model on the UNSEEN seed-42 crew and compare it with the app's rules.

SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.

Run from repo root (after evaluate_synthetic.ts, which writes the rule results):
  python scripts/synthetic/forecast/evaluate_forecast.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from train_forecast import (CLASSES, FEATURES, LABEL, OUT, WARMUP, features_for_person,  # noqa: E402
                            is_normal, load_crew, load_episodes, load_labels)

MODEL = HERE.parents[2] / "src" / "brain" / "forecastModel.ts"
SCENARIOS = {
    "A": ("synthetic-astronauts.csv", "Main: default events"),
    "B": ("synthetic-astronauts-tempshift.csv", "Assumed +1.0 °C temperature rise in flight"),
    "C": ("synthetic-astronauts-small.csv", "Small events"),
    "D": ("synthetic-astronauts-large.csv", "Large events"),
}


def probs(model, vec):
    z = (np.asarray(vec) - np.asarray(model["mean"])) / np.asarray(model["std"])
    logits = np.asarray(model["intercept"]) + np.asarray(model["coef"]) @ z
    e = np.exp(logits - logits.max())
    return e / e.sum()


def median(xs):
    return float(np.median(xs)) if xs else None


def evaluate():
    text = MODEL.read_text()
    model = json.loads(text[text.index("= ") + 2: text.rindex(" as const")])
    episodes = [e for e in load_episodes(OUT / "synthetic-events.json") if e["kind"] in CLASSES[1:]]
    labels = load_labels(OUT / "synthetic-day-labels.csv")
    rules = json.loads((OUT / "app-evaluation.json").read_text())["scenarios"]
    windows = {}
    for e in load_episodes(OUT / "synthetic-events.json"):
        for t in range(e["start_day"] - 1, e["end_day"] + 1):
            windows.setdefault((e["astronaut_id"], t), set()).add(e["kind"])
    result = {"label": LABEL, "testCrew": "seed 42, 20 synthetic people (never seen in training)",
              "threshold": model["threshold"], "scenarios": {}}
    fixture = []
    for sid, (file, title) in SCENARIOS.items():
        crew = load_crew(OUT / file)
        pred = {}
        for a, days in crew.items():
            for t, vec in features_for_person(days).items():
                p = probs(model, vec)
                risk = float(p[1] + p[2])
                kind = "infection" if p[1] >= p[2] else "fluid_loss"
                pred[(a, t)] = (risk >= model["threshold"], kind, risk)
                if sid == "A" and a == "AST-001" and t <= 60:
                    fixture.append({"day": t, "p": [float(x) for x in p]})
        tasks = {}
        for kind in CLASSES[1:]:
            eps = [e for e in episodes if e["kind"] == kind]
            rule_first = {x["episode"]: x["firstAlertDay"] for x in rules[sid]["detection"][kind]["perEpisode"]}
            warned = type_right = rules_before = only_model = 0
            m_leads, r_leads = [], []
            for e in eps:
                a, pk = e["astronaut_id"], e["peak_day"]
                first = next((t for t in range(e["start_day"] - 1, pk) if pred.get((a, t), (False,))[0]), None)
                rf = rule_first.get(e["episode_id"])
                if first is not None:
                    warned += 1
                    m_leads.append(pk - first)
                    type_right += pred[(a, first)][1] == kind
                if rf is not None and rf < pk:
                    rules_before += 1
                    r_leads.append(pk - rf)
                if first is not None and (rf is None or rf >= pk):
                    only_model += 1
            tasks[kind] = {
                "episodes": len(eps),
                "modelWarnedBeforePeak": warned,
                "modelTypeRightAtFirstWarning": type_right,
                "modelMedianDaysBeforePeak": median(m_leads),
                "rulesAlertedBeforePeak": rules_before,
                "rulesMedianDaysBeforePeak": median(r_leads),
                "episodesOnlyModelWarnedEarly": only_model,
            }
        scored = {k: v for k, v in pred.items() if k[1] > WARMUP}
        normal = [v[0] for k, v in scored.items() if is_normal(labels, *k)]
        where = Counter()
        for k, v in scored.items():
            if v[0]:
                where["/".join(sorted(windows.get(k, set()))) or "normal day"] += 1
        result["scenarios"][sid] = {
            "title": title, "file": file, "tasks": tasks,
            "normalDays": len(normal),
            "normalDayWarnings": int(sum(normal)),
            "normalDayWarningPct": round(100 * sum(normal) / len(normal), 1) if normal else 0.0,
            "warningsPerPersonPer30NormalDays": round(30 * sum(normal) / len(normal), 2) if normal else 0.0,
            "warningDays": int(sum(1 for v in scored.values() if v[0])),
            "warningDaysBySituation": dict(where.most_common()),
        }
    (OUT / "forecast-evaluation.json").write_text(json.dumps(result, indent=2))
    rows = [{"day": d["day"], **{k: d[k] for k in ("temp", "hr", "bp_sys", "bp_dia", "spo2", "sleep", "mood")},
             "afterEva": bool(d["after_eva"])} for d in load_crew(OUT / "synthetic-astronauts.csv")["AST-001"] if d["day"] <= 60]
    (HERE.parents[2] / "src" / "brain" / "forecast.fixture.ts").write_text(
        "// GENERATED by scripts/synthetic/forecast/evaluate_forecast.py — test fixture (synthetic AST-001, days 1-60).\n"
        f"// {LABEL}\n"
        "export const FIXTURE_ROWS = " + json.dumps(rows) + ";\n"
        "export const FIXTURE_PROBS = " + json.dumps(fixture) + ";\n")
    return result


def write_md(res):
    A = res["scenarios"]["A"]
    inf, fl = A["tasks"]["infection"], A["tasks"]["fluid_loss"]
    inside = A["warningDaysBySituation"]
    real = sum(v for k, v in inside.items() if "infection" in k or "fluid_loss" in k)
    L = ["# VITALS-ORBIT — early-warning model", "", f"**{LABEL}**", "",
         "## Plain-language summary", "",
         "- Every morning the model gives each astronaut one risk number: will an infection or a fluid-loss episode peak in the next 2 days? If the risk is high it also says which one is more likely.",
         "- It was trained on a separate synthetic crew (200 people) and tested on the 20 delivered astronauts it never saw.",
         f"- Infection: the model warned before the peak in {inf['modelWarnedBeforePeak']} of {inf['episodes']} cases (named the right problem in {inf['modelTypeRightAtFirstWarning']}). The app's rules alerted before the peak in {inf['rulesAlertedBeforePeak']}.",
         f"- Fluid loss: the model warned before the peak in {fl['modelWarnedBeforePeak']} of {fl['episodes']} cases (right problem in {fl['modelTypeRightAtFirstWarning']}). The rules alerted before the peak in {fl['rulesAlertedBeforePeak']}.",
         f"- On normal days it warns on {A['normalDayWarningPct']}% of days (about {A['warningsPerPersonPer30NormalDays']} warnings per astronaut per 30 normal days). {real} of {A['warningDays']} warning days fell during a real infection or fluid-loss episode.",
         "", "The model learns the patterns built into the synthetic data. The results show the method works end to end; they are not real-world accuracy. With real crew data the same pipeline would be retrained.", "",
         "## Results per scenario", "",
         "| Scenario | Problem | Episodes | Model warned before peak | Right problem named | Median days before peak | Rules alerted before peak | Only the model warned early |",
         "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for sid, s in res["scenarios"].items():
        for kind, t in s["tasks"].items():
            L.append(f"| {sid} — {s['title']} | {kind} | {t['episodes']} | {t['modelWarnedBeforePeak']} | {t['modelTypeRightAtFirstWarning']} | {t['modelMedianDaysBeforePeak'] if t['modelMedianDaysBeforePeak'] is not None else '—'} | {t['rulesAlertedBeforePeak']} | {t['episodesOnlyModelWarnedEarly']} |")
    L += ["", "In scenario B the rules look early (temperature crosses 37.5 °C sooner) only because the assumed in-flight rise also turns the temperature card non-green on many normal days (see APP-EVALUATION.md). The model uses each astronaut's own recent median, so its results barely change.",
          "", "| Scenario | Normal-day warnings | Warning days | Where the warnings fell |", "| --- | --- | --- | --- |"]
    for sid, s in res["scenarios"].items():
        w = ", ".join(f"{k} {v}" for k, v in s["warningDaysBySituation"].items())
        L.append(f"| {sid} | {s['normalDayWarnings']} of {s['normalDays']} ({s['normalDayWarningPct']}%) | {s['warningDays']} | {w} |")
    L += ["", "\"Where the warnings fell\" uses the episode window from the day before onset to the last day of the episode. Warnings during sleep debt or EVA days are counted separately; they are not infection or fluid loss.", "",
          "## How it works", "",
          "- Model: one multinomial logistic regression with 3 classes (none / infection / fluid loss), trained with scikit-learn and exported as plain numbers to `src/brain/forecastModel.ts`. `src/brain/forecast.ts` runs it in the browser (no server).",
          f"- Inputs ({len(FEATURES)}): for temperature, heart rate, systolic, diastolic, SpO2, sleep and mood — today's change from the astronaut's own median of the previous 14 days, and the change over the last 2 days; plus whether BP/HR were taken right after an EVA.",
          "- Using the astronaut's own recent median (not the Earth baseline) means the normal space adaptation is not treated as a warning sign.",
          "- No forecast on a day without a morning check-in.",
          "- Threshold: chosen on the TRAINING crew so that 2% of training normal days warn. Nothing was tuned on the test crew.",
          "- Rules column = the app's strict detectors from APP-EVALUATION.md (temperature ≥ 37.5 °C or P1; low-BP label, resting HR > 100 or P3).",
          "", "## Reproduce", "", "```bash",
          "python scripts/synthetic/generate.py --seed 2026 --crew-size 200 --out /tmp/train_crew",
          "python scripts/synthetic/forecast/train_forecast.py --train /tmp/train_crew",
          "npx vite-node scripts/synthetic/evaluate_synthetic.ts",
          "python scripts/synthetic/forecast/evaluate_forecast.py", "```", "", f"**{LABEL}**", ""]
    (OUT / "FORECAST.md").write_text("\n".join(L))


if __name__ == "__main__":
    r = evaluate()
    write_md(r)
    for sid, s in r["scenarios"].items():
        print(sid, {k: s[k] for k in ("normalDayWarningPct", "warningDays")}, s["warningDaysBySituation"])
        for kind, t in s["tasks"].items():
            print("   ", kind, t)
