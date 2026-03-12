# pttiming + milesplit_live Split Normalization

**Model recommendation: Sonnet** — investigation + normalizer updates, well-scoped.

## Context

Read these files first:
- `docs/HANDOFF.md` — full project context
- `py/pace_scraper.py` — look at `capture_pttiming()` (~line 686) and `capture_milesplit_live()` (~line 819)
- `py/pace_normalize.py` — normalizer, specifically `build_splits_from_spr_row()` (~line 389) and the comment at line 489 saying "pttiming, milesplit_live can be tightened later"

## Problem

The scraper captures XHR payloads from pttiming and milesplit_live but the normalizer doesn't know how to parse their split data structures. Currently these produce **finish-only results** with empty splits arrays.

This blocks split charts for 5 D1 conferences:
- **pttiming (3):** Big 12, Big Ten, MVC
- **milesplit_live (2):** NEC, OVC

## Implementation Steps

### Step 1: Investigate XHR payload shapes

Run the scraper on one pttiming event to capture the raw XHR data and inspect the JSON structure:

```bash
cd pace/

# Scrape one Big 12 event to see pttiming data shape
python3 py/pace_scraper.py --url "https://live.pttiming.com/?mid=8683" --data-root py/data --headful
```

Then inspect the saved `split_report.json` and `ind_res_list.json`:
```bash
python3 -c "
import json
sr = json.load(open('py/data/<event_id>/split_report.json'))
print('split_report keys:', json.dumps(sr, indent=2)[:2000])
ir = json.load(open('py/data/<event_id>/ind_res_list.json'))
print('ind_res_list keys:', json.dumps(ir, indent=2)[:2000])
"
```

Do the same for milesplit_live:
```bash
python3 py/pace_scraper.py --url "https://milesplit.live/timers/959" --data-root py/data --headful
```

**Key questions to answer:**
- What keys hold athlete names/teams/bibs?
- What keys hold split times? Are they cumulative or lap-only?
- What keys hold split labels/distances?
- How many splits per athlete for each race distance?

### Step 2: Add pttiming split parsing to normalizer

In `py/pace_normalize.py`, in the `build_splits_from_spr_row()` function, add a Case C after the existing Case B:

```python
# Case C: pttiming-style splits
# (Fill in based on actual XHR shape from Step 1)
```

The new case should:
- Extract athlete identity (name, team, bib) from the pttiming row format
- Extract split times (cumulative elapsed or per-lap, whatever the XHR provides)
- Populate the same `splits[]` format used by Cases A and B: `{label, elapsed_str, elapsed_s, lap_s, place}`

### Step 3: Add milesplit_live split parsing

Same approach — add handling based on the actual XHR shape observed in Step 1.

### Step 4: Test

```bash
# Re-normalize cached pttiming data
python3 py/pace_renormalize_all.py --data-root py/data

# Validate
python3 py/pace_validate.py py/data/<pttiming_event_id>/pace_normalized.json
```

Then ingest to verify end-to-end:
```bash
python3 py/pace_ingest_meet.py \
  --url "https://live.pttiming.com/?mid=8683" \
  --auto --season indoor \
  --meet-name "2026 Big 12 Indoor Championships" --date "2026-02-28" \
  --data-root py/data
```

## Key Constraints
- Use `/usr/bin/python3` (3.9) — `.venv` is broken
- `--data-root py/data` always required from `pace/` root
- The `--headful` flag shows the browser so you can see what XHR requests fire
- pttiming pages use `?mid=XXXX` URLs and may show multiple events on one page — the scraper already handles this via `make_id_from_meta()` to split multi-race pages
- milesplit_live uses `/timers/XXX` (NEC) or `/meets/XXXXX` (OVC) URLs — verify both patterns work with the scraper

## Expected Outcome
After implementation, running the ingest script on Big 12/Big Ten/MVC/NEC/OVC should produce events with populated split charts, not just finish times.
