"""Train the VITALS-ORBIT early-warning model on synthetic data.

SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.

Question the model answers, every morning, for each astronaut:
  "Will an infection or a fluid-loss episode reach its peak in the next 2 days, and which one is more likely?"
One multinomial logistic regression with 3 classes: none / infection / fluid_loss.
Warning when P(infection) + P(fluid_loss) >= threshold; the likely type is the larger of the two.

Training crew : a SEPARATE synthetic crew (seed 2026, 200 people), never used for testing.
Test crew     : the delivered seed-42 crew in scripts/synthetic/out (20 people).

Features (same code is re-implemented in src/brain/forecast.ts):
  for temp, hr, bp_sys, bp_dia, spo2, sleep, mood:
    dev   = today - median(the person's previous 14 days)   (0 if fewer than 5 previous values)
    slope = today - value 2 days ago                          (0 if missing)
  plus: after_eva (BP/HR measured right after an EVA).
  No forecast is made on a day without a morning check-in.

Run from repo root:
  python scripts/synthetic/generate.py --seed 2026 --crew-size 200 --out <train_dir>
  python scripts/synthetic/forecast/train_forecast.py --train <train_dir>
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out"
LABEL = "SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation."

SIGNALS = ["temp", "hr", "bp_sys", "bp_dia", "spo2", "sleep", "mood"]
WINDOW = 14          # days used for the person's recent usual value
MIN_HISTORY = 5      # need at least this many previous values
SLOPE_GAP = 2        # today minus value 2 days ago
HORIZON = 2          # warn if the peak is 1..2 days ahead
WARMUP = 7           # first week is adaptation; no scoring
TARGET_NORMAL_WARN_RATE = 0.02   # threshold chosen on TRAINING normal days (2% of normal days)
CLASSES = ["none", "infection", "fluid_loss"]

FEATURES = [f"{k}_dev" for k in SIGNALS] + [f"{k}_slope" for k in SIGNALS] + ["after_eva"]


def num(s: str):
    try:
        v = float(s)
        return v if np.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def load_crew(csv_path: Path):
    """astronaut -> list of day dicts sorted by mission_day."""
    crew: dict[str, list[dict]] = {}
    with open(csv_path, newline="") as f:
        for r in csv.DictReader(f):
            ctx = json.loads(r["context"] or "{}")
            day = {"day": int(r["mission_day"]), "after_eva": 1.0 if ctx.get("hr") == "After EVA" else 0.0}
            for k in SIGNALS:
                day[k] = num(r[k])
            crew.setdefault(r["astronaut_id"], []).append(day)
    for days in crew.values():
        days.sort(key=lambda x: x["day"])
    return crew


def features_for_person(days: list[dict]) -> dict[int, list[float]]:
    """Feature vector for every mission day of one person (uses only that day and earlier)."""
    by_day = {d["day"]: d for d in days}
    out = {}
    for d in days:
        t = d["day"]
        vec_dev, vec_slope = [], []
        for k in SIGNALS:
            today = d[k]
            prev = [by_day[x][k] for x in range(t - WINDOW, t) if x in by_day and by_day[x][k] is not None]
            if today is None or len(prev) < MIN_HISTORY:
                vec_dev.append(0.0)
            else:
                vec_dev.append(today - float(np.median(prev)))
            back = by_day.get(t - SLOPE_GAP)
            if today is None or back is None or back[k] is None:
                vec_slope.append(0.0)
            else:
                vec_slope.append(today - back[k])
        if all(d[k] is None for k in SIGNALS):
            continue  # no morning check-in -> no forecast
        out[t] = vec_dev + vec_slope + [d["after_eva"]]
    return out


def load_episodes(path: Path):
    return json.loads(path.read_text())["episodes"]


def load_labels(path: Path):
    lab = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            lab[(r["astronaut_id"], int(r["mission_day"]))] = r
    return lab


def build_rows(crew, episodes):
    """X, y (0 none, 1 infection, 2 fluid_loss) and row keys.
    Days at/after the peak of an infection or fluid-loss episode are not used: the problem is already there."""
    peaks = {}
    blocked = set()
    for e in episodes:
        if e["kind"] not in CLASSES[1:]:
            continue
        peaks.setdefault(e["astronaut_id"], []).append((e["peak_day"], CLASSES.index(e["kind"])))
        for x in range(e["peak_day"], e["end_day"] + 1):
            blocked.add((e["astronaut_id"], x))
    X, y, keys = [], [], []
    for a, days in crew.items():
        for t, vec in features_for_person(days).items():
            if t <= WARMUP or (a, t) in blocked:
                continue
            cls = 0
            for peak, c in peaks.get(a, []):
                if 1 <= peak - t <= HORIZON:
                    cls = c
            X.append(vec)
            y.append(cls)
            keys.append((a, t))
    return np.asarray(X, float), np.asarray(y, int), keys


def is_normal(labels, a, t):
    r = labels.get((a, t))
    return r is not None and r["active_events"] == "none" and r["previous_day_sleep_event"] == "none" and t > WARMUP


def train(train_dir: Path):
    files = ["synthetic-astronauts.csv", "synthetic-astronauts-small.csv", "synthetic-astronauts-large.csv"]
    episodes = load_episodes(train_dir / "synthetic-events.json")
    labels = load_labels(train_dir / "synthetic-day-labels.csv")
    Xs, ys, ks = [], [], []
    for f in files:
        X, y, k = build_rows(load_crew(train_dir / f), episodes)
        Xs.append(X); ys.append(y); ks += k
    X = np.vstack(Xs); y = np.concatenate(ys)
    mean = X.mean(axis=0); std = X.std(axis=0); std[std == 0] = 1.0
    Z = (X - mean) / std
    clf = LogisticRegression(C=1.0, max_iter=3000, class_weight="balanced")
    clf.fit(Z, y)
    assert list(clf.classes_) == [0, 1, 2]
    P = clf.predict_proba(Z)
    risk = P[:, 1] + P[:, 2]
    normal = np.array([is_normal(labels, a, t) for a, t in ks])
    threshold = float(np.quantile(risk[normal], 1 - TARGET_NORMAL_WARN_RATE))
    print("rows", len(y), "infection", int((y == 1).sum()), "fluid_loss", int((y == 2).sum()), "threshold", round(threshold, 4))
    for c in (1, 2):
        top = sorted(zip(FEATURES, clf.coef_[c]), key=lambda x: -abs(x[1]))[:5]
        print(f"   {CLASSES[c]}:", ", ".join(f"{n} {v:+.2f}" for n, v in top))
    return {
        "label": LABEL,
        "question": "Will an infection or a fluid-loss episode peak in the next 2 days, and which is more likely?",
        "classes": CLASSES,
        "features": FEATURES,
        "window": WINDOW, "minHistory": MIN_HISTORY, "slopeGap": SLOPE_GAP, "horizonDays": HORIZON,
        "mean": mean.round(10).tolist(),
        "std": std.round(10).tolist(),
        "coef": clf.coef_.round(10).tolist(),
        "intercept": clf.intercept_.round(10).tolist(),
        "threshold": round(threshold, 10),
        "thresholdRule": f"warn when P(infection)+P(fluid_loss) >= threshold; chosen so {int(TARGET_NORMAL_WARN_RATE*100)}% of TRAINING normal days warn",
        "trainedOn": [f"{train_dir.name}/{f}" for f in files] + ["seed 2026, 200 synthetic people, never used for testing"],
        "trainingRows": int(len(y)),
        "trainingPositives": {"infection": int((y == 1).sum()), "fluid_loss": int((y == 2).sum())},
    }


def main():
    ap = argparse.ArgumentParser(description=LABEL)
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--model-out", type=Path, default=HERE.parents[2] / "src" / "brain" / "forecastModel.ts")
    args = ap.parse_args()
    model = train(args.train)
    args.model_out.write_text(
        "// GENERATED by scripts/synthetic/forecast/train_forecast.py — do not edit by hand.\n"
        f"// {LABEL}\n"
        "export const FORECAST_MODEL = " + json.dumps(model, indent=2) + " as const;\n")
    print("Wrote", args.model_out)


if __name__ == "__main__":
    main()
