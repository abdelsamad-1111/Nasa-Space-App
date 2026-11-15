"""Single numeric parameter registry. SYNTHETIC DATA, research-based.
Not real astronaut measurements. Not clinical validation.
"""

LABEL = "SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation."
SOURCES = {
    "bp": {
        "title": "Impact of Prolonged Spaceflight on Orthostatic Tolerance During Ambulation and Blood Pressure Profiles in Astronauts. Circulation (2019), DOI:10.1161/CIRCULATIONAHA.119.041050; PMID:31319685",
        "url": "https://pubmed.ncbi.nlm.nih.gov/31319685/",
        "opened_url": "https://utsouthwestern.elsevierpure.com/en/publications/impact-of-prolonged-spaceflight-on-orthostatic-tolerance-during-a/",
        "access": "Institutional primary abstract opened and read; PubMed direct access was intermittent.",
    },
    "temp": {
        "title": "Variability in body temperature in healthy adults and in patients receiving chemotherapy: prospective observational cohort study. J Med Eng Technol (2019), DOI:10.1080/03091902.2019.1667446; PMID:31578101",
        "url": "https://pubmed.ncbi.nlm.nih.gov/31578101/",
        "opened_url": "https://pubmed.ncbi.nlm.nih.gov/31578101/",
        "access": "Primary abstract opened and read.",
    },
    "core_temp": {
        "title": "Increased core body temperature in astronauts during long-duration space missions. Scientific Reports (2017), DOI:10.1038/s41598-017-15560-w; PMID:29170507",
        "url": "https://doi.org/10.1038/s41598-017-15560-w",
        "opened_url": "https://elib.dlr.de/116228/1/ME-SBA-2017-Stahn-Reitz-BodyCore-Temp-2017-Scientific_Reports.pdf",
        "access": "Published full-text PDF opened at DLR; Results confirms plateau timing and Methods/Discussion describes the forehead heat-flux sensor. Institutional abstracts also opened.",
    },
    "sleep": {
        "title": "Prevalence of Sleep Deficiency and Hypnotic Use Among Astronauts Before, During and After Spaceflight: An Observational Study. Lancet Neurology (2014), DOI:10.1016/S1474-4422(14)70122-X; PMID:25127232",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/",
        "opened_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/",
        "access": "Primary full text opened; ISS total-sleep-time categories checked in Table 2.",
    },
    "radiation": {
        "title": "Space agency-specific standards for crew dose and risk assessment of ionising radiation exposures for the International Space Station. Z Med Phys (2024 issue; online 2023), DOI:10.1016/j.zemedi.2023.06.005; PMC10919966",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10919966/",
        "opened_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10919966/",
        "access": "Primary full text opened; Introduction distinguishes absorbed dose from effective dose.",
    },
    "nasa_limit": {
        "title": "NASA-STD-3001 Volume 1, Human Performance, Career Space Permissible Exposure Limit, requirement V1 4030",
        "url": "https://www.nasa.gov/reference/4-0-human-performance/",
        "opened_url": "https://www.nasa.gov/reference/4-0-human-performance/",
        "access": "Official NASA standards page opened and read. Context only; not a daily alarm threshold.",
    },
    "fever": {
        "title": "Fever and Cardiac Rhythm. Arch Intern Med (1986), DOI:10.1001/archinte.1986.00360180179026; PMID:2424378",
        "url": "https://jamanetwork.com/journals/jamainternalmedicine/article-abstract/606966",
        "opened_url": "https://jamanetwork.com/journals/jamainternalmedicine/article-abstract/606966",
        "access": "Publisher primary abstract opened and read; axillary temperature in young men, not astronaut oral-temperature calibration.",
    },
    "fluid": {
        "title": "Hypovolemia Induced Orthostatic Hypotension in Presyncopal Astronauts and Normal Subjects Related to Hypoadrenergic Responsiveness. NASA NTRS 20080026097",
        "url": "https://ntrs.nasa.gov/citations/20080026097",
        "opened_url": "https://ntrs.nasa.gov/citations/20080026097",
        "access": "Official NTRS abstract opened; indexed primary PDF results read for direction of heart-rate change. Effect sizes below remain assumptions.",
    },
    "pmdata": {
        "title": "PMData: A Sports Logging Dataset. ACM MMSys (2020), DOI:10.1145/3339825.3394926. Summary statistics supplied in the user's brief, not independently recomputed in this delivery",
        "url": "https://datasets.simula.no/pmdata/",
        "opened_url": "https://datasets.simula.no/pmdata/",
        "access": "Official dataset description retrieved through indexed primary page; direct site timed out. Raw Fitbit/PMSys files were not downloaded or reprocessed. DATA means supplied prior-analysis summary, not new computation.",
    },
}

