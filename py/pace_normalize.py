#!/usr/bin/env python3

#repo root next to pace_scraper.py:
"""
pace_normalize.py
Normalize provider-specific race JSON into a canonical PACE format.

Inputs (per event directory):
  split_report.json   # from pace_scraper.py
  ind_res_list.json   # from pace_scraper.py

Output:
  pace_normalized.json

Schema: "pace.v1"

{
  "schema": "pace.v1",
  "event": {
    "id": "<event_id>",
    "provider": "<provider or unknown>",
    "name": "<optional event name>",
    "splits": ["1K","2K","3K","4K","5K"]   # ordered list of split labels, if known
  },
  "athletes": [
    {
      "id": "stable string id",
      "bib": "bib as string or ''",
      "name": "Full Name",
      "team": "Team Name",
      "place": 1,
      "time_str": "17:22.4",
      "time_s": 1042.4,
      "splits": [
        {
          "label": "1K",
          "elapsed_str": "3:25.0",
          "elapsed_s": 205.0,
          "lap_s": 205.0,
          "place": 3
        }
      ],
      "flags": {
        "pr": bool,
        "sb": bool
      }
    }
  ]
}

Usage:
  python pace_normalize.py --root data
  python pace_normalize.py --root data --event-id 2149044 --force
"""

import argparse
import json
import math
import pathlib
import re
from typing import Any, Dict, List, Optional, Tuple


# ---------- small helpers ----------

def load_json(path: pathlib.Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def time_to_seconds(s: Any) -> Optional[float]:
    """
    Convert common race time strings to seconds.
    Supports:
      - M:SS
      - M:SS.t
      - H:MM:SS
      - H:MM:SS.t
    Returns None on failure.
    """
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).strip()
    if not s or s in ("DNF", "DQ", "DNS", "-", "--"):
        return None

    # Handle mmss.t without colon (rare)
    if ":" not in s:
        try:
            return float(s)
        except ValueError:
            return None

    parts = s.split(":")
    try:
        parts = [float(p) for p in parts]
    except ValueError:
        return None

    # from right: seconds, then minutes, then hours if present
    if len(parts) == 2:
        m, sec = parts
        return m * 60.0 + sec
    if len(parts) == 3:
        h, m, sec = parts
        return h * 3600.0 + m * 60.0 + sec
    return None


def best_str(*vals: Any) -> str:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def safe_int(v: Any) -> Optional[int]:
    try:
        i = int(v)
        return i
    except Exception:
        return None


def guess_provider(*objs: Dict[str, Any]) -> str:
    for o in objs:
        if not isinstance(o, dict):
            continue
        p = o.get("_provider")
        if isinstance(p, str) and p:
            return p
    return "unknown"


# ---------- distance inference ----------

def parse_label_distance_m(label: str) -> Optional[float]:
    """Parse a distance label like '200M', '1K', '1.6K' into meters. Returns None if not parseable."""
    label = label.strip().upper()
    m = re.match(r'^(\d+(?:\.\d+)?)\s*(M|K|KM)$', label)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2)
    if unit == 'M':
        return val
    if unit in ('K', 'KM'):
        return val * 1000
    return None


DISTANCE_TO_METERS = {
    "800m": 800, "1500m": 1500, "mile": 1609, "Mile": 1609, "1600m": 1600,
    "3000m": 3000, "3000mSC": 3000, "3K": 3000,
    "5000m": 5000, "5K": 5000,
    "6K": 6000, "8K": 8000, "10K": 10000, "10000m": 10000,
}


