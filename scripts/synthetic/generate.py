#!/usr/bin/env python3
"""Reproducible standalone synthetic astronaut-health generator.

SYNTHETIC DATA, research-based. Not real astronaut measurements.
Not clinical validation. All adjustable numeric inputs live in parameters.py.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import platform
import sys

import numpy as np

from parameters import LABEL, PARAMS, REGISTRY, RANGES, SOURCES, EVENT_RANGES

P = PARAMS
INDICATORS = list(RANGES)
COLUMNS = ["astronaut_id", "mission_day", *INDICATORS, "context", "events"]
MORNING = ["bp_sys", "bp_dia", "hr", "temp", "spo2", "sleep", "mood"]
EVENT_PARAMETERS = {
    "infection": ["infection_temp", "infection_sleep", "infection_mood", "infection_spo2"],
    "fluid_loss": ["fluid_bp_sys", "fluid_hr"],
    "sleep_debt": ["sleep_debt_sleep", "sleep_debt_mood"],
    "eva": ["eva_hr", "eva_bp_sys", "eva_bp_dia"],
    "solar_event": ["solar_day1", "solar_day2"],
}
SCENARIOS = {
    "A": {"size": "default", "shift_key": "temp_inflight_shift_A", "stem": "synthetic-astronauts"},
    "B": {"size": "default", "shift_key": "temp_inflight_shift_B", "stem": "synthetic-astronauts-tempshift"},
    "C": {"size": "small", "shift_key": "temp_inflight_shift_A", "stem": "synthetic-astronauts-small"},
    "D": {"size": "large", "shift_key": "temp_inflight_shift_A", "stem": "synthetic-astronauts-large"},
}


def dump_json(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def write_csv(path, columns, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def stream(seed, name):
    return np.random.default_rng(np.random.SeedSequence([seed, P[f"rng_stream_{name}"]]))


def standardize(z):
    return (z - z.mean()) / z.std(ddof=P["latent_sd_ddof"])


def make_baselines(rng, crew):
    baselines = {}
    sys_z = standardize(rng.normal(size=crew))
    rho = P["bp_baseline_correlation"]
    dia_z = standardize(rho * sys_z + np.sqrt(1 - rho ** 2) * rng.normal(size=crew))
    for col in INDICATORS:
        z = sys_z if col == "bp_sys" else dia_z if col == "bp_dia" else standardize(rng.normal(size=crew))
        baselines[col] = P[f"{col}_mean"] + P[f"{col}_between_sd"] * z
    return baselines


def make_noise(rng, crew, total_days):
    shape = (crew, total_days)
    noise = {col: rng.normal(size=shape) * P["mood_latent_within_sd" if col == "mood" else f"{col}_within_sd"] for col in INDICATORS}
    rho = P["bp_daily_correlation"]
    noise["bp_dia"] = P["bp_dia_within_sd"] * (
        rho * noise["bp_sys"] / P["bp_sys_within_sd"]
        + np.sqrt(1 - rho ** 2) * rng.normal(size=shape))
    phi = P["hr_lag1"]
    innovations = rng.normal(size=shape)
    ar = np.empty(shape)
    ar[:, 0] = innovations[:, 0] * P["hr_within_sd"]
    for t in range(1, total_days):
        ar[:, t] = phi * ar[:, t - 1] + np.sqrt(1 - phi ** 2) * P["hr_within_sd"] * innovations[:, t]
    noise["hr"] = ar + rng.normal(size=shape) * P["hr_manual_sd"]
    # Mood's observed within-person SD is not used as a latent Gaussian SD.
    noise["mood"] = rng.normal(size=shape) * P["mood_latent_within_sd"]
    noise["radiation"] += rng.normal(size=total_days)[None, :] * P["radiation_common_sd"]
    return noise, ar


def make_schedule(rng, crew, days):
    records = []
    for a in range(crew):
        requests = []
        for kind in ("infection", "fluid_loss", "sleep_debt", "eva"):
            for number in range(P[f"{kind}_episodes"]):
                if kind == "sleep_debt":
                    lo, hi = P["sleep_debt_duration_range"]
                    duration = int(rng.integers(lo, hi + 1))
                else:
                    duration = P[f"{kind}_duration"]
                requests.append((kind, number, duration))
        requests.sort(key=lambda x: -x[-1])
        placed = []
        for kind, number, duration in requests:
            low = P["event_start_min_day"]
            high = days - P["event_end_buffer_days"] - duration + 1
            if high < low:
                raise ValueError("Mission too short for this event schedule; adjust the registry.")
            for _ in range(P["schedule_max_attempts"]):
                start = int(rng.integers(low, high + 1))
                end = start + duration - 1
                if all(end + P["event_gap_days"] < left or start > right + P["event_gap_days"] for left, right in placed):
                    placed.append((start, end))
                    break
            else:
                raise RuntimeError("Cannot place non-overlapping events; change the registry schedule.")
            records.append(dict(episode_id=f"AST-{a + 1:03d}-{kind}-{number + 1}",
                                astronaut_index=a, astronaut_id=f"AST-{a + 1:03d}",
                                kind=kind, start_day=start, duration=duration,
                                severity_quantiles={k: float(rng.random()) for k in EVENT_PARAMETERS[kind]}))
    records.append(dict(episode_id="CREW-solar_event", astronaut_index=None, astronaut_id="ALL",
                        kind="solar_event", start_day=P["solar_event_day"], duration=P["solar_duration"],
                        severity_quantiles={k: float(rng.random()) for k in EVENT_PARAMETERS["solar_event"]}))
    if P["solar_event_day"] + P["solar_duration"] - 1 > days:
        raise ValueError("Solar event falls beyond the mission; adjust solar_event_day in the registry.")
    return sorted(records, key=lambda e: (e["start_day"], e["episode_id"]))


def amplitudes(event, size):
    answer = {}
    for k, q in event["severity_quantiles"].items():
        low, high = P[f"{k}_{size}"]
        answer[k] = low + (high - low) * q
    return answer


def event_profile(event):
    kind, duration = event["kind"], event["duration"]
    if kind == "infection":
        return np.asarray(P["infection_shape"])
    if kind == "fluid_loss":
        return np.asarray(P["fluid_loss_shape"])
    if kind == "sleep_debt":
        peak = duration // 2
        return np.interp(np.arange(duration), [0, peak, duration - 1], P["sleep_debt_shape_anchors"])
    return np.ones(duration)


def effects_and_labels(schedule, size, crew, days):
    effect = {col: np.zeros((crew, days)) for col in INDICATORS}
    labels = [[[] for _ in range(days)] for _ in range(crew)]
    for e in schedule:
        kind, duration = e["kind"], e["duration"]
        curve = event_profile(e)
        if len(curve) != duration:
            raise ValueError("Event duration and registry shape disagree")
        peak = int(np.argmax(curve)) if kind != "solar_event" else 0
        e["peak_day"] = e["start_day"] + peak
        e["end_day"] = e["start_day"] + duration - 1
        e["amplitudes"] = {s: amplitudes(e, s) for s in ("small", "default", "large")}
        amp = e["amplitudes"][size]
        subjects = range(crew) if e["astronaut_index"] is None else [e["astronaut_index"]]
        for a in subjects:
            for t, scale in enumerate(curve):
                d = e["start_day"] - 1 + t
                phase = "peak" if t == peak else "onset" if t == 0 else "rising" if t < peak else "recovering"
                labels[a][d].append(f"{kind}:{phase}")
                if kind == "infection":
                    fever = amp["infection_temp"] * scale
                    effect["temp"][a, d] += fever
                    effect["hr"][a, d] += P["infection_hr_per_c"] * fever
                    effect["sleep"][a, d] -= amp["infection_sleep"] * scale
                    effect["mood"][a, d] -= amp["infection_mood"] * scale
                    effect["spo2"][a, d] -= amp["infection_spo2"] * scale
                elif kind == "fluid_loss":
                    effect["bp_sys"][a, d] -= amp["fluid_bp_sys"] * scale
                    effect["bp_dia"][a, d] -= P["fluid_dia_multiplier"] * amp["fluid_bp_sys"] * scale
                    effect["hr"][a, d] += amp["fluid_hr"] * scale
                elif kind == "sleep_debt":
                    effect["sleep"][a, d] -= amp["sleep_debt_sleep"] * scale
                    if t + 1 >= P["sleep_debt_mood_from_day"]:
                        effect["mood"][a, d] -= amp["sleep_debt_mood"] * scale
                elif kind == "eva":
                    for col in ("hr", "bp_sys", "bp_dia"):
                        effect[col][a, d] += amp[f"eva_{col}"]
                elif kind == "solar_event":
                    # Store the factor here; conversion to an additive dose term happens after
                    # the common and individual daily environment have been generated.
                    effect["radiation"][a, d] = amp["solar_day1"] if t == 0 else amp["solar_day2"]
    return effect, labels


def rounded(col, values):
    lo, hi = P[f"range_{col}"]
    return np.round(np.clip(values, lo, hi), P[f"precision_{col}"])


def mean_shift(col, raw, target):
    lo, hi = P["calibration_search_bounds"]
    if rounded(col, raw + lo).mean() > target or rounded(col, raw + hi).mean() < target:
        raise ValueError(f"Cannot calibrate {col} mean within registry search bounds")
    for _ in range(P["calibration_iterations"]):
        mid = (lo + hi) / 2
        if rounded(col, raw + mid).mean() < target:
            lo = mid
        else:
            hi = mid
    candidates = [lo, hi, (lo + hi) / 2]
    return float(min(candidates, key=lambda s: abs(rounded(col, raw + s).mean() - target)))


def build_values(bases, noise, effect, days, temp_shift, calibration=None):
    pf = P["preflight_days"]
    raw = {col: bases[col][:, None] + noise[col][:, pf:] + effect[col] for col in INDICATORS}
    mission_day = np.arange(1, days + 1)
    adaptation = {col: np.zeros(days) for col in INDICATORS}
    adaptation["bp_sys"] = P["bp_sys_shift"] * np.minimum(mission_day / P["bp_sys_ramp_days"], 1)
    adaptation["bp_dia"] = np.repeat(P["bp_dia_shift"], days)
    adaptation["temp"] = temp_shift * np.minimum(mission_day / P["temp_oral_ramp_days"], 1)
    for col in INDICATORS:
        raw[col] += adaptation[col][None, :]
    # A daily effective-dose quantity; not an absorbed-dose or lifetime cumulative column.
    rad_lo, rad_hi = P["radiation_reference_range"]
    ordinary_dose = np.clip(bases["radiation"][:, None] + noise["radiation"][:, pf:], rad_lo, rad_hi)
    factors = np.where(effect["radiation"] > 0, effect["radiation"], 1)
    raw["radiation"] = ordinary_dose * factors
    if calibration is None:
        calibration = {"sleep_offset": mean_shift("sleep", raw["sleep"], P["sleep_mean"])}
        calibrate_mood = True
    else:
        calibration = dict(calibration)
        calibrate_mood = False
    raw["sleep"] += calibration["sleep_offset"]
    sleep = rounded("sleep", raw["sleep"])
    preflight_last_sleep = rounded("sleep", bases["sleep"] + calibration["sleep_offset"] + noise["sleep"][:, pf - 1])
    previous_sleep = np.column_stack([preflight_last_sleep, sleep[:, :-1]])
    deficit = np.maximum(bases["sleep"][:, None] + calibration["sleep_offset"] - previous_sleep, 0)
    mood_link = P["sleep_to_mood_next_day"] * deficit
    raw["mood"] += mood_link
    if calibrate_mood:
        calibration["mood_offset"] = mean_shift("mood", raw["mood"], P["mood_mean"])
        calibration["average_sleep_event_effect"] = float(effect["sleep"].mean())
        calibration["average_mood_event_effect"] = float(effect["mood"].mean())
        calibration["average_sleep_mood_link"] = float(mood_link.mean())
    raw["mood"] += calibration["mood_offset"]
    repair = raw["bp_sys"] < raw["bp_dia"] + P["bp_min_pulse_pressure"]
    raw["bp_sys"] = np.maximum(raw["bp_sys"], raw["bp_dia"] + P["bp_min_pulse_pressure"])
    clips = {col: int(((raw[col] < P[f"range_{col}"][0]) | (raw[col] > P[f"range_{col}"][1])).sum()) for col in INDICATORS}
    values = {col: rounded(col, raw[col]) for col in INDICATORS}
    return values, calibration, dict(bp_pulse_pressure_repairs=int(repair.sum()), range_clips=clips), mood_link


def preflight_values(bases, noise, calibration):
    pf = P["preflight_days"]
    raw = {col: bases[col][:, None] + noise[col][:, :pf] for col in INDICATORS}
    raw["sleep"] += calibration["sleep_offset"]
    sleep = rounded("sleep", raw["sleep"])
    previous = np.column_stack([bases["sleep"] + calibration["sleep_offset"], sleep[:, :-1]])
    raw["mood"] += calibration["mood_offset"] + P["sleep_to_mood_next_day"] * np.maximum(
        bases["sleep"][:, None] + calibration["sleep_offset"] - previous, 0)
    raw["bp_sys"] = np.maximum(raw["bp_sys"], raw["bp_dia"] + P["bp_min_pulse_pressure"])
    # Dose reference retained solely for schema completeness; it is not an Earth
    # exposure estimate and does not define an alert baseline or career budget.
    rad_lo, rad_hi = P["radiation_reference_range"]
    raw["radiation"] = np.clip(raw["radiation"], rad_lo, rad_hi)
    return {col: rounded(col, raw[col]) for col in INDICATORS}


def scheduled_glucose(day):
    return (day - P["glucose_first_day"]) % P["glucose_every_days"] == 0


def formatted(col, x):
    precision = P[f"precision_{col}"]
    return f"{x:.{precision}f}"


def make_rows(values, labels, miss_am, miss_pm, realistic=True, preflight=False):
    crew, days = values["hr"].shape
    for a in range(crew):
        for d in range(days):
            day = d + 1 if not preflight else d - days
            am = bool(miss_am[a, d]) if realistic else False
            pm = bool(miss_pm[a, d]) if realistic else False
            glucose_due = preflight or scheduled_glucose(day)
            eva = any(s.startswith("eva:") for s in labels[a][d])
            context = dict(bp="After EVA" if eva else "At rest (seated)",
                           hr="After EVA" if eva else "At rest", temp="Oral", spo2="At rest",
                           glucose="Fasting" if glucose_due else "not_measured", sleep="Previous night",
                           mood="Morning self-report", radiation="Evening dosimeter",
                           exercise="Daily total", checkin="missed_checkin" if am else "completed",
                           dosimeter="missed_dosimeter" if pm else "completed", _label=LABEL)
            if preflight:
                context["phase"] = "preflight synthetic calibration"
                context["radiation"] = "Synthetic reference only; not an Earth exposure estimate"
            row = dict(astronaut_id=f"AST-{a + 1:03d}", mission_day=day)
            for col in INDICATORS:
                row[col] = formatted(col, values[col][a, d])
                if am and col in MORNING:
                    row[col] = "missed_checkin"
                if pm and col == "radiation":
                    row[col] = "missed_dosimeter"
            if am:
                for key in ("bp", "hr", "temp", "spo2", "sleep", "mood"):
                    context[key] = "missed_checkin"
            row["glucose"] = ("missed_checkin" if am else row["glucose"]) if glucose_due else "not_measured"
            if am and glucose_due:
                context["glucose"] = "missed_checkin"
            if pm:
                context["radiation"] = "missed_dosimeter"
            row["context"] = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
            row["events"] = ";".join(labels[a][d]) or "none"
            yield row


def table(headers, rows):
    def escape(v):
        return str(v).replace("|", "\\|").replace("\n", " ")
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |",
                      *("| " + " | ".join(escape(v) for v in row) + " |" for row in rows)])


def provenance(out):
    write_csv(out / "synthetic-provenance.csv", ["key", "value", "unit", "status", "source", "url", "note"],
              ({k: json.dumps(r[k], ensure_ascii=False) if k == "value" else r[k]
                for k in ("key", "value", "unit", "status", "source", "url", "note")} for r in REGISTRY))
    dump_json(out / "synthetic-parameters.json", dict(label=LABEL, registry=REGISTRY, sources=SOURCES))
    headers = ["key", "value", "unit", "status", "source", "url", "note"]
    lines = ["# Parameter provenance", "", LABEL, "",
             "Generated automatically from parameters.py. DATA entries are supplied prior-analysis summaries, not independently recomputed raw-data statistics. ASSUMPTION entries may be changed by the team. No normal-range or safety claim follows from technical clipping guards.", "",
             table(headers, ([r[k] for k in headers] for r in REGISTRY))]
    (out / "synthetic-provenance.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def source_checks(values, labels, days):
    event_free = np.array([[not tags for tags in person] for person in labels])
    after_week = np.arange(1, days + 1) > P["bp_sys_ramp_days"]
    mask = event_free & after_week[None, :]
    checks = []
    def near(key, desc, actual, target, tolerance, role, url):
        checks.append(dict(key=key, check=desc, synthetic=float(actual), target=float(target),
                           tolerance=float(tolerance), role=role, pass_check=bool(abs(actual - target) <= tolerance), source_url=url))
    near("bp_sys", "Event-free systolic after adaptation", values["bp_sys"][mask].mean(), P["bp_sys_inflight_reference"],
         P["check_bp_tolerance"], "Input-consistency check; ambulatory-to-seated transfer is assumed", SOURCES["bp"]["url"])
    near("sleep_mean", "Sleep mean, all nights including events", values["sleep"].mean(), P["sleep_mean"],
         P["check_sleep_tolerance"], "Calibrated input-consistency check", SOURCES["sleep"]["url"])
    counts = P["sleep_ge7_source_counts"]
    near("sleep_ge7", "Nights with at least seven hours of sleep", (values["sleep"] >= P["sleep_check_cutoff"]).mean(),
         (counts[0] + counts[1]) / counts[2], P["check_sleep_share_tolerance"],
         "Only held-out independent source check; not used for calibration", SOURCES["sleep"]["url"])
    near("temp", "Event-free oral temperature, main no-shift scenario", values["temp"][mask].mean(), P["temp_mean"],
         P["check_temp_tolerance"], "Input-consistency check; Earth oral-temperature proxy", SOURCES["temp"]["url"])
    near("hr", "Event-free resting heart rate", values["hr"][mask].mean(), P["hr_mean"],
         P["check_hr_tolerance"], "Input-consistency check against supplied Earth-proxy summary", SOURCES["pmdata"]["url"])
    near("mood_mean", "Mean exported rounded mood, all days", values["mood"].mean(), P["mood_mean"],
         P["check_mood_mean_tolerance"], "Calibrated input-consistency check against supplied summary", SOURCES["pmdata"]["url"])
    near("mood_low", "Days with mood two or lower", (values["mood"] <= P["low_mood_cutoff"]).mean(), P["mood_low_reference"],
         P["check_mood_low_tolerance"], "Prior calibration diagnostic; NOT an independent source check", SOURCES["pmdata"]["url"])
    totals = values["radiation"].sum(axis=1)
    low, high = P["check_radiation_mission_range"]
    low, high = low * days / P["mission_days"], high * days / P["mission_days"]
    checks.append(dict(key="radiation_total", check="Per-person total mission effective dose, including solar event",
                       synthetic_min=float(totals.min()), synthetic_max=float(totals.max()),
                       target_min=low, target_max=high, role="Approximate input-consistency check; acceptance bounds are assumptions",
                       pass_check=bool(((totals >= low) & (totals <= high)).all()), source_url=SOURCES["radiation"]["url"]))
    return checks


def dictionary(out):
    entries = {}
    for col in INDICATORS:
        sources = [f"{col}_mean", f"{col}_between_sd", f"range_{col}", f"precision_{col}"]
        sources += ["mood_latent_within_sd"] if col == "mood" else [f"{col}_within_sd"]
        if col == "bp_sys": sources += ["bp_sys_shift", "bp_sys_ramp_days", "bp_min_pulse_pressure", "bp_baseline_correlation", "bp_daily_correlation"]
        if col == "bp_dia": sources += ["bp_dia_shift", "bp_baseline_correlation", "bp_daily_correlation", "fluid_dia_multiplier"]
        if col == "hr": sources += ["hr_lag1", "hr_manual_sd", "infection_hr_per_c"]
        if col == "temp": sources += ["temp_inflight_shift_A", "temp_inflight_shift_B", "temp_oral_ramp_days"]
        if col == "sleep": sources += ["calibration_search_bounds", "calibration_iterations"]
        if col == "mood": sources += ["sleep_to_mood_next_day", "calibration_search_bounds", "calibration_iterations"]
        if col == "radiation": sources += ["radiation_common_sd", "radiation_reference_range"]
        if col == "glucose": sources += ["glucose_every_days", "glucose_first_day"]
        effects = {"bp_sys": ["fluid_bp_sys", "eva_bp_sys"], "bp_dia": ["fluid_bp_sys", "eva_bp_dia"],
                   "hr": ["infection_temp", "fluid_hr", "eva_hr"], "temp": ["infection_temp"],
                   "spo2": ["infection_spo2"], "sleep": ["infection_sleep", "sleep_debt_sleep"],
                   "mood": ["infection_mood", "sleep_debt_mood"], "radiation": ["solar_day1", "solar_day2"]}.get(col, [])
        sources += [f"{e}_{size}" for e in effects for size in ("small", "default", "large")]
        entries[col] = dict(unit=RANGES[col][-1], decimals=P[f"precision_{col}"], technical_range=P[f"range_{col}"],
                            parameter_keys=sources, missing_tokens=["missed_dosimeter"] if col == "radiation" else
                            ["not_measured", "missed_checkin"] if col == "glucose" else ["missed_checkin"] if col in MORNING else [])
    dump_json(out / "synthetic-data-dictionary.json", dict(label=LABEL, columns=COLUMNS, indicators=entries,
        row_definition="One synthetic astronaut, one mission day. AST identifiers are fictional.",
        context="JSON object with per-indicator context, bundle missingness, and _label. Context strings have not been matched to the app enums.",
        events="none, or semicolon-separated event:phase tokens. Allowed phases: onset, rising, peak, recovering. Ground truth stays present when check-ins are missed.",
        schedule="Morning bundle plus weekly fasting glucose; evening radiation; daily exercise. EVA BP/HR readings are post-activity within the check-in bundle. No exact app timestamp contract is asserted.",
        formula="value = latent personal baseline + spaceflight effect + event effects + daily links + daily noise + offline mean-calibration offset; then technical clipping and rounding. Radiation uses a daily dose multiplied by the solar-event factor.",
        shared_controls=["seed", "crew_size", "mission_days", "preflight_days", "morning_hour_utc", "evening_hour_utc", "exercise_hour_utc",
                         "rng_stream_baselines", "rng_stream_daily", "rng_stream_events", "rng_stream_missing",
                         "miss_morning_probability", "miss_evening_probability", "event_start_min_day", "event_end_buffer_days", "event_gap_days"],
        app_contract_verified=False, clinical_validation=False))


def write_report(out, result):
    checks = result["source_checks"]
    rows = []
    for c in checks:
        if "synthetic" in c:
            actual, target = f'{c["synthetic"]:.5f}', f'{c["target"]:.5f} ± {c["tolerance"]:g}'
        else:
            actual = f'{c["synthetic_min"]:.2f} to {c["synthetic_max"]:.2f}'
            target = f'{c["target_min"]:g} to {c["target_max"]:g}'
        rows.append([c["check"], actual, target, "PASS" if c["pass_check"] else "FAIL", c["role"]])
    scenario_rows = [[sid, s["event_size"], s["oral_temp_shift"], f'{s["means"]["sleep"]:.4f}',
                      f'{s["means"]["mood"]:.4f}', f'{s["means"]["temp"]:.4f}',
                      f'{s["radiation_total_min"]:.2f}–{s["radiation_total_max"]:.2f}']
                     for sid, s in result["scenarios"].items()]
    status_rows = [[s, result["parameter_status_counts"].get(s, 0)] for s in ["VERIFIED", "DATA", "VERIFY", "ASSUMPTION"]]
    event_rows = [[k, n, result["event_person_days"].get(k, 0)] for k, n in result["episode_counts"].items()]
    txt = ["# VITALS-ORBIT synthetic dataset", "", LABEL, "", "## Plain-language summary", "",
           "- These readings describe fictional people, and no real astronaut is represented.",
           "- Research guides selected values; every additional design choice is identified.",
           "- Illness, fluid loss, short sleep, spacewalks, and radiation changes are deliberately staged.",
           "- The package includes complete readings and matching versions with missed check-ins.",
           "- This package supports software demonstrations; it does not prove that a medical alert is correct.", "",
           "## الملخص بالعربي", "",
           "هذه بيانات اصطناعية مبنية جزئيًا على أبحاث، وليست قياسات رواد فضاء حقيقيين ولا تحققًا طبيًا. النسخة الأساسية فيها قراءات مفقودة واقعية، ونسخة clean فيها نفس القيم بلا غياب. الحالات الصحية معلّمة عمدًا حتى تستخدموها لاحقًا لاختبار البرنامج. لا توجد هنا نتائج لدقة التنبيهات أو التنبؤات، لأن محرك التطبيق غير متاح.", "",
           "## Scope and compatibility", "",
           f'Created {result["crew_size"]} fictional people × {result["days"]} mission days = {result["rows_per_mission_file"]:,} rows per mission CSV; seed {result["seed"]}. This is an illustrative collection, not a real simultaneous ISS crew. Only data generation, documentation, and data-level checks were requested at this stage.', "",
           "The app source was not provided. Units, clipping guards, context names, weekly glucose phase, exercise units, and the Settings.baselines-compatible object are standalone assumptions. Exact app enum, range, and timestamp compatibility is NOT claimed. No app source, thresholds, tests, or build were changed or run. evaluateDay, detectPatterns, forecastAll, detection sensitivity, precision, lead time, AUC, Brier, and forecast MAE were NOT evaluated.", "",
           "## Synthetic vs source — main clean scenario A", "",
           table(["Check", "Synthetic", "Target ± acceptance tolerance", "Result", "Meaning"], rows), "",
           "Most checks confirm the generator agrees with its own chosen inputs; calibrated means are not external validation. The share of nights with seven or more hours is the only held-out independent source check. Its source value is calculated from Table 2 as the sum of the ISS seven-to-eight-hour and eight-plus-hour counts divided by recorded ISS nights. Neither this proportion nor the mood-tail proportions are optimization objectives. Means are checked on complete data; missingness changes observed averages slightly.", "",
           "The source sleep mean is measured by actigraphy. Simulated nightly variability uses an Earth proxy rather than the published astronaut aggregate SD. The source-match acceptance tolerances are team engineering choices, predeclared in the registry, not clinical validation limits. A passing tolerance does not mean an exact match to every research distribution.", "",
           "## Scenarios — clean data, identical schedules and random draws", "",
           table(["Scenario", "Event sizes", "Assumed oral rise (C)", "Sleep mean (h)", "Mood mean", "Temperature mean (C)", "Per-person mission dose (mSv)"], scenario_rows), "",
           "A = main, B = oral-temperature sensitivity, C = small events, D = large events. Sleep and rounded-mood means are calibrated ONCE using A. The same latent baselines, correction offsets, event times, event severity quantiles, daily noise, and missingness masks are reused in all scenarios. Therefore C and D intentionally have different overall sleep/mood means; they have not been re-fitted to conceal the different event sizes. B changes only oral temperature. The fever-to-HR coefficient applies only to infection temperature increments, not the assumed benign temperature adaptation.", "",
           "## Parameters and source quality", "", table(["Status", "Registry entries"], status_rows), "",
           "VERIFIED means the numerical finding was read in primary source text or an explicitly qualified indexed primary extract; it does not verify portability to this simulation. DATA means PMData summary values supplied in the brief from a prior analysis. Raw PMData files were not reprocessed, so those values have not been independently reproduced here. Each PMData entry is labelled Earth proxy (non-astronaut Fitbit users). The latent mood noise is classified ASSUMPTION because it is a calibration choice rather than an observed measurement. VERIFY has no entries: the unresolved Empirical Health BP-noise claim is conservatively classified ASSUMPTION.", "",
           "The systolic spaceflight shift was measured in ambulatory averages over a full day including sleep and activity. Applying it to a seated morning sample is assumed. The spaceflight temperature study measured core temperature using a forehead heat-flux sensor. It did not establish the same oral-temperature shift; B is a sensitivity case, not an oral-temperature finding. The Earth fever HR coefficient and hypovolemia direction also require unverified transfer to this setting. Source access qualifications appear in synthetic-parameters.json; source titles are used without guessed author attributions.", "",
           "All selected observational means, spreads, rates, event magnitudes, profiles, RNG seeds, missingness rates, units, precisions, technical guards, and acceptance tolerances are in parameters.py. Provenance Markdown/CSV and the JSON registry are exported from that registry. The data dictionary maps each measurement to parameter keys. Numbers computed by the generator—random draws, offsets, episode times, simulated pre-flight means—are derived outputs, not additional factual parameters.", "",
           "This is not NASA-only data: several inputs are Earth studies, supplied PMData summaries, or team assumptions. It must not be presented as a NASA dataset. The career radiation limit is context only; the radiation column is a synthetic daily EFFECTIVE dose, not absorbed dose, a device raw count, or cumulative career dose.", "",
           "## Event ground truth", "", table(["Event", "Episodes (solar is one shared episode)", "Affected person-days"], event_rows), "",
           "Episode counts and sizes are scenario-design choices, not estimates of real event incidence. Individual events are separated by a gap; the shared solar event may overlap other events. The events column is none when no episode is active, otherwise event:phase tokens. An episode is retained in ground truth when its readings are missing. Peak day, duration, severity quantiles, and size-specific magnitudes are in synthetic-events.json.", "",
           "The sleep-to-mood effect uses the previous night's exported sleep, so it can persist one day after a sleep-affecting episode ends. synthetic-day-labels.csv flags that carryover separately. Future false-alarm analyses should define whether to exclude those carryover days; events=none alone does not guarantee that prior-event effects have vanished. Not every staged event necessarily crosses an app alarm threshold, and this package makes no event-detection claim.", "",
           "## Missing data and baselines", "",
           f'The realistic files have {result["missingness"]["morning_person_days"]} missed morning bundles and {result["missingness"]["evening_person_days"]} missed evening dosimeter readings. Morning gaps remove BP, HR, oral temperature, oxygen saturation, sleep, mood, and glucose when scheduled. Exercise stays present. Glucose not scheduled is always not_measured. There are no silently empty measurement cells.', "",
           "Clean files contain precisely the same underlying values as their realistic partner. Each scenario shares a missingness mask from a separate RNG. The context column is a JSON object: parse it as JSON after parsing the CSV, and map the strings to the app enums later. Radiation is an evening reading of that day's effective dose. BP and HR on EVA days use After EVA; the other indicators retain their individual contexts. The missing check-in bundle also applies to the rescheduled post-EVA BP/HR samples as an explicit operational assumption.", "",
           "Latent personal baselines are re-centered and re-scaled to exact crew means and sample SDs before offsets, clipping, or rounding. The pre-flight object is instead calculated from simulated recorded daily calibration readings, so its finite-sample means and spread need not equal the latent targets. A broad per-astronaut dictionary and bp {sys,dia} candidate mapping are exported, but the app's Settings type has not been inspected. The synthetic pre-flight dose is only a reference for schema completeness, not a terrestrial exposure estimate.", "",
           "Offline sleep and mood corrections compensate for average event and sleep-link effects, plus finite-sample and rounding drift. They are fixed for all cases and also applied to the synthetic pre-flight personal reference profile. This offline construction uses the full scenario and must not be mistaken for a prospective model trained only on past days.", "",
           "## File selection", "",
           "Use synthetic-astronauts.csv for the main realistic scenario and synthetic-astronauts-clean.csv for its complete counterpart. The tempshift, small, and large suffixes select B, C, and D; each has a clean counterpart. synthetic-preflight.csv contains calibration rows with negative mission days. synthetic-meta.json contains configuration and per-person baselines. synthetic-validation.json contains only data checks and descriptive summaries. synthetic-events.json and synthetic-day-labels.csv contain ground truth. synthetic-provenance.md/.csv and synthetic-parameters.json describe every parameter.", "",
           "## Reproduction", "", "```bash", "python -m pip install -r requirements.txt", "python generate.py", "python verify_outputs.py", "```", "",
           "Run from scripts/synthetic. NumPy is the only third-party dependency. Change parameters.py to change model assumptions. Optional --seed, --crew-size, --days, and --out arguments are recorded as parameter-registry overrides in the output. If the mission length is shortened, edit the fixed solar event and event schedule parameters as well. Regenerate provenance and data together; do not edit generated CSV cells by hand.", "",
           "## Findings and next steps", "",
           "The delivered artifacts reproduce the declared main-scenario means within the predeclared tolerances. The held-out sleep-tail check and supplied mood-tail diagnostic are printed above even if they fail. Technical clipping and minimum pulse-pressure repair counts are retained per scenario in the validation JSON. These guard-induced changes should be reviewed before using the data for quantitative method comparisons.", "",
           "Confirm the app's actual units, technical input bounds, context enums, routine, baseline structure, and timing before integration. Once its engine is available, evaluate event-size-specific episode detection and alert-day precision, separate adaptation-related alarms from noise, and report misses. No threshold recommendation is inferred from data generation alone.", "",
           "**SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.**", ""]
    (out / "SYNTHETIC-DATA.md").write_text("\n".join(txt), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=LABEL)
    parser.add_argument("--seed", type=int, default=P["seed"])
    parser.add_argument("--crew-size", type=int, default=P["crew_size"])
    parser.add_argument("--days", type=int, default=P["mission_days"])
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    args = parser.parse_args()
    if args.crew_size < 2 or args.days < 1 or args.seed < 0:
        parser.error("Use at least two fictional people, a positive mission length, and a nonnegative seed")
    # Record actual controls in the one registry, including explicit CLI overrides.
    for key, actual in (("seed", args.seed), ("crew_size", args.crew_size)):
        if P[key] != actual:
            for r in REGISTRY:
                if r["key"] == key:
                    r["note"] += f" CLI override of registry default {r['value']}."
                    r["value"] = actual
            P[key] = actual
    out, crew, days = args.out.resolve(), args.crew_size, args.days
    out.mkdir(parents=True, exist_ok=True)
    # Retire owned audit artifacts before overwriting data, so a failed rerun
    # cannot leave an old successful verification attached to new output.
    for name in ("synthetic-file-verification.json", "synthetic-reproducibility.json", "SHA256SUMS.txt"):
        (out / name).unlink(missing_ok=True)
    if days != P["mission_days"]:
        add_override = dict(key="actual_mission_days", value=days, unit="day/person", status="ASSUMPTION",
                            source="Explicit CLI override", url="", note="Reference mission_days retained to scale the dose check.", source_id=None)
        REGISTRY.append(add_override)
        P["actual_mission_days"] = days
    bases = make_baselines(stream(args.seed, "baselines"), crew)
    noise, hr_ar = make_noise(stream(args.seed, "daily"), crew, days + P["preflight_days"])
    schedule = make_schedule(stream(args.seed, "events"), crew, days)
    missing_rng = stream(args.seed, "missing")
    miss_am = missing_rng.random((crew, days)) < P["miss_morning_probability"]
    miss_pm = missing_rng.random((crew, days)) < P["miss_evening_probability"]
    pf_baselines, latent_records = {}, {}
    result = dict(label=LABEL, seed=args.seed, crew_size=crew, days=days, rows_per_mission_file=crew * days,
                  app_engine_evaluated=False, clinical_validation=False, app_contract_verified=False,
                  parameter_status_counts=dict(Counter(r["status"] for r in REGISTRY)), scenarios={},
                  missingness=dict(morning_person_days=int(miss_am.sum()), evening_person_days=int(miss_pm.sum())),
                  source_checks=[], episode_counts=dict(Counter(e["kind"] for e in schedule)), event_person_days={},
                  independent_raw_pmdata_recomputation=False,
                  structural_checks={})
    calibration = None
    main_labels, main_values = None, None
    for sid, spec in SCENARIOS.items():
        effect, labels = effects_and_labels(schedule, spec["size"], crew, days)
        values, cal, diagnostics, mood_link = build_values(bases, noise, effect, days, P[spec["shift_key"]], calibration)
        if calibration is None:
            calibration = cal
            main_values, main_labels = values, labels
        stem = spec["stem"]
        write_csv(out / f"{stem}.csv", COLUMNS, make_rows(values, labels, miss_am, miss_pm, realistic=True))
        write_csv(out / f"{stem}-clean.csv", COLUMNS, make_rows(values, labels, miss_am, miss_pm, realistic=False))
        glucose_mask = np.array([scheduled_glucose(d) for d in range(1, days + 1)])
        exported_means = {k: float(v[:, glucose_mask].mean()) if k == "glucose" else float(v.mean()) for k, v in values.items()}
        result["scenarios"][sid] = dict(label=LABEL, event_size=spec["size"], oral_temp_shift=P[spec["shift_key"]],
            realistic_file=f"{stem}.csv", clean_file=f"{stem}-clean.csv", means=exported_means,
            radiation_total_min=float(values["radiation"].sum(axis=1).min()), radiation_total_max=float(values["radiation"].sum(axis=1).max()),
            mood_low_fraction=float((values["mood"] <= P["low_mood_cutoff"]).mean()),
            mood_high_fraction=float((values["mood"] >= P["high_mood_cutoff"]).mean()),
            source_check_nights_ge7=float((values["sleep"] >= P["sleep_check_cutoff"]).mean()), diagnostics=diagnostics)
        if sid == "B":
            assert all(np.array_equal(values[k], main_values[k]) for k in INDICATORS if k != "temp")
    pf = preflight_values(bases, noise, calibration)
    pf_labels = [[[] for _ in range(P["preflight_days"])] for _ in range(crew)]
    empty_missing = np.zeros((crew, P["preflight_days"]), dtype=bool)
    write_csv(out / "synthetic-preflight.csv", COLUMNS, make_rows(pf, pf_labels, empty_missing, empty_missing, False, True))
    for a in range(crew):
        ident = f"AST-{a + 1:03d}"
        pf_baselines[ident] = {k: float(v[a].mean()) for k, v in pf.items()}
        latent_records[ident] = {k: float(v[a]) for k, v in bases.items()}
    candidate_settings = {ident: dict(bp={"sys": b["bp_sys"], "dia": b["bp_dia"]},
                                     **{k: v for k, v in b.items() if k not in ("bp_sys", "bp_dia")})
                          for ident, b in pf_baselines.items()}
    provenance(out)
    dictionary(out)
    dump_json(out / "synthetic-events.json", dict(label=LABEL, event_sizes_assumed=True, episodes=schedule))
    day_rows = []
    for a in range(crew):
        for d in range(days):
            carryover = [x.split(":")[0] for x in main_labels[a][d - 1] if x.startswith(("infection:", "sleep_debt:"))] if d else []
            day_rows.append(dict(astronaut_id=f"AST-{a + 1:03d}", mission_day=d + 1,
                                 active_events=";".join(main_labels[a][d]) or "none",
                                 previous_day_sleep_event=";".join(carryover) or "none",
                                 missed_checkin=str(bool(miss_am[a, d])).lower(), missed_dosimeter=str(bool(miss_pm[a, d])).lower(), label=LABEL))
    write_csv(out / "synthetic-day-labels.csv", list(day_rows[0]), day_rows)
    result["source_checks"] = source_checks(main_values, main_labels, days)
    for kind in EVENT_PARAMETERS:
        result["event_person_days"][kind] = sum(any(x.startswith(kind + ":") for x in tags) for person in main_labels for tags in person)
    result["latent_baseline_checks"] = {col: dict(mean=float(v.mean()), sample_sd=float(v.std(ddof=P["latent_sd_ddof"])),
                                                  target_mean=P[f"{col}_mean"], target_sd=P[f"{col}_between_sd"])
                                         for col, v in bases.items()}
    for c in result["latent_baseline_checks"].values():
        assert abs(c["mean"] - c["target_mean"]) < P["numeric_tolerance"]
        assert abs(c["sample_sd"] - c["target_sd"]) < P["numeric_tolerance"]
    result["structural_checks"]["latent_personal_means_and_sample_sd_exact"] = True
    result["structural_checks"]["temperature_scenario_changes_only_temperature"] = True
    result["source_checks_passed"] = all(c["pass_check"] for c in result["source_checks"])
    result["calibration"] = calibration
    meta = dict(label=LABEL, seed=args.seed, crew_size=crew, days=days, temp_shift=P["temp_inflight_shift_A"], event_size="default",
                registry_file="synthetic-parameters.json", configuration={k: P[k] for k in ["glucose_every_days", "glucose_first_day", "preflight_days", "morning_hour_utc", "evening_hour_utc", "exercise_hour_utc"]},
                app_contract_verified=False, app_baseline_mapping_verified=False, clinical_validation=False,
                numpy_version=np.__version__, python_version=platform.python_version(), random_generator="NumPy PCG64 with independent SeedSequence streams",
                preflight_baselines=pf_baselines, candidate_settings_baselines=candidate_settings,
                latent_personal_baselines_before_mean_compensation=latent_records, calibration=calibration,
                scenarios=result["scenarios"],
                missing_data_tokens=dict(unscheduled="not_measured", morning="missed_checkin", evening="missed_dosimeter"),
                timing_note="Mission days are relative; no real launch date. Morning and evening hours are assumptions. Post-EVA BP/HR are tagged separately; no exact app timestamp compatibility asserted.")
    dump_json(out / "synthetic-meta.json", meta)
    dump_json(out / "synthetic-validation.json", result)
    write_report(out, result)
    print(LABEL)
    print(table(["Synthetic vs source", "Observed", "Target", "Pass"],
                [[c["key"], f'{c["synthetic"]:.5f}' if "synthetic" in c else f'{c["synthetic_min"]:.2f}–{c["synthetic_max"]:.2f}',
                  c.get("target", f'{c.get("target_min")}–{c.get("target_max")}'), c["pass_check"]] for c in result["source_checks"]]))
    print(f"Created {crew * days:,} rows per scenario, {len(REGISTRY)} registered parameters. Output: {out}")
    if not result["source_checks_passed"]:
        print("SOURCE CHECK FAILURE: inspect synthetic-validation.json. No parameter was silently tuned to hide it.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
