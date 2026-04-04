# Design: PACE Distributed Worker (MBA → MBP)
**2026-04-04**

## Goal

Offload PACE pipeline execution (scraping, backfills, normalization, Supabase uploads) from the MBA dev machine to the MBP worker machine. Keep the MBA as a clean development environment — no heavy jobs, no duplicate toolchain.

---

## Machines

| Machine | Role | Specs |
|---------|------|-------|
| MacBook Air M1 8GB | Control layer — dev, Claude Code, triggering | Primary dev machine |
| MacBook Pro i9 16GB | Execution layer — runs pipelines, always-on | Worker, macOS side only |

Future: gaming PC (i5 16GB, 2016) slots in as a second worker using the same pattern.

---

## Architecture

### Networking — Tailscale
- Private mesh VPN between devices
- MBP reachable as `mbp-worker` (or configured hostname) from anywhere
- No port forwarding, no dynamic IPs
- Used for: SSH task triggering, ad-hoc debugging

### Data Sync — Syncthing
Three folders with explicit one-way directions:

| Folder | Direction | Purpose |
|--------|-----------|---------|
| `PACE/pace/py/` → `~/pace-worker/py/` | MBA → MBP (send only) | Script delivery |
| `~/pace-worker/logs/` → `PACE/pace/worker/logs/` | MBP → MBA (receive only) | Log visibility |
| `~/pace-worker/outputs/` → `PACE/pace/worker/outputs/` | MBP → MBA (receive only) | Results + incident reports |

**Never synced:** `.env`, `venv/`, `justfile` — deployed once manually or local-only.

**Excluded from `py/` sync:** `.gitignore`, `__pycache__/`, `*.pyc`, `data/`

### Task Interface — Justfile
Deployed once to MBP via SSH. Never synced. Provides named targets that wrap every script execution in an oversight layer. Lives at `~/pace-worker/justfile`.

### Scheduling — Cron (launchd)
Recurring jobs defined as cron entries on MBP. Call the same `just` targets as manual SSH — one interface for both.

### AI Oversight — Haiku on MBP
Every task failure is routed through `claude -p --model claude-haiku-4-5-20251001`. Haiku classifies the failure and takes one of three actions:

| Classification | Action |
|----------------|--------|
| Transient (network, timeout, rate limit) | Retry once with backoff |
| Fixable args (wrong flag, bad date format) | Adjust args, retry once |
| Structural (schema mismatch, missing data) | Write incident report, no retry |

On auto-recovery: logs what changed. On escalation: writes `outputs/report-{task}-{date}.md`, synced to MBA. Claude on MBP is **read-only** — it audits and reports, never edits scripts. Any real fix goes through MBA → Syncthing.

---

## Folder Structure

**MBA (source of truth):**
```
PACE/pace/
  py/                        ← synced to MBP (scripts)
  worker/
    justfile                 ← template/reference (real one deployed to MBP)
    .env.worker              ← template only, never synced
    logs/                    ← synced FROM MBP
    outputs/                 ← synced FROM MBP (results + incident reports)
  docs/superpowers/specs/    ← this file
```

**MBP (execution only):**
```
~/pace-worker/
  py/                        ← Syncthing target (receives scripts from MBA)
  venv/                      ← local, never synced
  justfile                   ← deployed once via SSH
  .env                       ← deployed once via SSH, never synced
  logs/                      ← Syncthing source
  outputs/                   ← Syncthing source
```

---

## Justfile (MBP)

```just
set dotenv-load := true

py := "./py"
out := "./outputs"
log := "./logs"

# Core targets
scrape-meet meet_id:
    @just _run pace_scraper.py "--meet-id {{meet_id}}" "scrape-{{meet_id}}"

ingest-meet meet_id:
    @just _run pace_ingest_meet.py "--meet-id {{meet_id}}" "ingest-{{meet_id}}"

backfill-source-url:
    @just _run pace_backfill_source_url.py "" "backfill-source-url"

normalize:
    @just _run pace_normalize.py "" "normalize"

renormalize-all:
    @just _run pace_renormalize_all.py "" "renormalize-all"

upload file:
    @just _run pace_upload.py "--file {{file}}" "upload-{{file}}"

# Compound targets
scrape-and-ingest meet_id:
    @just scrape-meet {{meet_id}}
    @just ingest-meet {{meet_id}}

full-pipeline meet_id:
    @just scrape-meet {{meet_id}}
    @just ingest-meet {{meet_id}}
    @just normalize

# Oversight wrapper (private)
_run script args task_id:
    #!/usr/bin/env bash
    set -e
    ts=$(date +%Y-%m-%d-%H%M)
    logfile="{{log}}/{{task_id}}-${ts}.log"

    python {{py}}/{{script}} {{args}} 2>&1 | tee "$logfile"
    exit_code=${PIPESTATUS[0]}

    if [ $exit_code -ne 0 ]; then
        claude -p --model claude-haiku-4-5-20251001 \
            "Task {{task_id}} failed. Script: {{script}}. Args: {{args}}.
             Log: $(cat $logfile)
             Classify failure: transient/fixable-args/structural.
             If transient or fixable-args: suggest corrected command and retry once.
             If structural: write incident report only.
             Output JSON: classification, action_taken, retry_command (if any), report." \
            > "{{out}}/report-{{task_id}}-${ts}.md"
    fi
```

---

## Cron (MBP)

```cron
# Nightly backfill — 2AM
0 2 * * * cd ~/pace-worker && just backfill-source-url

# Weekly renormalize — Sunday 3AM
0 3 * * 0 cd ~/pace-worker && just renormalize-all
```

---

## Claude Code Integration (MBA)

Triggering a job from Claude Code:
```bash
# Non-blocking (fire and forget)
ssh mbp-worker "cd ~/pace-worker && just scrape-and-ingest 2026-penn-relays" &

# Blocking (wait for result)
ssh mbp-worker "cd ~/pace-worker && just normalize"
```

Checking results after a job:
- Logs: `PACE/pace/worker/logs/`
- Incident reports: `PACE/pace/worker/outputs/`
- Claude reads these directly — Syncthing delivers them within seconds of job completion

Typical Claude Code session flow:
1. Trigger job via SSH Bash call
2. Wait for Syncthing sync (seconds to minutes depending on job length)
3. Read log/output files
4. Summarize results, flag anything needing attention

Script updates flow automatically: edit on MBA → Syncthing delivers to MBP → next `just` call uses updated script. No manual deploy.

---

## Key Constraints

- MBP runs no dev toolchain (no git, no editor, no Claude Code for dev)
- Claude Code CLI on MBP is oversight only — read logs, write reports, never edit scripts
- `.env` never leaves either machine via sync — credentials are manually deployed
- One retry max on auto-recovery — no loops
- All fixes go through MBA → Syncthing path

---

## Non-Goals

- File-based task watcher/daemon (added complexity, process management overhead)
- Syncing entire repo or `venv/`
- Real-time coordination via Syncthing (outputs only, not queues)
- Running heavy jobs on MBA
- Using this for anything other than PACE pipeline currently (OpenClaw/local LLM deferred)

---

## Adding a Third Worker (Gaming PC — Future)

Same pattern: install Tailscale, install Python + venv, copy `.env`, configure Syncthing folder pair, deploy Justfile. Gaming PC gets a different Tailscale hostname (e.g., `pc-worker`). No architectural changes needed.
