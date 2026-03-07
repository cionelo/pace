#!/usr/bin/env python3
"""
pace_renormalize_all.py
Batch re-process all cached events to add distance_m to splits.

Usage:
  # Dry run (preview only, no upload):
  python3 pace_renormalize_all.py --data-root py/data --dry-run

  # Process all events:
  python3 pace_renormalize_all.py --data-root py/data

  # Parallel batches (run in 4 terminals):
  python3 pace_renormalize_all.py --data-root py/data --batch 1 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 2 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 3 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 4 --total-batches 4

Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in py/.env
"""

import argparse
import json
import os
import pathlib
import sys
from typing import Any, Dict

from dotenv import load_dotenv
from supabase import create_client

# Import from sibling modules
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pace_normalize import add_distance_m, distance_str_to_meters, load_json, parse_label_distance_m
from pace_upload import upload_event


def fetch_event_metadata(sb) -> Dict[str, Dict[str, str]]:
    """Fetch all events from Supabase, keyed by source_id."""
    result = sb.table("events").select("source_id,distance,season,name,gender,date").execute()
    meta = {}
    for row in result.data:
        meta[row["source_id"]] = {
            "distance": row.get("distance", ""),
            "season": row.get("season", ""),
            "name": row.get("name", ""),
            "gender": row.get("gender", "Men"),
            "date": row.get("date", ""),
        }
    return meta


def process_event(event_dir: pathlib.Path, event_meta: Dict[str, str],
                  dry_run: bool, sb) -> str:
    """Re-normalize one event. Returns status string."""
    norm_path = event_dir / "pace_normalized.json"
    if not norm_path.exists():
        return "SKIP (no pace_normalized.json)"

    data = load_json(norm_path)
    if not data:
        return "SKIP (empty/invalid JSON)"

    distance_str = event_meta.get("distance", "")
    race_m = distance_str_to_meters(distance_str)
    if not race_m:
        return f"SKIP (unknown distance: {distance_str!r})"

    season = event_meta.get("season", "")

    # Add distance_m
    add_distance_m(data, race_m, season or None)

    # Check if any athlete got distance_m
    first_athlete = data["athletes"][0] if data.get("athletes") else None
    if not first_athlete or not first_athlete.get("splits"):
        return "SKIP (no splits to process)"

    sample = first_athlete["splits"][0]
    if "distance_m" not in sample:
        return "SKIP (no distance_m assigned)"

    # Determine inference method
    first_label = first_athlete["splits"][0].get("label", "")
    method = "parsed" if parse_label_distance_m(first_label) is not None else "inferred"

    n_athletes = len(data.get("athletes", []))
    n_splits = len(first_athlete.get("splits", []))
    last_d = first_athlete["splits"][-1].get("distance_m", "?")

    if dry_run:
        return f"DRY-RUN: {n_athletes} athletes, {n_splits} splits, last_distance_m={last_d}, method={method}"

    # Write updated normalized file
    norm_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # Re-upload
    upload_event(data, event_meta)
    return f"OK ({n_athletes} athletes, method={method})"


def main():
    ap = argparse.ArgumentParser(description="Batch re-normalize all events with distance_m")
    ap.add_argument("--data-root", default="py/data", help="Root data directory")
    ap.add_argument("--batch", type=int, default=0, help="Batch number (1-based, 0=all)")
    ap.add_argument("--total-batches", type=int, default=1, help="Total number of batches")
    ap.add_argument("--dry-run", action="store_true", help="Preview only, no upload")
    args = ap.parse_args()

    load_dotenv(pathlib.Path(__file__).parent / ".env")
    sb = create_client(
        os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY"),
    )

    root = pathlib.Path(args.data_root)
    if not root.exists():
        print(f"[err] data root not found: {root}")
        sys.exit(1)

    # Fetch event metadata from Supabase
    print("[info] Fetching event metadata from Supabase...")
    all_meta = fetch_event_metadata(sb)
    print(f"[info] Found {len(all_meta)} events in database")

    # Collect event directories
    event_dirs = sorted([
        d for d in root.iterdir()
        if d.is_dir() and (d / "pace_normalized.json").exists()
    ])
    print(f"[info] Found {len(event_dirs)} event directories with normalized data")

    # Batch selection
    if args.batch > 0 and args.total_batches > 1:
        chunk_size = len(event_dirs) // args.total_batches + 1
        start = (args.batch - 1) * chunk_size
        end = min(start + chunk_size, len(event_dirs))
        event_dirs = event_dirs[start:end]
        print(f"[info] Batch {args.batch}/{args.total_batches}: processing {len(event_dirs)} events (index {start}-{end-1})")

    # Process each event
    results = {"OK": 0, "SKIP": 0, "DRY-RUN": 0, "ERROR": 0}
    for d in event_dirs:
        source_id = d.name
        meta = all_meta.get(source_id, {})
        if not meta:
            print(f"  [{source_id}] SKIP (not found in Supabase)")
            results["SKIP"] += 1
            continue
        try:
            status = process_event(d, meta, args.dry_run, sb)
            category = status.split("(")[0].split(":")[0].strip()
            results[category] = results.get(category, 0) + 1
            print(f"  [{source_id}] {status}")
        except Exception as e:
            print(f"  [{source_id}] ERROR: {e}")
            results["ERROR"] += 1

    print(f"\nDone. {results}")


if __name__ == "__main__":
    main()
