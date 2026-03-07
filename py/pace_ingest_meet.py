#!/usr/bin/env python3
"""
pace_ingest_meet.py
Meet-level batch ingest: discover events -> scrape -> normalize -> validate -> upload.

Usage:
  # Interactive: show events, pick which to ingest
  python pace_ingest_meet.py --url "https://live.rapidresultstiming.com/meets/62216"

  # Auto: ingest all distance events
  python pace_ingest_meet.py --url "..." --auto

  # With metadata
  python pace_ingest_meet.py --url "..." --auto --meet-name "2026 RMAC Indoor Championships" --date "2026-02-28" --season indoor
"""

import argparse
import asyncio
import json
import pathlib
import subprocess
import sys


def run_step(label: str, cmd: list) -> bool:
    """Run a subprocess step, return success."""
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0


def ingest_event(event: dict, data_root: pathlib.Path, extra_meta: dict) -> bool:
    """Run the full pipeline for one event."""
    py_dir = pathlib.Path(__file__).parent
    href = event["href"]
    event_id = event["id"]

    # Build event name: meet name prefix + event name
    meet_prefix = extra_meta.get("meet_name", "")
    event_name = event["name"]
    if meet_prefix:
        full_name = f"{meet_prefix} {event_name}"
    else:
        full_name = event_name

    # Append round qualifier if prelim
    if event.get("round") == "Prelim" and "prelim" not in full_name.lower():
        full_name = full_name.rstrip() + " Prelims"

    event_meta = {
        "name": full_name,
        "distance": event["distance"] or event["category"],
        "gender": event["gender"],
        "season": extra_meta.get("season", "indoor"),
        "date": extra_meta.get("date", ""),
        "location": extra_meta.get("location", ""),
    }
    meta_json = json.dumps(event_meta)

    # Step 1: Scrape
    if not run_step(f"SCRAPE: {href}", [
        sys.executable, str(py_dir / "pace_scraper.py"),
        "--url", href, "--outdir", str(data_root),
    ]):
        print(f"[FAIL] Scraping failed for {href}")
        return False

    # Step 2: Normalize
    normalize_cmd = [
        sys.executable, str(py_dir / "pace_normalize.py"),
        "--root", str(data_root), "--force",
    ]
    if event_meta.get("distance"):
        normalize_cmd += ["--distance", event_meta["distance"]]
    if event_meta.get("season"):
        normalize_cmd += ["--season", event_meta["season"]]
    if not run_step("NORMALIZE", normalize_cmd):
        print("[FAIL] Normalization failed")
        return False

    # Step 3: Find normalized file and validate
    # Primary: direct path by discover event_id
    normalized_file = data_root / event_id / "pace_normalized.json"
    if not normalized_file.exists():
        # Secondary: derive the scraper output dir from the URL (handles TrackScoreboard
        # and other providers where event_id_from_url differs from discover's event_id)
        try:
            sys.path.insert(0, str(py_dir))
            from pace_scraper import event_id_from_url as _scraper_eid
            scraper_eid = _scraper_eid(href)
            alt_file = data_root / scraper_eid / "pace_normalized.json"
            if alt_file.exists():
                normalized_file = alt_file
        except Exception:
            pass
    if not normalized_file.exists():
        print(f"[FAIL] No pace_normalized.json found for event {event_id}")
        return False

    if not run_step(f"VALIDATE: {event_id}", [
        sys.executable, str(py_dir / "pace_validate.py"), str(normalized_file),
    ]):
        print(f"[WARN] Validation failed for {event_id} — skipping upload")
        return False

    # Step 4: Upload with metadata
    if not run_step(f"UPLOAD: {event_id}", [
        sys.executable, str(py_dir / "pace_upload.py"),
        str(normalized_file), "--meta", meta_json,
    ]):
        print(f"[FAIL] Upload failed for {event_id}")
        return False

    return True


def main():
    ap = argparse.ArgumentParser(description="Meet-level batch ingest pipeline")
    ap.add_argument("--url", required=True, help="Meet URL")
    ap.add_argument("--auto", action="store_true", help="Auto-ingest all distance events without prompting")
    ap.add_argument("--meet-name", default="", help="Meet name prefix for event names")
    ap.add_argument("--date", default="", help="Event date (YYYY-MM-DD)")
    ap.add_argument("--season", default="indoor", choices=["indoor", "outdoor", "xc"], help="Season")
    ap.add_argument("--location", default="", help="Meet location")
    ap.add_argument("--data-root", default="data", help="Root data directory")
    args = ap.parse_args()

    # Import discovery logic
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "pace_discover", pathlib.Path(__file__).parent / "pace_discover.py"
    )
    discover_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(discover_mod)

    print(f"\nDiscovering events at: {args.url}")
    events = asyncio.run(discover_mod.discover_events(args.url))

    if not events:
        print("No events found on this meet page.")
        sys.exit(1)

    # Show all events
    discover_mod.print_table(events, distance_only=False)
    print()

    # Select events to ingest
    if args.auto:
        selected = [e for e in events if e["category"] == "distance"]
        if not selected:
            print("No distance events found. Use interactive mode to select manually.")
            sys.exit(1)
        print(f"Auto-selected {len(selected)} distance event(s).")
    else:
        distance_events = [e for e in events if e["category"] == "distance"]
        print("Distance events (suggested):")
        for e in distance_events:
            print(f"  {e['id']:>12}  {e['gender']:<8}  {e['distance']:<8}  {e['name']}")
        print()
        raw = input("Enter event IDs to ingest (comma-separated), or press Enter for all distance events: ").strip()
        if not raw:
            selected = distance_events
        else:
            ids_wanted = {x.strip() for x in raw.split(",")}
            selected = [e for e in events if e["id"] in ids_wanted]
            if not selected:
                print("No matching events found.")
                sys.exit(1)

    extra_meta = {
        "meet_name": args.meet_name,
        "date": args.date,
        "season": args.season,
        "location": args.location,
    }

    data_root = pathlib.Path(args.data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    print(f"\nIngesting {len(selected)} event(s)...\n")
    results = []
    for event in selected:
        print(f"\n--- {event['id']}: {event['name']} ---")
        ok = ingest_event(event, data_root, extra_meta)
        results.append((event["id"], event["name"], ok))

    # Summary
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    for eid, name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {eid}  {name}")

    failures = sum(1 for _, _, ok in results if not ok)
    print(f"\n{len(results) - failures}/{len(results)} events ingested successfully.")
    sys.exit(1 if failures > 0 else 0)


if __name__ == "__main__":
    main()
