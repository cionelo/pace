#!/usr/bin/env python3
"""
pace_validate.py
Validate pace.v1 JSON before uploading to Supabase.
Blocks upload on any critical error. Outputs clear report.
"""

import json
import pathlib
import sys
from typing import Any, Dict, List, Tuple

# Plausible time bounds per distance (seconds): (min, max)
DISTANCE_BOUNDS: Dict[str, Tuple[float, float]] = {
    "800m":  (100, 300),
    "1500m": (210, 480),
    "mile":  (225, 510),
    "1600m": (225, 510),
    "3000m": (450, 960),
    "3000mSC": (480, 1020),
    "3K":    (450, 960),
    "5K":    (780, 1800),
    "5000m": (780, 1800),
    "6K":    (960, 2100),
    "8K":    (1260, 2700),
    "10K":   (1620, 3600),
    "10000m":(1620, 3600),
}

# World-record-ish minimum lap pace per km (seconds)
MIN_LAP_PACE_PER_KM = 145  # ~2:25/km, faster than any human


class ValidationError:
    def __init__(self, athlete: str, team: str, message: str, severity: str = "BLOCK"):
        self.athlete = athlete
        self.team = team
        self.message = message
        self.severity = severity

    def __str__(self):
        return f"  [{self.severity}] {self.athlete} ({self.team}): {self.message}"


def validate_pace_v1(data: Dict[str, Any]) -> List[ValidationError]:
    errors: List[ValidationError] = []

    # Schema check
    if data.get("schema") != "pace.v1":
        errors.append(ValidationError("", "", f"Invalid schema: {data.get('schema')}", "BLOCK"))
        return errors

    event = data.get("event", {})
    athletes = data.get("athletes", [])

    if not athletes:
        errors.append(ValidationError("", "", "No athletes in data", "BLOCK"))
        return errors

    distance = event.get("distance") or event.get("name") or ""

    # Infer distance bounds
    bounds = None
    for key, b in DISTANCE_BOUNDS.items():
        if key.lower() in distance.lower():
            bounds = b
            break

    # Count splits per athlete for completeness check
    split_counts = [len(a.get("splits", [])) for a in athletes if a.get("splits")]
    median_splits = sorted(split_counts)[len(split_counts) // 2] if split_counts else 0

    seen_keys: set = set()

    for a in athletes:
        name = a.get("name", "").strip()
        team = a.get("team", "").strip()
        time_s = a.get("time_s")
        splits = a.get("splits", [])

        # Name quality
        if not name:
            errors.append(ValidationError(name or "???", team, "Empty athlete name", "BLOCK"))
            continue

        if name.isdigit():
            errors.append(ValidationError(name, team, f"Name is just a number: '{name}'", "BLOCK"))

        # Duplicate check
        key = (name.lower(), team.lower())
        if key in seen_keys:
            errors.append(ValidationError(name, team, "Duplicate athlete in event", "BLOCK"))
        seen_keys.add(key)

        # Time bounds
        if time_s is not None and bounds:
            if time_s < bounds[0]:
                errors.append(ValidationError(name, team, f"Finish time {time_s:.1f}s below minimum {bounds[0]:.0f}s for {distance}", "BLOCK"))
            if time_s > bounds[1]:
                errors.append(ValidationError(name, team, f"Finish time {time_s:.1f}s above maximum {bounds[1]:.0f}s for {distance}", "BLOCK"))

        # Split validation
        prev_elapsed = 0.0
        for i, sp in enumerate(splits):
            elapsed = sp.get("elapsed_s")
            lap = sp.get("lap_s")
            label = sp.get("label", f"S{i+1}")

            if elapsed is not None:
                # Monotonic check
                if elapsed <= prev_elapsed and prev_elapsed > 0:
                    errors.append(ValidationError(
                        name, team,
                        f"Non-monotonic elapsed at {label}: {elapsed:.1f}s <= {prev_elapsed:.1f}s",
                        "BLOCK"
                    ))
                prev_elapsed = elapsed

            if lap is not None:
                # Negative lap
                if lap < 0:
                    errors.append(ValidationError(name, team, f"Negative lap at {label}: {lap:.1f}s", "BLOCK"))

                # Impossibly fast lap
                if lap < MIN_LAP_PACE_PER_KM * 0.15:  # sub-22s per ~200m
                    errors.append(ValidationError(
                        name, team,
                        f"Impossibly fast lap at {label}: {lap:.1f}s",
                        "BLOCK"
                    ))

        # Split completeness
        if median_splits > 0 and len(splits) < median_splits * 0.5:
            errors.append(ValidationError(
                name, team,
                f"Missing splits: {len(splits)} of {median_splits} expected",
                "WARN"
            ))

    return errors


def validate_file(path: pathlib.Path) -> Tuple[bool, str]:
    """Validate a pace.v1 JSON file. Returns (passed, report)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return False, f"Failed to read/parse {path}: {e}"

    errors = validate_pace_v1(data)
    event = data.get("event", {})
    athletes = data.get("athletes", [])

    blocks = [e for e in errors if e.severity == "BLOCK"]
    warns = [e for e in errors if e.severity == "WARN"]

    lines = []
    if blocks:
        lines.append(f"\nVALIDATION FAILED -- {path.name} NOT uploaded\n")
        for e in blocks:
            lines.append(str(e))
        if warns:
            lines.append(f"\n  Warnings ({len(warns)}):")
            for e in warns:
                lines.append(str(e))
        lines.append(f"\n  Provider: {event.get('provider', 'unknown')}")
        lines.append(f"  Source file: {path}")
        return False, "\n".join(lines)

    if warns:
        lines.append(f"\nVALIDATION PASSED WITH WARNINGS -- {path.name}\n")
        for e in warns:
            lines.append(str(e))
    else:
        lines.append(f"\n{path.name} validated OK")

    athlete_count = len(athletes)
    split_counts = [len(a.get("splits", [])) for a in athletes]
    avg_splits = sum(split_counts) / len(split_counts) if split_counts else 0
    lines.append(f"   {athlete_count} athletes, ~{avg_splits:.0f} splits each, {len(warns)} warnings")

    return True, "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pace_validate.py <path_to_pace_normalized.json> [...]")
        sys.exit(1)

    all_passed = True
    for fpath in sys.argv[1:]:
        passed, report = validate_file(pathlib.Path(fpath))
        print(report)
        if not passed:
            all_passed = False

    sys.exit(0 if all_passed else 1)