REGISTRY = []


def add(key, value, unit, status="ASSUMPTION", source_id=None, note=""):
    s = SOURCES.get(source_id, {})
    if source_id == "pmdata":
        note = "Earth proxy (non-astronaut Fitbit users). Supplied summary; not independently recomputed here. " + note
    REGISTRY.append(dict(key=key, value=value, unit=unit, status=status,
                         source=s.get("title", "Team simulation / engineering design choice"),
                         url=s.get("url", ""), note=note, source_id=source_id))


# Published reference quantities retain their original measurement definitions.
add("bp_sys_mean", 120.0, "mmHg", "VERIFIED", "bp", "Pre-flight ambulatory average; use as morning seated baseline is an ASSUMPTION.")
add("bp_sys_between_sd", 10.0, "mmHg", "VERIFIED", "bp", "Pre-flight between-person SD of ambulatory averages; simulated latent crew sample SD is matched exactly.")
add("bp_sys_inflight_reference", 106.0, "mmHg", "VERIFIED", "bp", "Validation reference, not a second generator input.")
add("bp_sys_shift", -14.0, "mmHg", "VERIFIED", "bp", "The -14 mmHg shift comes from 24-hour ambulatory averages (sleep + activity). Applying it to a morning seated reading is an ASSUMPTION.")
add("bp_dia_shift", 0.0, "mmHg", "VERIFIED", "bp", "Unchanged diastolic pressure in that study; transfer to morning seated readings is an ASSUMPTION.")
add("temp_mean", 36.16, "degC oral", "VERIFIED", "temp", "Healthy Earth adults, not astronaut measurements; morning-only transfer is an ASSUMPTION.")
add("temp_between_sd", 0.26, "degC oral", "VERIFIED", "temp")
add("temp_within_sd", 0.40, "degC oral", "VERIFIED", "temp")
add("core_temp_reference_rise", 1.0, "degC core", "VERIFIED", "core_temp", "Reference only. Published full text opened at DLR. CORE temperature measured with a forehead heat-flux sensor. The size of the rise for ORAL temperature is an ASSUMPTION.")
add("core_temp_reference_plateau_days", 75, "day", "VERIFIED", "core_temp", "Reference plateau timing; linear shape and its oral-temperature transfer are ASSUMPTIONs.")
add("sleep_mean", 6.09, "hour/night", "VERIFIED", "sleep", "Overall simulated clean mean including events is calibrated to this ISS mean.")
add("sleep_ge7_reference", 0.24, "fraction", "VERIFIED", "sleep", "CHECK ONLY; not used to generate or tune sleep. Table 2 gives rounded categories; exact count-based reference is supplied separately.")
add("sleep_ge7_source_counts", [487, 228, 2951], "nights: 7-to-8, 8-plus, total", "VERIFIED", "sleep", "Independent held-out check: (487+228)/2951, from ISS inflight total sleep time (actigraphy), Table 2.")
add("radiation_reference_range", [0.2, 0.5], "mSv/day effective dose", "VERIFIED", "radiation", "Typical range, not a strict biological maximum. The source also permits higher daily doses. Synthetic solar-event multipliers are not observational estimates.")
add("career_radiation_limit", 600.0, "mSv career effective dose", "VERIFIED", "nasa_limit", "Context only; never treated as a daily limit or clinical safety classification.")
add("infection_hr_per_c", 8.5, "bpm/degC", "VERIFIED", "fever", "Earth febrile young men; applying the coefficient to simulated astronaut oral-temperature increments is an ASSUMPTION.")
add("hypovolemia_hr_direction", 1, "positive direction only", "VERIFIED", "fluid", "Direction only; not an effect magnitude. Orthostatic Earth protocol is not the same as seated in-flight physiology.")