def distance_str_to_meters(distance: str) -> Optional[float]:
    """Convert an event distance string to meters."""
    if not distance:
        return None
    d = distance.strip()
    if d in DISTANCE_TO_METERS:
        return float(DISTANCE_TO_METERS[d])
    m = re.match(r'^(\d+(?:\.\d+)?)\s*m?$', d, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


_KNOWN_LAP_DISTANCES = [200, 300, 400]


def add_distance_m(data: Dict[str, Any], race_distance_m: float,
                   season: Optional[str] = None) -> Dict[str, Any]:
    """
    Post-process a pace.v1 dict: add distance_m to every split.
    Strategy:
    1. If labels parse as distances (e.g. "200M", "1K"), use them directly.
    2. If labels are generic ("1", "2", ...), infer from race_distance_m + split count.
    3. Fallback: equal spacing.
    """
    for athlete in data.get("athletes", []):
        splits = athlete.get("splits", [])
        if not splits:
            continue
        parsed = [parse_label_distance_m(s.get("label", "")) for s in splits]
        if all(p is not None for p in parsed):
            for sp, d in zip(splits, parsed):
                sp["distance_m"] = d
            continue
        n = len(splits)
        inferred = _infer_distances_from_count(n, race_distance_m, season)
        for sp, d in zip(splits, inferred):
            sp["distance_m"] = d
    return data


def _infer_distances_from_count(num_splits: int, race_distance_m: float,
                                 season: Optional[str] = None) -> List[float]:
    """
    Given N numbered splits and total race distance, infer cumulative distance_m for each.
    Try known lap sizes: first_split = race_distance - (N-1) * lap. Must be > 0 and <= lap.
    Fallback: equal spacing.
    """
    if num_splits <= 0:
        return []
    if num_splits == 1:
        return [race_distance_m]
    for lap in _KNOWN_LAP_DISTANCES:
        first = race_distance_m - (num_splits - 1) * lap
        if 0 < first <= lap:
            return [first + i * lap for i in range(num_splits)]
    step = race_distance_m / num_splits
    return [step * (i + 1) for i in range(num_splits)]


# ---------- core normalization ----------

def normalize_event(event_id: str,
                    split_report: Optional[Dict[str, Any]],
                    ind_res_list: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Normalize a single event's raw JSON pair into pace.v1.
    Very defensive: works across all current providers from pace_scraper.py.
    """
    sr = split_report or {}
    ir = ind_res_list or {}

    provider = guess_provider(sr, ir)

    # Unwrap common containers
    sr_src = sr.get("_source") if isinstance(sr.get("_source"), dict) else sr
    ir_src = ir.get("_source") if isinstance(ir.get("_source"), dict) else ir

    # Unwrap sgs (split groups) when spr/spd are nested under _source.sgs[]
    # Use first group by default (typically the most granular — e.g. "Every Lap"
    # for indoor/outdoor track with 200m/400m laps).
    if isinstance(sr_src, dict) and isinstance(sr_src.get("sgs"), list) and not sr_src.get("spr"):
        sgs = sr_src["sgs"]
        sr_src = sgs[0] if sgs else {}

    spr_rows = sr_src.get("spr") if isinstance(sr_src, dict) else None
    if not isinstance(spr_rows, list):
        spr_rows = []
    r_rows = ir_src.get("r") if isinstance(ir_src, dict) else None
    if not isinstance(r_rows, list):
        r_rows = []

    # 1) Extract splits metadata (Xpress-style spd, or from rows)
    split_defs = []

    # Case: Xpress/AthleticLIVE style: _source.spd = list of split definitions
    if isinstance(sr_src, dict) and isinstance(sr_src.get("spd"), list):
        spd = sorted(sr_src["spd"], key=lambda x: (x.get("nu") or 0))
        for s in spd:
            label = best_str(s.get("n"), s.get("l"), s.get("name"))
            if label:
                split_defs.append(label)

    # Fallback: collect labels seen in any row's splits arrays
    if not split_defs:
        labels_seen = []
        def add_label(lbl: str):
            lbl = (lbl or "").strip()
            if lbl and lbl not in labels_seen:
                labels_seen.append(lbl)

        for row in spr_rows:
            r = row.get("r", row) if isinstance(row, dict) else {}
            # Raspy-style: r.splits = [{label, tm}, ...]
            if isinstance(r.get("splits"), list):
                for sp in r["splits"]:
                    if isinstance(sp, dict):
                        add_label(best_str(sp.get("label"), sp.get("name")))
            # Any other custom split structures can be added here later

        split_defs = labels_seen

    # 2) Build map from results rows (ind_res_list) keyed by (name, team, bib)
    res_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    def extract_result_row(item: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(item, dict):
            return None
        r = item.get("r", item)
        if not isinstance(r, dict):
            return None

        a = r.get("a", {})
        if not isinstance(a, dict):
            a = {}

        # For individual events, team is nested under a.t
        # For relay events, team is directly on r.t (no athlete node)
        t = a.get("t", {})
        if not isinstance(t, dict):
            t = {}
        rt = r.get("t", {})
        if not isinstance(rt, dict):
            rt = {}

        name = best_str(
            a.get("n"),
            f"{a.get('fn','')} {a.get('ln','')}",
            r.get("Name"),
            r.get("Athlete"),
            r.get("Runner"),
            r.get("name"),
        )
        team = best_str(
            t.get("f"), t.get("n"),
            rt.get("f"), rt.get("n"),
            r.get("Team"), r.get("School"),
            r.get("team")
        )

        # Relay: no athlete name, but team is on r.t — construct name from team + designation
        if not name and team and rt:
            rd = best_str(r.get("rd"))
            name = f"{team} {rd}".strip() if rd else team
        bib = best_str(
            a.get("b"), a.get("bib"),
            r.get("bib"), r.get("Bib")
        )
        place = safe_int(
            r.get("p") or r.get("place") or r.get("Place") or r.get("Pl") or r.get("PL")
        )
        time_str = best_str(
            r.get("m"), r.get("tm"),
            r.get("Time"), r.get("Final"),
            r.get("time")
        )

        flags_raw = r.get("fl") or r.get("flags") or {}
        if not isinstance(flags_raw, dict):
            flags_raw = {}
        flags = {
            "pr": bool(flags_raw.get("pr") or flags_raw.get("PR") or False),
            "sb": bool(flags_raw.get("sb") or flags_raw.get("SB") or False),
        }

        # Drop truly empty rows
        if not name and not time_str and not team:
            return None

        return {
            "bib": bib,
            "name": name,
            "team": team,
            "place": place,
            "time_str": time_str,
            "time_s": time_to_seconds(time_str),
            "flags": flags,
            "raw": r,  # keep for matching splits
        }

    for item in r_rows:
        row = extract_result_row(item)
        if not row:
            continue
        k = (row["name"].lower(), row["team"].lower(), row["bib"])
        # prefer the first; if conflict, keep the one with place/time
        if k in res_map:
            existing = res_map[k]
            if (existing["place"] is None or existing["time_s"] is None) and (
                row["place"] is not None or row["time_s"] is not None
            ):
                res_map[k] = row
        else:
            res_map[k] = row

    # 3) Attach splits from split_report rows
    # Strategy:
    #   - For each spr row, build splits[] with cumulative times etc.
    #   - Match to res_map via (name, team, bib) from that row's "a"/"t" data.
    def build_splits_from_spr_row(row: Any) -> Tuple[Tuple[str,str,str], List[Dict[str,Any]]]:
        if not isinstance(row, dict):
            return (("", "", "")), []

        r = row.get("r", row)
        if not isinstance(r, dict):
            return (("", "", "")), []

        a = r.get("a", {})
        if not isinstance(a, dict):
            a = {}
        t = a.get("t", {})
        if not isinstance(t, dict):
            t = {}
        rt = r.get("t", {})
        if not isinstance(rt, dict):
            rt = {}

        name = best_str(
            a.get("n"),
            f"{a.get('fn','')} {a.get('ln','')}",
            r.get("Name"),
            r.get("Athlete"),
            r.get("Runner"),
            r.get("name"),
        )
        team = best_str(
            t.get("f"), t.get("n"),
            rt.get("f"), rt.get("n"),
            r.get("Team"), r.get("School"),
            r.get("team")
        )
        # Relay: construct name from team + designation
        if not name and team and rt:
            rd = best_str(r.get("rd"))
            name = f"{team} {rd}".strip() if rd else team

        bib = best_str(
            a.get("b"), a.get("bib"),
            r.get("bib"), r.get("Bib")
        )
        key = (name.lower(), team.lower(), bib)

        splits: List[Dict[str, Any]] = []

        # Case A: legacy Xpress-style: row.sp[] + global split_defs (spd)
        if isinstance(row.get("sp"), list) and split_defs:
            prev_cs = None
            for i, sp in enumerate(row["sp"]):
                sp_obj = sp.get("sp") if isinstance(sp, dict) else None
                if not isinstance(sp_obj, dict):
                    continue
                cs = best_str(sp_obj.get("cs"), sp_obj.get("cum"), sp_obj.get("c"))
                spv = best_str(sp_obj.get("sp"), sp_obj.get("lap"))
                label = split_defs[i] if i < len(split_defs) else f"S{i+1}"
                elapsed_str = cs or spv
                elapsed_s = time_to_seconds(elapsed_str)
                if elapsed_s is None and spv:
                    elapsed_s = time_to_seconds(spv)
                lap_s = None
                if elapsed_s is not None:
                    if prev_cs is not None:
                        lap_s = elapsed_s - prev_cs
                    elif spv:
                        lap_s = time_to_seconds(spv)
                prev_cs = elapsed_s if elapsed_s is not None else prev_cs
                splits.append({
                    "label": label,
                    "elapsed_str": elapsed_str or "",
                    "elapsed_s": elapsed_s,
                    "lap_s": lap_s,
                    "place": sp.get("p") if isinstance(sp, dict) else None,
                })

        # Case B: Raspy-style: r.splits = [{label, tm}, ...]
        if isinstance(r.get("splits"), list):
            prev_cs = None
            for i, sp in enumerate(r["splits"]):
                if not isinstance(sp, dict):
                    continue
                label = best_str(sp.get("label"), sp.get("name"), f"S{i+1}")
                elapsed_str = best_str(
                    sp.get("tm"), sp.get("time"), sp.get("cs"), sp.get("elapsed")
                )
                elapsed_s = time_to_seconds(elapsed_str)
                lap_s = None
                if elapsed_s is not None:
                    if prev_cs is not None:
                        lap_s = elapsed_s - prev_cs
                    else:
                        lap_s = elapsed_s
                prev_cs = elapsed_s if elapsed_s is not None else prev_cs
                splits.append({
                    "label": label,
                    "elapsed_str": elapsed_str or "",
                    "elapsed_s": elapsed_s,
                    "lap_s": lap_s,
                    "place": sp.get("place_at_split") or sp.get("p"),
                })

        # Other providers (trackscoreboard_raw, pttiming, milesplit_live)
        # can be tightened later once we see their exact shapes. For now, we
        # leave splits empty; they still normalize as finish-only results.

        return key, splits

    splits_map: Dict[Tuple[str,str,str], List[Dict[str,Any]]] = {}
    for row in spr_rows:
        key, splits = build_splits_from_spr_row(row)
        if not any(key):
            continue
        if splits:
            splits_map[key] = splits

    # 3b) Fallback: extract splits from ind_res_list's irs (individual result splits).
    # AthleticNET/AthleticLIVE embeds per-lap splits directly in each result row as
    # r.irs = [{sp: "35.656", cs: "35.656"}, ...] (sp=lap time, cs=cumulative).
    # This only fills in athletes not already covered by the split_report spr data.
    for item in r_rows:
        r_inner = item.get("r", item) if isinstance(item, dict) else {}
        if not isinstance(r_inner, dict):
            continue
        irs = r_inner.get("irs")
        if not isinstance(irs, list) or not irs:
            continue

        a = r_inner.get("a", {})
        if not isinstance(a, dict):
            a = {}
        t = a.get("t", {}) if isinstance(a.get("t"), dict) else {}
        rt = r_inner.get("t", {}) if isinstance(r_inner.get("t"), dict) else {}
        name = best_str(
            a.get("n"),
            f"{a.get('fn','')} {a.get('ln','')}",
            r_inner.get("Name"), r_inner.get("Athlete"),
            r_inner.get("Runner"), r_inner.get("name"),
        )
        team = best_str(
            t.get("f"), t.get("n"), rt.get("f"), rt.get("n"),
            r_inner.get("Team"), r_inner.get("School"), r_inner.get("team"),
        )
        bib = best_str(a.get("b"), a.get("bib"), r_inner.get("bib"))
        key = (name.lower(), team.lower(), bib)

        if key in splits_map:
            continue  # already populated from split_report

        irs_splits: List[Dict[str, Any]] = []
        for i, entry in enumerate(irs):
            if not isinstance(entry, dict):
                continue
            cs = entry.get("cs", "")   # cumulative split string (e.g. "1:11.547")
            sp_time = entry.get("sp", "")  # lap split string (e.g. "35.892")
            label = split_defs[i] if i < len(split_defs) else f"S{i+1}"
            elapsed_s = time_to_seconds(cs) if cs else time_to_seconds(sp_time)
            lap_s = time_to_seconds(sp_time) if sp_time else None
            irs_splits.append({
                "label": label,
                "elapsed_str": cs or sp_time,
                "elapsed_s": elapsed_s,
                "lap_s": lap_s,
                "place": None,
            })

        if irs_splits:
            splits_map[key] = irs_splits

    # 4) Assemble final athletes list from res_map, attach splits_map
    athletes_out: List[Dict[str, Any]] = []

    for key, base in res_map.items():
        name_l, team_l, bib = key
        splits = splits_map.get(key, [])

        # stable id: bib-name-team combo
        raw = base.get("raw") or {}
        aid = (
            base["bib"] or
            raw.get("id") or raw.get("i") or
            f"{base['name']}-{base['team']}"
        )
        aid = str(aid).strip() or f"{base['name']}-{base['team'] or 'NA'}"

        athletes_out.append({
            "id": aid,
            "bib": base["bib"],
            "name": base["name"],
            "team": base["team"],
            "place": base["place"],
            "time_str": base["time_str"],
            "time_s": base["time_s"],
            "splits": splits,
            "flags": base["flags"],
        })

    # 5) If no ind_res_list rows but we *do* have spr_rows, fall back to spr_rows
    if not athletes_out and spr_rows:
        for row in spr_rows:
            r = row.get("r", row) if isinstance(row, dict) else {}
            a = r.get("a", {})
            if not isinstance(a, dict):
                a = {}
            t = a.get("t", {}) if isinstance(a.get("t"), dict) else {}
            rt = r.get("t", {}) if isinstance(r.get("t"), dict) else {}
            name = best_str(
                a.get("n"),
                f"{a.get('fn','')} {a.get('ln','')}",
                r.get("Name"),
                r.get("Athlete"),
                r.get("Runner"),
                r.get("name"),
            )
            team = best_str(t.get("f"), t.get("n"), rt.get("f"), rt.get("n"), r.get("Team"), r.get("School"))
            # Relay: construct name from team + designation
            if not name and team and rt:
                rd = best_str(r.get("rd"))
                name = f"{team} {rd}".strip() if rd else team
            bib = best_str(a.get("b"), a.get("bib"), r.get("bib"), r.get("Bib"))
            place = safe_int(r.get("p") or r.get("place") or r.get("Pl"))
            time_str = best_str(r.get("m"), r.get("tm"), r.get("Time"), r.get("time"))
            key, splits = build_splits_from_spr_row(row)

            if not name and not time_str:
                continue

            aid = (
                bib or r.get("id") or r.get("i") or
                f"{name}-{team or 'NA'}"
            )
            athletes_out.append({
                "id": str(aid),
                "bib": bib,
                "name": name,
                "team": team,
                "place": place,
                "time_str": time_str,
                "time_s": time_to_seconds(time_str),
                "splits": splits,
                "flags": {"pr": False, "sb": False},
            })

    # 6) Deduce event-level split labels from athletes if still empty
    if not split_defs:
        labels = []
        for a in athletes_out:
            for sp in a.get("splits") or []:
                lbl = (sp.get("label") or "").strip()
                if lbl and lbl not in labels:
                    labels.append(lbl)
        split_defs = labels

    event_meta = {
        "id": event_id,
        "provider": provider,
        "name": "",          # can be filled later if upstream adds it
        "splits": split_defs
    }

    return {
        "schema": "pace.v1",
        "event": event_meta,
        "athletes": athletes_out,
    }


# ---------- CLI ----------

def main():
    ap = argparse.ArgumentParser("Normalize race JSON bundles into pace.v1 schema")
    ap.add_argument("--root", default="data", help="Root data folder containing event subdirs")
    ap.add_argument("--event-id", help="Only normalize this event id (subdir name)")
    ap.add_argument("--force", action="store_true", help="Overwrite existing pace_normalized.json")
    ap.add_argument("--distance", help="Event distance (e.g. '3000m', 'mile', '5K') for distance_m inference")
    ap.add_argument("--season", choices=["indoor", "outdoor", "xc"], help="Season for distance_m inference")
    args = ap.parse_args()

    root = pathlib.Path(args.root)
    if not root.exists():
        print(f"[err] root folder not found: {root}")
        raise SystemExit(1)

    event_dirs: List[pathlib.Path] = []

    if args.event_id:
        d = root / args.event_id
        if not d.exists():
            print(f"[err] event dir not found: {d}")
            raise SystemExit(1)
        event_dirs = [d]
    else:
        # any directory containing split_report.json is considered an event dir
        for d in root.iterdir():
            if d.is_dir() and (d / "split_report.json").exists():
                event_dirs.append(d)

    if not event_dirs:
        print("[info] no event directories found; nothing to normalize.")
        raise SystemExit(0)

    for d in sorted(event_dirs):
        event_id = d.name
        out_path = d / "pace_normalized.json"
        if out_path.exists() and not args.force:
            print(f"[skip] {event_id}: pace_normalized.json already exists")
            continue

        sr = load_json(d / "split_report.json")
        ir = load_json(d / "ind_res_list.json")

        if sr is None and ir is None:
            print(f"[skip] {event_id}: missing both split_report.json and ind_res_list.json")
            continue

        norm = normalize_event(event_id, sr, ir)

        # Post-process: add distance_m if race distance is known
        race_m = distance_str_to_meters(args.distance) if args.distance else None
        if race_m:
            add_distance_m(norm, race_m, args.season)

        out_path.write_text(json.dumps(norm, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] {event_id}: wrote {out_path}")

if __name__ == "__main__":
    main()
