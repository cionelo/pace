#!/usr/bin/env python3
"""
pace_upload.py
Upload validated pace.v1 JSON into Supabase.
Handles athlete deduplication and upserts.
"""

import json
import os
import pathlib
import sys
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service key for writes

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[err] Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

ALLOWED_DISTANCES = frozenset([
    "800m", "1500m", "Mile", "3000m", "5000m", "10,000m",
    "5K", "8K", "10K", "DMR", "4xMile",
])

DISTANCE_NORMALIZE_MAP = {
    "800": "800m", "800M": "800m",
    "1500": "1500m", "1500M": "1500m",
    "mile": "Mile", "MILE": "Mile",
    "3000": "3000m", "3000M": "3000m",
    "5000": "5000m", "5,000": "5000m", "5000M": "5000m",
    "10000": "10,000m", "10,000": "10,000m", "10000m": "10,000m", "10000M": "10,000m",
    "5k": "5K",
    "8k": "8K",
    "10k": "10K",
}


def normalize_distance(distance: str) -> str:
    """Normalize distance string to canonical form."""
    return DISTANCE_NORMALIZE_MAP.get(distance, distance)


def get_or_create_team(name: str) -> str:
    """Return team UUID, creating if needed."""
    result = sb.table("teams").select("id").eq("name", name).limit(1).execute()
    if result.data:
        return result.data[0]["id"]
    insert = sb.table("teams").insert({"name": name}).execute()
    return insert.data[0]["id"]


def get_or_create_athlete(name: str, team_id: str) -> str:
    """Return athlete UUID, deduplicating on (name, team_id)."""
    result = (
        sb.table("athletes")
        .select("id")
        .eq("name", name)
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    insert = sb.table("athletes").insert({"name": name, "team_id": team_id}).execute()
    return insert.data[0]["id"]


def upload_event(data: Dict[str, Any], event_meta: Optional[Dict[str, str]] = None) -> None:
    """Upload a pace.v1 JSON object to Supabase."""
    ev = data["event"]
    athletes = data["athletes"]

    source_id = ev["id"]
    meta = event_meta or {}

    raw_distance = meta.get("distance", "")
    distance = normalize_distance(raw_distance)
    if distance not in ALLOWED_DISTANCES:
        print(f"[skip] event {source_id}: distance '{raw_distance}' (normalized: '{distance}') is out of scope")
        return

    # Upsert event
    event_row = {
        "source_id": source_id,
        "name": meta.get("name") or ev.get("name") or source_id,
        "date": meta.get("date") or None,
        "location": meta.get("location") or None,
        "gender": meta.get("gender", "Men"),
        "distance": distance,
        "season": meta.get("season") or None,
        "provider": ev.get("provider"),
        "source_url": meta.get("source_url") or None,
    }

    result = (
        sb.table("events")
        .upsert(event_row, on_conflict="source_id")
        .execute()
    )
    event_id = result.data[0]["id"]
    print(f"[upload] event {source_id} -> {event_id}")

    for a in athletes:
        name = a.get("name", "").strip()
        # Title-case ALL CAPS names
        if name == name.upper() and len(name) > 1:
            name = name.title()
        team_name = a.get("team", "").strip()
        if not name:
            continue

        team_id = get_or_create_team(team_name) if team_name else None
        athlete_id = get_or_create_athlete(name, team_id)

        # Upsert result
        result_row = {
            "event_id": event_id,
            "athlete_id": athlete_id,
            "place": a.get("place"),
            "time_s": a.get("time_s"),
            "time_str": a.get("time_str"),
        }
        res = (
            sb.table("results")
            .upsert(result_row, on_conflict="event_id,athlete_id")
            .execute()
        )
        result_id = res.data[0]["id"]

        # Delete existing splits for this result (full replace)
        sb.table("splits").delete().eq("result_id", result_id).execute()

        # Insert splits
        splits_rows = []
        for i, sp in enumerate(a.get("splits", [])):
            splits_rows.append({
                "result_id": result_id,
                "label": sp.get("label", f"S{i+1}"),
                "ordinal": i,
                "elapsed_s": sp.get("elapsed_s"),
                "lap_s": sp.get("lap_s"),
                "place": sp.get("place"),
                "distance_m": sp.get("distance_m"),
            })

        if splits_rows:
            sb.table("splits").insert(splits_rows).execute()

    print(f"[upload] {len(athletes)} athletes uploaded for event {source_id}")


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Upload pace.v1 JSON to Supabase")
    ap.add_argument("file", help="Path to pace_normalized.json")
    ap.add_argument("--meta", default="{}", help='JSON string with event metadata: name, distance, gender, season, date, location')
    args = ap.parse_args()

    path = pathlib.Path(args.file)
    data = json.loads(path.read_text(encoding="utf-8"))
    event_meta = json.loads(args.meta)
    upload_event(data, event_meta)


if __name__ == "__main__":
    main()