# Prior PMData analysis supplied by the user. No fabricated claim of recomputation.
for key, value, unit, note in [
    ("hr_mean", 59.5, "bpm", "Resting Fitbit HR used as proxy for manual resting HR."),
    ("hr_between_sd", 6.7, "bpm", ""),
    ("hr_within_sd", 2.2, "bpm", "Stationary AR(1) target SD before manual-reading noise."),
    ("hr_lag1", 0.83, "correlation", "Consecutive-day stationary AR(1) parameter."),
    ("sleep_between_sd", 0.71, "hour", "Earth spread transferred to ISS mean; not the paper's reported astronaut SD."),
    ("sleep_within_sd", 1.07, "hour", "Gaussian noise shape is a team assumption."),
    ("mood_mean", 3.18, "point on 1-5 scale", "Mean of exported rounded ratings is calibrated once in the default scenario."),
    ("mood_between_sd", 0.32, "point", ""),
    ("mood_raw_within_sd_reference", 0.53, "point", "Reference only; not the latent generator SD."),
    ("mood_low_reference", 0.083, "fraction mood <=2", "Diagnostic only; not used for fitting."),
    ("mood_high_reference", 0.28, "fraction mood >=4", "Approximate diagnostic only; not used for fitting."),
]:
    add(key, value, unit, "DATA", "pmdata", note)
add("mood_latent_within_sd", 0.37, "latent point", note="User-specified calibration choice derived from a prior PMData analysis; this is a modeling choice, not a raw observed SD. Earth proxy (non-astronaut Fitbit users).")

