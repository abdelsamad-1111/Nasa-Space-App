#!/usr/bin/env python3
"""Check saved CSV/JSON artifacts independently of the in-memory simulation.
SYNTHETIC DATA, research-based. Not real astronaut measurements.
Not clinical validation.
"""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
from statistics import mean

LABEL = "SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation."


def load_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify(out):
    meta = load_json(out / "synthetic-meta.json")
    registry_doc = load_json(out / "synthetic-parameters.json")
    registry = registry_doc["registry"]
    p = {x["key"]: x["value"] for x in registry}
    validation = load_json(out / "synthetic-validation.json")
    episodes = load_json(out / "synthetic-events.json")["episodes"]
    dictionary = load_json(out / "synthetic-data-dictionary.json")
    columns = dictionary["columns"]
    indicators = dictionary["indicators"]
    count = meta["crew_size"] * meta["days"]
    checks = {}
    assert len(p) == len(registry)
    assert all(r["url"] for r in registry if r["status"] != "ASSUMPTION")
    assert all("Earth proxy (non-astronaut Fitbit users)" in r["note"] for r in registry if r["source_id"] == "pmdata")
    assert Counter(r["status"] for r in registry) == validation["parameter_status_counts"]
    assert all(set(spec["parameter_keys"]) <= set(p) for spec in indicators.values())
    checks["registry_unique_keys_sources_and_column_lineage"] = True
    masks = None
    clean_scenarios = {}
    morning = ["bp_sys", "bp_dia", "hr", "temp", "spo2", "sleep", "mood"]
    daylabels = load_csv(out / "synthetic-day-labels.csv")
    assert len(daylabels) == count
    for sid, scenario in meta["scenarios"].items():
        clean = load_csv(out / scenario["clean_file"])
        realistic = load_csv(out / scenario["realistic_file"])
        assert len(clean) == len(realistic) == count
        assert len({(r["astronaut_id"], r["mission_day"]) for r in clean}) == count
        assert all(list(r) == columns for r in clean + realistic)
        for ident in meta["preflight_baselines"]:
            assert sorted(int(r["mission_day"]) for r in clean if r["astronaut_id"] == ident) == list(range(1, meta["days"] + 1))
        current_masks = []
        for c, r, ground in zip(clean, realistic, daylabels):
            assert c["astronaut_id"] == r["astronaut_id"] == ground["astronaut_id"]
            assert c["mission_day"] == r["mission_day"] == ground["mission_day"]
            assert c["events"] == r["events"] == ground["active_events"]
            ctx, ctx_c = json.loads(r["context"]), json.loads(c["context"])
            assert ctx["_label"] == ctx_c["_label"] == LABEL
            due = (int(c["mission_day"]) - p["glucose_first_day"]) % p["glucose_every_days"] == 0
            am, pm = ctx["checkin"] == "missed_checkin", ctx["dosimeter"] == "missed_dosimeter"
            assert am == (ground["missed_checkin"] == "true")
            assert pm == (ground["missed_dosimeter"] == "true")
            current_masks.append((am, pm))
            assert all(r[k] == "missed_checkin" for k in morning) if am else all(r[k] == c[k] for k in morning)
            assert (r["radiation"] == "missed_dosimeter") if pm else (r["radiation"] == c["radiation"])
            assert r["exercise"] == c["exercise"]
            if not due:
                assert r["glucose"] == c["glucose"] == "not_measured"
            elif am:
                assert r["glucose"] == "missed_checkin" and c["glucose"] != "not_measured"
            else:
                assert r["glucose"] == c["glucose"]
            for key, spec in indicators.items():
                value = c[key]
                assert value != ""
                if key == "glucose" and not due:
                    continue
                number = float(value)
                assert spec["technical_range"][0] <= number <= spec["technical_range"][1]
                assert value == f'{number:.{spec["decimals"]}f}'
            assert float(c["bp_sys"]) >= float(c["bp_dia"]) + p["bp_min_pulse_pressure"]
            if "eva:" in c["events"]:
                assert ctx_c["bp"] == ctx_c["hr"] == "After EVA"
            if c["events"] != "none":
                for tag in c["events"].split(";"):
                    kind, phase = tag.split(":")
                    assert kind in ("infection", "fluid_loss", "sleep_debt", "eva", "solar_event")
                    assert phase in ("onset", "rising", "peak", "recovering")
        if masks is None:
            masks = current_masks
        else:
            assert masks == current_masks
        clean_scenarios[sid] = clean
        for k in indicators:
            actual = mean(float(r[k]) for r in clean if r[k] != "not_measured")
            # Glucose summary refers only to scheduled exported samples.
            assert abs(actual - validation["scenarios"][sid]["means"][k]) < p["numeric_tolerance"]
    checks["full_grid_schema_precision_technical_ranges_and_labels"] = True
    checks["missingness_is_bundled_with_identical_values_and_masks"] = True
    a = clean_scenarios["A"]
    for r1, r2 in zip(a, clean_scenarios["B"]):
        assert all(r1[k] == r2[k] for k in columns if k != "temp")
    checks["temperature_scenario_changes_only_temperature"] = True
    for sid in ("C", "D"):
        assert [(r["astronaut_id"], r["mission_day"], r["events"]) for r in clean_scenarios[sid]] == [(r["astronaut_id"], r["mission_day"], r["events"]) for r in a]
    checks["identical_event_timing_in_all_size_scenarios"] = True
    for row in a:
        day = int(row["mission_day"])
        active = [e for e in episodes if e["astronaut_id"] in (row["astronaut_id"], "ALL") and e["start_day"] <= day <= e["end_day"]]
        actual = [] if row["events"] == "none" else row["events"].split(";")
        assert {x.split(":")[0] for x in actual} == {e["kind"] for e in active}
        for event in active:
            assert event["end_day"] - event["start_day"] + 1 == event["duration"]
            phase = "peak" if day == event["peak_day"] else "onset" if day == event["start_day"] else "rising" if day < event["peak_day"] else "recovering"
            assert event["kind"] + ":" + phase in actual
            for key in event["severity_quantiles"]:
                small = event["amplitudes"]["small"][key]
                default = event["amplitudes"]["default"][key]
                large = event["amplitudes"]["large"][key]
                assert small <= default <= large
    checks["episode_ledger_matches_daily_ground_truth_and_ordered_event_sizes"] = True
    direct = {
        "sleep_mean": mean(float(r["sleep"]) for r in a),
        "sleep_ge7": mean(float(r["sleep"]) >= p["sleep_check_cutoff"] for r in a),
        "mood_mean": mean(float(r["mood"]) for r in a),
        "mood_low": mean(float(r["mood"]) <= p["low_mood_cutoff"] for r in a),
    }
    free = [r for r in a if r["events"] == "none" and int(r["mission_day"]) > p["bp_sys_ramp_days"]]
    for key in ("bp_sys", "hr", "temp"):
        direct[key] = mean(float(r[key]) for r in free)
    for c in validation["source_checks"]:
        if c["key"] in direct:
            assert abs(direct[c["key"]] - c["synthetic"]) < p["numeric_tolerance"]
    checks["source_check_json_matches_saved_csv"] = True
    preflight = load_csv(out / "synthetic-preflight.csv")
    assert len(preflight) == meta["crew_size"] * p["preflight_days"]
    for ident, base in meta["preflight_baselines"].items():
        rows = [r for r in preflight if r["astronaut_id"] == ident]
        for k, target in base.items():
            assert abs(mean(float(r[k]) for r in rows) - target) < p["numeric_tolerance"]
    checks["preflight_baselines_match_recorded_calibration_rows"] = True
    n_am, n_pm = sum(m[0] for m in masks), sum(m[1] for m in masks)
    assert n_am == validation["missingness"]["morning_person_days"]
    assert n_pm == validation["missingness"]["evening_person_days"]
    checks["missingness_counts_match_json"] = True
    # Deterministic hashes and a successful saved-data verification record are artifacts too.
    dump = dict(label=LABEL, checks=checks, passed=True, rows_per_file=count)
    (out / "synthetic-file-verification.json").write_text(json.dumps(dump, indent=2) + "\n", encoding="utf-8")
    paths = sorted(x for x in out.iterdir() if x.is_file() and x.name != "SHA256SUMS.txt")
    manifest = LABEL + "\n\n" + "\n".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}" for path in paths) + "\n"
    (out / "SHA256SUMS.txt").write_text(manifest, encoding="utf-8")
    print(LABEL)
    for name in checks:
        print("PASS", name)
    return dump


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=LABEL)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    args = parser.parse_args()
    verify(args.out)
