# PACE — Workflow Log

## Last Session
**Checkpoint:** `~/.claude/checkpoints/checkpoint-2026-04-08-1444.md`

### What was done
- Added `computeSplitPoints()` to `apps/web/src/stores/custom-athlete-store.ts`
- Replaced Manual Splits tab with **Custom Splits** (coach-oriented) in `apps/web/src/components/CustomAthleteModal.tsx`
  - Pick race distance (presets: 800m / 1500m / Mile / 3000m / 5000m / 10K, or custom)
  - Split points auto-generate at 400m intervals; remainder last split (e.g. 300m at 1500m)
  - User enters **lap time** per point; elapsed auto-computes live
  - Total time shown once all laps filled
- Pace Line tab unchanged; tab order: Custom Splits (default) → Pace Line
