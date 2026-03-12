#!/usr/bin/env python3
"""
pace_backfill_source_url.py
Reconstruct and backfill source_url for all existing events in Supabase.

Strategy:
  - legacy_spa events (numeric source_id): read py/data/{id}/ind_res_list.json,
    extract _source.mi (meet_id), look up domain from known meet_id->domain map,
    reconstruct https://{domain}/meets/{meet_id}/events/{source_id}.
    Relay/DMR events lack mi — infer meet_id from event name (conference prefix).
  - trackscoreboard_html events (source_id like "458_12_final"):
    parse meet_id + event_id + round, map to domain.
  - XC events not in py/data/: skip with a warning.

Usage:
  python3 py/pace_backfill_source_url.py [--data-root py/data] [--dry-run]
"""

import argparse
import json
import os
import pathlib
import re
import sys
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[err] Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── meet_id → (domain, protocol) ──────────────────────────────────────────────
# Confirmed via _source.mi field in cached ind_res_list.json.
MEET_ID_TO_DOMAIN: dict = {
    60709: ("live.athletictiming.net",     "https"),  # GNAC
    61469: ("snapresults.snaptiming.com",  "https"),  # CIAA
    61289: ("live.dcracetiming.com",       "https"),  # SIAC
    61291: ("live.xpresstiming.com",       "https"),  # Gulf South
    54381: ("live.jdlfasttrack.com",       "https"),  # Conference Carolinas
    60633: ("blueridgetiming.live",        "https"),  # MEAC
    59934: ("live.herostiming.com",        "https"),  # NSIC
    62216: ("live.rapidresultstiming.com", "https"),  # RMAC
    62261: ("live.fstiming.com",           "https"),  # GLIAC
    62706: ("live.athletic.net",           "https"),  # G-MAC
}

# Conference name keywords → meet_id (for relay events that lack mi in cache)
CONF_NAME_TO_MEET_ID: dict = {
    "gnac":                 60709,
    "ciaa":                 61469,
    "siac":                 61289,
    "gulf south":           61291,
    "conference carolinas": 54381,
    "meac":                 60633,
    "nsic":                 59934,
    "rmac":                 62216,
    "gliac":                62261,
    "g-mac":                62706,
}

# TrackScoreboard HTML: source_id pattern "458_12_final" → meet_id → domain
TRACKSCOREBOARD_MEET_DOMAIN: dict = {
    "458": ("lancer.trackscoreboard.com", "https"),  # NE10
    "895": ("live.halfmiletiming.com",    "http"),   # Peach Belt Indoor
}

# XC events only in PACE-stable (no py/data/ cache — skip)
XC_SOURCE_IDS = {"2148769", "2149044", "2149045", "2151152", "2151153"}


def get_meet_id_from_cache(source_id: str, data_root: pathlib.Path) -> Optional[int]:
    """Extract meet_id from cached ind_res_list.json for a legacy_spa event."""
    p = data_root / source_id / "ind_res_list.json"
    if not p.exists():
        return None
    try:
        d = json.loads(p.read_text())
        src = d.get("_source", d) if isinstance(d, dict) else {}
        if not isinstance(src, dict):
            return None
        mi = src.get("mi")
        return int(mi) if mi is not None else None
    except Exception:
        return None


def get_meet_id_from_name(event_name: str) -> Optional[int]:
    """Infer meet_id from conference keyword in event name (for relay events)."""
    name_l = event_name.lower()
    for keyword, meet_id in CONF_NAME_TO_MEET_ID.items():
        if keyword in name_l:
            return meet_id
    return None


def reconstruct_url_legacy_spa(
    source_id: str, event_name: str, data_root: pathlib.Path
) -> Optional[str]:
    """Reconstruct URL for a legacy_spa event."""
    meet_id = get_meet_id_from_cache(source_id, data_root)
    if meet_id is None:
        meet_id = get_meet_id_from_name(event_name)
    if meet_id is None:
        return None
    entry = MEET_ID_TO_DOMAIN.get(meet_id)
    if entry is None:
        print(f"  [warn] Unknown meet_id {meet_id} for event {source_id}")
        return None
    domain, proto = entry
    return f"{proto}://{domain}/meets/{meet_id}/events/{source_id}"


# Pattern: {meet_id}_{event_id}_{round}
_TS_PATTERN = re.compile(r'^(\d+)_(\d+)(?:_(\w+))?$')


def reconstruct_url_trackscoreboard(source_id: str) -> Optional[str]:
    """Reconstruct URL for a trackscoreboard_html event."""
    m = _TS_PATTERN.match(source_id)
    if not m:
        return None
    meet_id, event_id, round_seg = m.group(1), m.group(2), m.group(3)
    entry = TRACKSCOREBOARD_MEET_DOMAIN.get(meet_id)
    if entry is None:
        print(f"  [warn] Unknown trackscoreboard meet_id {meet_id} for {source_id}")
        return None
    domain, proto = entry
    if round_seg:
        return f"{proto}://{domain}/meets/{meet_id}/events/{event_id}/{round_seg}"
    return f"{proto}://{domain}/meets/{meet_id}/events/{event_id}"


def main():
    ap = argparse.ArgumentParser(description="Backfill source_url for existing events")
    ap.add_argument("--data-root", default="py/data", help="Path to cached scrape data root")
    ap.add_argument("--dry-run", action="store_true", help="Print URLs without updating DB")
    args = ap.parse_args()

    data_root = pathlib.Path(args.data_root)

    try:
        events = sb.table("events").select("id,source_id,name,source_url,provider").execute().data
    except Exception:
        # Column may not exist yet (migration not applied) — select without it
        events = sb.table("events").select("id,source_id,name,provider").execute().data
        for ev in events:
            ev.setdefault("source_url", None)
    print(f"Found {len(events)} events in Supabase\n")

    updated = skipped = failed = 0

    for ev in sorted(events, key=lambda e: e["name"]):
        sid = ev["source_id"]
        name = ev["name"]

        if ev.get("source_url"):
            print(f"  [skip] {sid:25} already set")
            skipped += 1
            continue

        if sid in XC_SOURCE_IDS:
            print(f"  [skip-xc] {sid:25} XC event — no local cache")
            skipped += 1
            continue

        url = None
        if _TS_PATTERN.match(sid):
            url = reconstruct_url_trackscoreboard(sid)
        else:
            url = reconstruct_url_legacy_spa(sid, name, data_root)

        if not url:
            print(f"  [fail] {sid:25} no URL for: {name[:50]}")
            failed += 1
            continue

        tag = "[dry] " if args.dry_run else ""
        print(f"  {tag}{sid:25} → {url}")

        if not args.dry_run:
            sb.table("events").update({"source_url": url}).eq("id", ev["id"]).execute()
            updated += 1
        else:
            updated += 1

    print(f"\nDone. {'Would update' if args.dry_run else 'Updated'}: {updated}  "
          f"Skipped: {skipped}  Failed: {failed}")


if __name__ == "__main__":
    main()