# All additional quantities are explicit assumptions, including portability.
for key, value, unit, note in [
    ("seed", 42, "integer", "Default reproducible seed."),
    ("crew_size", 20, "synthetic people", "Independent illustrative people, not a simultaneous real ISS crew or a real mission roster."),
    ("mission_days", 180, "day/person", "Illustrative mission length."),
    ("preflight_days", 7, "day", "Daily calibration readings for all indicators, including glucose; mission schedule differs."),
    ("glucose_every_days", 7, "day", "Weekly assumed from the supplied brief; app ROUTINE has not been inspected."),
    ("glucose_first_day", 1, "mission day", "First weekly test at morning check-in."),
    ("morning_hour_utc", 8, "hour UTC", "Synthetic operational schedule; no calendar launch date is asserted."),
    ("evening_hour_utc", 20, "hour UTC", "Daily dose accumulated since the previous evening."),
    ("exercise_hour_utc", 21, "hour UTC", "Daily exercise total logged after the evening reading."),
    ("bp_sys_ramp_days", 7, "day", "Linear ramp; applying an ambulatory shift to a morning reading is an ASSUMPTION."),
    ("temp_inflight_shift_A", 0.0, "degC oral", "Main scenario; no assumed oral spaceflight shift."),
    ("temp_inflight_shift_B", 1.0, "degC oral", "Sensitivity scenario only. The source measured CORE temperature with a forehead heat-flux sensor; the size for ORAL temperature is an ASSUMPTION."),
    ("temp_oral_ramp_days", 75, "day", "Linear oral extrapolation from a core-temperature study, an ASSUMPTION."),
    ("bp_dia_mean", 76.0, "mmHg", "No verified diastolic baseline in the supplied brief."),
    ("bp_dia_between_sd", 6.0, "mmHg", ""),
    ("bp_baseline_correlation", 0.7, "correlation", "Personal latent sys/dia baselines positively linked."),
    ("bp_sys_within_sd", 7.8, "mmHg", "Value retained from the brief; Empirical Health page supporting it could not be resolved. Downgraded to ASSUMPTION, not VERIFIED/VERIFY."),
    ("bp_dia_within_sd", 5.5, "mmHg", "Approximate modeling choice; not an observed astronaut SD."),
    ("bp_daily_correlation", 0.6, "correlation", "Daily systolic/diastolic noise correlation."),
    ("bp_min_pulse_pressure", 10.0, "mmHg", "Engineering consistency floor, not a normality or clinical threshold; repair counts are reported."),
    ("hr_manual_sd", 1.0, "bpm", "Independent manual-reading noise in addition to Fitbit-proxy AR(1)."),
    ("spo2_mean", 97.5, "%", "Team healthy-profile choice; no claim this mean/spread was measured by the cited studies."),
    ("spo2_between_sd", 0.35, "percentage point", ""),
    ("spo2_within_sd", 1.0, "percentage point", ""),
    ("glucose_mean", 92.0, "mg/dL fasting", "Team illustrative fasting profile."),
    ("glucose_between_sd", 6.0, "mg/dL", ""),
    ("glucose_within_sd", 7.0, "mg/dL", ""),
    ("sleep_to_mood_next_day", -0.15, "latent mood point/hour deficit", "Only a deficit relative to that person's compensated event-free sleep baseline lowers next-day mood; no causal strength is established."),
    ("radiation_mean", 0.35, "mSv/day effective dose", "Team point inside the documented typical ISS range."),
    ("radiation_between_sd", 0.025, "mSv/day", "Exposure heterogeneity; not a physiological personal baseline."),
    ("radiation_within_sd", 0.025, "mSv/day", "Individual dosimeter/environment noise."),
    ("radiation_common_sd", 0.025, "mSv/day", "Shared day-to-day environment term."),
    ("exercise_mean", 120.0, "minute/day", "Changed from 100 to 120 (2 h): the astronauts in the Circulation 2019 BP study did individualized endurance and resistance training for up to two hours daily (AHA news release, 19/7/2019). Still a team ASSUMPTION, not a NASA prescription. The app's own target is 150 min."),
    ("exercise_between_sd", 12.0, "minute/day", ""),
    ("exercise_within_sd", 20.0, "minute/day", ""),
    ("miss_morning_probability", 0.04, "probability/day", "Bundle-level missingness, independent of physiology and events; not an observed NASA absence rate."),
    ("miss_evening_probability", 0.025, "probability/day", "Independent evening dosimeter absence."),
    ("event_start_min_day", 15, "mission day", "No programmed event during the initial adaptation period."),
    ("event_end_buffer_days", 7, "day", "Leave recovery time at the end."),
    ("event_gap_days", 2, "day", "Individual event separation; solar events may overlap individual events."),
    ("schedule_max_attempts", 10000, "attempt", "Engineering failure limit for non-overlapping placement."),
    ("infection_episodes", 2, "episode/person/mission", "Scenario coverage, not estimated incidence."),
    ("infection_duration", 5, "day", ""),
    ("infection_shape", [0.25, 0.65, 1.0, 0.65, 0.25], "peak fraction/day", "Time profile, not a clinical trajectory estimate."),
    ("fluid_loss_episodes", 1, "episode/person/mission", ""),
    ("fluid_loss_duration", 6, "day", ""),
    ("fluid_loss_shape", [0.15, 0.35, 0.65, 1.0, 0.65, 0.25], "peak fraction/day", ""),
    ("fluid_dia_multiplier", 0.6, "diastolic/systolic effect ratio", ""),
    ("sleep_debt_episodes", 3, "episode/person/mission", ""),
    ("sleep_debt_duration_range", [5, 10], "day inclusive", ""),
    ("sleep_debt_shape_anchors", [0.6, 1.0, 0.7], "onset/peak/end fraction", "Linear interpolation over each episode."),
    ("sleep_debt_mood_from_day", 3, "episode day", ""),
    ("eva_episodes", 3, "episode/person/mission", "Coverage assumption, not a real EVA assignment."),
    ("eva_duration", 1, "day", "BP and HR contexts are After EVA. Other readings remain morning contexts."),
    ("solar_event_day", 85, "mission day", "Crew-wide identical timing and dose multipliers; stress scenario, not an ISS forecast."),
    ("solar_duration", 2, "day", ""),
    ("calibration_search_bounds", [-5.0, 5.0], "additive units", "Engineering bracket for one-time sleep and rounded-mood mean correction."),
    ("calibration_iterations", 80, "iteration", ""),
    ("latent_sd_ddof", 1, "degree of freedom", "Crew latent personal baselines match SAMPLE SD, not population SD."),
    ("numeric_tolerance", 1e-9, "floating point", "Consistency tolerance; not a source-based physiological tolerance."),
    ("check_bp_tolerance", 2.0, "mmHg", "Predeclared synthetic source-match acceptance tolerance."),
    ("check_sleep_tolerance", 0.03, "hour", ""),
    ("check_sleep_share_tolerance", 0.05, "absolute fraction", "Predeclared held-out sleep-tail tolerance; no sleep-width tuning is performed."),
    ("check_temp_tolerance", 0.12, "degC", ""),
    ("check_hr_tolerance", 1.0, "bpm", ""),
    ("check_mood_mean_tolerance", 0.002, "point", ""),
    ("check_mood_low_tolerance", 0.05, "absolute fraction", "Prior PMData-tail diagnostic, not independent validation."),
    ("check_radiation_mission_range", [40.0, 90.0], "mSv/180 days", "Approximate brief acceptance range including synthetic solar events."),
    ("low_mood_cutoff", 2, "point inclusive", "Diagnostic rating cutoff, not a clinical label."),
    ("high_mood_cutoff", 4, "point inclusive", ""),
    ("sleep_check_cutoff", 7.0, "hour inclusive", "Held-out source check boundary."),
    ("rng_stream_baselines", 101, "stream id", ""),
    ("rng_stream_daily", 202, "stream id", ""),
    ("rng_stream_events", 303, "stream id", ""),
    ("rng_stream_missing", 404, "stream id", "Missingness does not consume any physiological RNG state."),
]:
    add(key, value, unit, note=note)

