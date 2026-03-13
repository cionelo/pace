#!/bin/bash
# D1 Indoor Conference Championships 2026 — Batch Ingest
# Usage: cd pace/ && bash scripts/ingest_d1_indoor_2026.sh
#
# Runs each conference sequentially. Scraper caches are automatic —
# re-running skips already-scraped events.
#
# Provider support (all splits now working except MAC/Big South):
#   21 conferences: full pipeline (legacy_spa, trackscoreboard_html, flashresults)
#    3 conferences: pttiming — splits work (Big 12 mid=8683, Big Ten mid=8715, MVC mid=8717)
#    2 conferences: milesplit_live — splits work (OVC; NEC needs correct /meets/ URL)
#    1 conference:  fstiming/MAC — no splits in source (finish times only)
#    1 conference:  tfmeetpro/Big South — no split data in source

cd "$(dirname "$0")/.."

PYTHON=/usr/bin/python3
INGEST="$PYTHON py/pace_ingest_meet.py --auto --season indoor --data-root py/data"
FAILURES=0

# Wrapper: continues on failure, tracks count
ingest() {
  if ! $INGEST "$@"; then
    echo "  ^^^ FAILED ^^^"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== D1 Indoor 2026 Ingestion ==="
echo ""

# --- Tier 1: Full pipeline (splits expected) ---

echo "[1/27] America East (trackscoreboard_html)"
ingest --url "https://lancer.trackscoreboard.com/meets/459/events" \
  --meet-name "2026 America East Indoor Championships" --date "2026-02-22"

echo "[2/27] AAC (legacy_spa)"
ingest --url "https://live.xpresstiming.com/meets/60861" \
  --meet-name "2026 American Athletic Conference Indoor Championships" --date "2026-02-27"

echo "[3/27] ASUN (legacy_spa)"
ingest --url "https://live.dcracetiming.com/meets/61390" \
  --meet-name "2026 ASUN Conference Indoor Championships" --date "2026-02-22"

echo "[4/27] A10 (legacy_spa)"
ingest --url "https://blueridgetiming.live/meets/60148" \
  --meet-name "2026 Atlantic 10 Indoor Championships" --date "2026-02-22"

echo "[5/27] ACC (flashresults)"
ingest --url "https://flashresults.com/2026_Meets/Indoor/02-26_ACC/index.htm" \
  --meet-name "2026 ACC Indoor Championships" --date "2026-02-28"

echo "[6/27] Big East (legacy_spa)"
ingest --url "https://results.lakeshoreathleticservices.com/meets/61998" \
  --meet-name "2026 Big East Indoor Championships" --date "2026-02-28"

echo "[7/27] Big Sky (legacy_spa)"
ingest --url "https://live.athletic.net/meets/62234" \
  --meet-name "2026 Big Sky Indoor Championships" --date "2026-02-27"

echo "[8/27] CAA (trackscoreboard_html)"
ingest --url "https://lancer.trackscoreboard.com/meets/461/events" \
  --meet-name "2026 CAA Indoor Championships" --date "2026-02-22"

echo "[9/27] CUSA (legacy_spa)"
ingest --url "https://blueridgetiming.live/meets/60993" \
  --meet-name "2026 Conference USA Indoor Championships" --date "2026-02-22"

echo "[10/27] Horizon League (legacy_spa)"
ingest --url "https://live.deltatiming.com/meets/62071" \
  --meet-name "2026 Horizon League Indoor Championships" --date "2026-02-22"

echo "[11/27] Ivy League (legacy_spa)"
ingest --url "https://armorytrack.live/meets/58419" \
  --meet-name "2026 Ivy League Indoor Championships" --date "2026-02-22"

echo "[12/27] MAAC (legacy_spa)"
ingest --url "https://armorytrack.live/meets/54991" \
  --meet-name "2026 MAAC Indoor Championships" --date "2026-02-22"

echo "[13/27] MEAC (legacy_spa)"
ingest --url "https://blueridgetiming.live/meets/60633" \
  --meet-name "2026 MEAC Indoor Championships" --date "2026-02-24"

echo "[14/27] MWC (rtspt_html)"
ingest --url "https://www.rtspt.com/events/mw/2026-Indoor/" \
  --meet-name "2026 Mountain West Indoor Championships" --date "2026-02-27"

echo "[15/27] Patriot League (legacy_spa)"
ingest --url "https://live.athletic.net/meets/62258" \
  --meet-name "2026 Patriot League Indoor Championships" --date "2026-02-22"

echo "[16/27] SEC (flashresults)"
ingest --url "https://flashresults.com/2026_Meets/Indoor/02-26_SEC/index.htm" \
  --meet-name "2026 SEC Indoor Championships" --date "2026-02-28"

echo "[17/27] SoCon (legacy_spa)"
ingest --url "https://snapresults.snaptiming.com/meets/62366" \
  --meet-name "2026 SoCon Indoor Championships" --date "2026-02-22"

echo "[18/27] Southland (legacy_spa)"
ingest --url "https://live.xpresstiming.com/meets/62106" \
  --meet-name "2026 Southland Indoor Championships" --date "2026-02-22"

echo "[19/27] Summit League (legacy_spa)"
ingest --url "https://live.herostiming.com/meets/59935" \
  --meet-name "2026 Summit League Indoor Championships" --date "2026-02-22"

echo "[20/27] Sun Belt (legacy_spa)"
ingest --url "https://live.xpresstiming.com/meets/61288" \
  --meet-name "2026 Sun Belt Indoor Championships" --date "2026-02-27"

echo "[21/27] SWAC (legacy_spa)"
ingest --url "https://results.adkinstrak.com/meets/57061" \
  --meet-name "2026 SWAC Indoor Championships" --date "2026-02-22"

echo "[22/27] WAC (legacy_spa)"
ingest --url "https://live.athletictiming.net/meets/62104" \
  --meet-name "2026 WAC Indoor Championships" --date "2026-02-22"

echo "[23/27] MAC (fstiming — no splits, finish times only)"
ingest --url "https://live.fstiming.com/meets/62244" \
  --meet-name "2026 MAC Indoor Championships" --date "2026-02-22"

# --- pttiming (splits work — scraper uses Firebase REST API) ---

echo ""
echo "=== pttiming conferences (splits work) ==="

echo "[24/27] Big 12 (pttiming mid=8683)"
ingest --url "https://live.pttiming.com/?mid=8683" \
  --meet-name "2026 Big 12 Indoor Championships" --date "2026-02-28"

echo "[25/27] Big Ten (pttiming mid=8715)"
ingest --url "https://live.pttiming.com/?mid=8715" \
  --meet-name "2026 Big Ten Indoor Championships" --date "2026-02-28"

echo "[26/27] MVC (pttiming mid=8717)"
ingest --url "https://live.pttiming.com/?mid=8717" \
  --meet-name "2026 Missouri Valley Indoor Championships" --date "2026-03-01"

# --- milesplit_live (splits work — DOM scraper) ---

echo ""
echo "=== milesplit_live conferences (splits work) ==="

echo "[27/27] OVC (milesplit_live)"
ingest --url "https://www.milesplit.live/meets/731447/events" \
  --meet-name "2026 OVC Indoor Championships" --date "2026-02-24"

# NOTE: NEC — milesplit.live/timers/959 is a timing company page (wrong URL).
# Find the correct /meets/{id}/events URL and add it here.

echo ""
echo "=== Done! ($FAILURES failures) ==="
echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Re-run the script to retry failed conferences (cache makes completed ones instant)."
fi
echo ""
echo "NOT INGESTED (need URL research):"
echo "  - NEC: wrong URL in doc (timers/959 is timing company page, not meet)"
echo ""
echo "FINISH-TIMES ONLY (no split data in source):"
echo "  - Big South: tfmeetpro — run manually if needed"