# Every event-size range is in this registry, including non-default sizes.
EVENT_RANGES = {
    "infection_temp": ("degC rise", {"small": [0.8, 1.2], "default": [0.8, 2.0], "large": [1.6, 2.0]}),
    "infection_sleep": ("hour loss", {"small": [0.3, 0.5], "default": [0.3, 0.8], "large": [0.6, 0.8]}),
    "infection_mood": ("latent point loss", {"small": [0.3, 0.4], "default": [0.3, 0.7], "large": [0.6, 0.7]}),
    "infection_spo2": ("percentage point loss", {"small": [0.5, 0.8], "default": [0.5, 1.5], "large": [1.2, 1.5]}),
    "fluid_bp_sys": ("mmHg loss", {"small": [12.0, 18.0], "default": [12.0, 25.0], "large": [19.0, 25.0]}),
    "fluid_hr": ("bpm rise", {"small": [10.0, 14.0], "default": [10.0, 22.0], "large": [18.0, 22.0]}),
    "sleep_debt_sleep": ("hour loss", {"small": [1.0, 1.4], "default": [1.0, 2.0], "large": [1.6, 2.0]}),
    "sleep_debt_mood": ("latent point loss", {"small": [0.2, 0.3], "default": [0.2, 0.6], "large": [0.5, 0.6]}),
    "eva_hr": ("bpm rise", {"small": [25.0, 35.0], "default": [25.0, 55.0], "large": [45.0, 55.0]}),
    "eva_bp_sys": ("mmHg rise", {"small": [10.0, 15.0], "default": [10.0, 25.0], "large": [20.0, 25.0]}),
    "eva_bp_dia": ("mmHg rise", {"small": [5.0, 8.0], "default": [5.0, 15.0], "large": [12.0, 15.0]}),
    "solar_day1": ("dose multiplier", {"small": [4.0, 6.0], "default": [4.0, 10.0], "large": [8.0, 10.0]}),
    "solar_day2": ("dose multiplier", {"small": [2.0, 2.7], "default": [2.0, 4.0], "large": [3.3, 4.0]}),
}
for name, (unit, ranges) in EVENT_RANGES.items():
    for size, limits in ranges.items():
        add(f"{name}_{size}", limits, unit, note="Assumed event magnitude; same episode timing and severity quantile in every size scenario.")

# Standalone engineering guards. They are NOT the uninspected app's input ranges.
RANGES = {
    "bp_sys": ([50.0, 240.0], 0, "mmHg"),
    "bp_dia": ([30.0, 150.0], 0, "mmHg"),
    "hr": ([30.0, 220.0], 0, "bpm"),
    "temp": ([33.0, 42.0], 1, "degC oral"),
    "spo2": ([50.0, 100.0], 0, "%"),
    "glucose": ([40.0, 400.0], 0, "mg/dL fasting"),
    "sleep": ([0.0, 16.0], 1, "hour/night"),
    "mood": ([1.0, 5.0], 0, "point; higher is better"),
    "radiation": ([0.0, 10.0], 2, "mSv/day effective dose"),
    "exercise": ([0.0, 240.0], 0, "minute/day"),
}
for col, (limits, precision, unit) in RANGES.items():
    add(f"range_{col}", limits, unit, note="Standalone technical guard; app compatibility is unverified. This is not a clinical normal range.")
    add(f"precision_{col}", precision, "decimal places", note="Output format requested in brief; exercise is assumed whole minutes.")

PARAMS = {row["key"]: row["value"] for row in REGISTRY}
assert len(PARAMS) == len(REGISTRY), "Duplicate registry key"
assert all(r["url"] for r in REGISTRY if r["status"] != "ASSUMPTION")
