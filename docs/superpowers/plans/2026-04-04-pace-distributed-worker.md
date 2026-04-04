# PACE Distributed Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the MacBook Pro as a dedicated PACE pipeline execution worker, reachable from the MBA via Tailscale SSH, with scripts synced via Syncthing, a Justfile task interface, cron scheduling, and Haiku-powered failure oversight.

**Architecture:** MBA controls and develops; MBP executes only. Scripts flow one-way MBA→MBP via Syncthing. Outputs and logs flow MBP→MBA. SSH is the trigger mechanism for ad-hoc jobs; cron handles scheduled work. A bash oversight wrapper in the Justfile routes failures through `claude -p` (Haiku) for classification and auto-retry before escalating to an incident report.

**Tech Stack:** macOS, Python 3 + venv, `just` (task runner), Syncthing, Tailscale, Claude Code CLI (Haiku oversight), cron

**Spec:** `docs/superpowers/specs/2026-04-04-pace-distributed-worker-design.md`

---

## File Map

**Created on MBA:**
- `PACE/pace/worker/justfile` — reference copy + what gets deployed to MBP
- `PACE/pace/worker/.env.worker` — credential template (blank values, safe to commit)
- `PACE/pace/worker/logs/.gitkeep` — tracked empty dir, receives synced logs from MBP
- `PACE/pace/worker/outputs/.gitkeep` — tracked empty dir, receives synced outputs from MBP

**Modified on MBA:**
- `PACE/pace/.gitignore` — add worker/logs/* and worker/outputs/* exclusions

**Created on MBP (via SSH after Tailscale):**
- `~/pace-worker/justfile` — deployed from MBA reference copy
- `~/pace-worker/.env` — deployed manually (never synced)
- `~/pace-worker/py/` — Syncthing target, receives scripts from MBA
- `~/pace-worker/logs/` — Syncthing source, pushes to MBA
- `~/pace-worker/outputs/` — Syncthing source, pushes to MBA
- `~/pace-worker/venv/` — local Python environment, never synced

---

## Phase 1 — MBA: Worker Directory + Files

### Task 1: Create worker/ folder structure on MBA

**Files:**
- Create: `PACE/pace/worker/logs/.gitkeep`
- Create: `PACE/pace/worker/outputs/.gitkeep`
- Modify: `PACE/pace/.gitignore`

- [ ] **Step 1: Verify the dirs don't exist yet**

```bash
ls PACE/pace/worker/ 2>/dev/null || echo "does not exist — good"
```
Expected: `does not exist — good`

- [ ] **Step 2: Create the directory structure**

```bash
mkdir -p PACE/pace/worker/logs PACE/pace/worker/outputs
touch PACE/pace/worker/logs/.gitkeep
touch PACE/pace/worker/outputs/.gitkeep
```

- [ ] **Step 3: Add worker log/output dirs to .gitignore**

Append to `PACE/pace/.gitignore`:
```
worker/logs/*
!worker/logs/.gitkeep
worker/outputs/*
!worker/outputs/.gitkeep
```

- [ ] **Step 4: Verify**

```bash
ls PACE/pace/worker/
```
Expected: `logs  outputs`

```bash
tail -4 PACE/pace/.gitignore
```
Expected: the four lines added above.

- [ ] **Step 5: Commit**

```bash
cd PACE/pace
git add worker/ .gitignore
git commit -m "chore: add worker/ directory structure for MBP pipeline offloading"
```

---

### Task 2: Write the reference Justfile

**Files:**
- Create: `PACE/pace/worker/justfile`

- [ ] **Step 1: Verify justfile doesn't exist yet**

```bash
ls PACE/pace/worker/justfile 2>/dev/null || echo "does not exist — good"
```

- [ ] **Step 2: Write the justfile**

Create `PACE/pace/worker/justfile` with this exact content:

```just
# pace-worker justfile
# Run from ~/pace-worker/ on the MBP worker machine.
# Requires: just, python venv at ./venv/, .env in working directory

set dotenv-load := true

py     := "./py"
py_bin := "./venv/bin/python"
out    := "./outputs"
log    := "./logs"

# ── Core targets ──────────────────────────────────────────────────────────────

# Scrape a meet URL into local JSON cache
# Usage: just scrape-meet "https://flashresults.com/..."
scrape-meet url:
    @just _run pace_scraper.py "--url '{{url}}' --outdir ./data" "scrape-meet"

# Full meet batch ingest: scrape + normalize + upload in one step
# Usage: just ingest-meet "https://flashresults.com/..." "2026 Penn Relays" "2026-04-25" outdoor "Philadelphia, PA"
ingest-meet url meet_name date season location:
    @just _run pace_ingest_meet.py "--url '{{url}}' --meet-name '{{meet_name}}' --date {{date}} --season {{season}} --location '{{location}}' --auto" "ingest-meet"

# Backfill source_url for events missing it
backfill-source-url:
    @just _run pace_backfill_source_url.py "--data-root ./data" "backfill-source-url"

# Normalize scraped JSON into canonical pace.v1 format
normalize:
    @just _run pace_normalize.py "" "normalize"

# Re-normalize all events already in DB (batch-safe, defaults to all)
renormalize-all:
    @just _run pace_renormalize_all.py "--data-root ./data" "renormalize-all"

# Upload a specific normalized JSON file to Supabase
# Usage: just upload ./data/some-event/pace_normalized.json
upload file:
    @just _run pace_upload.py "{{file}}" "upload"

# ── Compound targets ───────────────────────────────────────────────────────────

# Scrape a meet URL, then run normalize (no upload — use for staging)
scrape-and-normalize url:
    @just scrape-meet "{{url}}"
    @just normalize

# Full pipeline: ingest + normalize + upload in sequence
# Stops on first failure (correct for pipeline ordering)
full-pipeline url meet_name date season location:
    @just ingest-meet "{{url}}" "{{meet_name}}" "{{date}}" "{{season}}" "{{location}}"
    @just normalize

# ── Oversight wrapper (private) ────────────────────────────────────────────────

# All public targets route through _run. Captures stdout+stderr,
# routes failures to Haiku for classification + optional retry.
_run script args task_id:
    #!/usr/bin/env bash
    ts=$(date +%Y-%m-%d-%H%M)
    logfile="{{log}}/{{task_id}}-${ts}.log"
    mkdir -p "{{log}}" "{{out}}"

    # Run with error capture (set +e so we can inspect exit code)
    set +e
    {{py_bin}} {{py}}/{{script}} {{args}} 2>&1 | tee "$logfile"
    exit_code=${PIPESTATUS[0]}
    set -e

    if [ $exit_code -eq 0 ]; then
        echo "[OK] {{task_id}} completed at ${ts}" >> "{{log}}/run-history.log"
        exit 0
    fi

    # Failure path: route to Haiku for classification
    echo "[FAIL] {{task_id}} failed at ${ts} — routing to Haiku oversight" | tee -a "{{log}}/run-history.log"

    report_file="{{out}}/report-{{task_id}}-${ts}.md"

    claude -p --model claude-haiku-4-5-20251001 \
        "PACE pipeline task failed. Classify and respond.

Task ID: {{task_id}}
Script: {{script}}
Args: {{args}}

Log output:
$(cat "$logfile")

Instructions:
1. Classify the failure as one of: transient (network/timeout/rate-limit), fixable-args (wrong flag/bad format/missing required arg), or structural (schema mismatch/missing data/code bug).
2. If transient or fixable-args: provide a corrected shell command to retry (using python {{py}}/{{script}} with fixed args). Retry it now by outputting it as a bash command in a block starting with RETRY:.
3. If structural: write an incident report only — what failed, why, what needs human attention.
4. Always output a markdown report to document what happened and what action was taken.

Output format (markdown):
## Incident Report: {{task_id}} ${ts}
**Classification:** [transient|fixable-args|structural]
**Action taken:** [retried with X / no retry — structural failure]
**Retry command:** [command or N/A]
**Details:** [what failed and why]
**Recommendation:** [what the human should do, if anything]" \
        > "$report_file" 2>&1

    echo "[REPORT] Written to $report_file" | tee -a "{{log}}/run-history.log"
    # Exit non-zero so the caller knows the task failed (even if Haiku retried)
    exit $exit_code
```

- [ ] **Step 3: Verify the file is well-formed**

```bash
wc -l PACE/pace/worker/justfile
```
Expected: ~90 lines

- [ ] **Step 4: Commit**

```bash
cd PACE/pace
git add worker/justfile
git commit -m "chore: add justfile task interface for MBP worker"
```

---

### Task 3: Write the .env.worker template

**Files:**
- Create: `PACE/pace/worker/.env.worker`

- [ ] **Step 1: Write the template**

Create `PACE/pace/worker/.env.worker`:
```
# PACE Worker — Environment Template
# Copy to ~/pace-worker/.env on MBP and fill in real values.
# NEVER commit the real .env. This template is safe to commit.

# Supabase
SUPABASE_URL=
SUPABASE_KEY=

# Optional: override default data dir
# DATA_ROOT=./data
```

- [ ] **Step 2: Verify it's not accidentally containing real credentials**

```bash
grep -E "eyJ|https://.+\.supabase" PACE/pace/worker/.env.worker && echo "STOP — credentials found" || echo "clean — safe to commit"
```
Expected: `clean — safe to commit`

- [ ] **Step 3: Commit**

```bash
cd PACE/pace
git add worker/.env.worker
git commit -m "chore: add .env.worker template for MBP deployment"
```

---

## Phase 2 — MBP Bootstrap (Physical Access Required)

> These steps require you to be at the MBP keyboard. After Task 5, everything else is SSH from MBA.

### Task 4: Install Homebrew + prerequisites on MBP

**Where:** MBP terminal (physical access)

- [ ] **Step 1: Check if Homebrew is installed**

```bash
which brew || echo "not installed"
```

- [ ] **Step 2: Install Homebrew if missing**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Follow prompts. Takes ~5 minutes.

- [ ] **Step 3: Install just**

```bash
brew install just
just --version
```
Expected: `just X.X.X`

- [ ] **Step 4: Install Node.js (needed for Claude Code CLI)**

```bash
brew install node
node --version
npm --version
```
Expected: version strings for both.

- [ ] **Step 5: Verify Python 3 is available**

```bash
python3 --version
```
Expected: `Python 3.x.x` (macOS ships Python 3; if missing, `brew install python`)

---

### Task 5: Install and connect Tailscale on both machines

**Where:** MBP first, then verify from MBA

- [ ] **Step 1: Install Tailscale on MBP**

```bash
brew install --cask tailscale
```

- [ ] **Step 2: Start Tailscale on MBP and authenticate**

Open Tailscale from Applications (or `open -a Tailscale`). Click "Log in" — use the same account as your MBA. The MBP will appear in your Tailscale network.

- [ ] **Step 3: Set MBP hostname in Tailscale (optional but recommended)**

In Tailscale admin console (tailscale.com/admin/machines): rename the MBP to `mbp-worker`.

- [ ] **Step 4: Verify from MBA — SSH should work**

On MBA:
```bash
tailscale status | grep mbp
ssh $(tailscale ip -4 mbp-worker) "echo 'SSH working'"
```
Expected: `SSH working`

If hostname resolution doesn't work yet, use the IP directly:
```bash
tailscale ip -4 mbp-worker
# e.g. 100.x.x.x
ssh 100.x.x.x "echo 'SSH working'"
```

- [ ] **Step 5: Add mbp-worker to MBA ~/.ssh/config for convenience**

Append to `~/.ssh/config` on MBA:
```
Host mbp-worker
  HostName 100.x.x.x    # replace with actual Tailscale IP
  User ncionelo          # replace with MBP username
  IdentityFile ~/.ssh/id_ed25519
```

Verify:
```bash
ssh mbp-worker "hostname"
```
Expected: MBP's hostname string.

---

## Phase 3 — MBP Worker Environment (via SSH from MBA)

> All remaining MBP steps run from MBA via `ssh mbp-worker "..."`

### Task 6: Create ~/pace-worker/ directory structure on MBP

**Where:** MBA terminal, SSH to MBP

- [ ] **Step 1: Verify the directory doesn't exist**

```bash
ssh mbp-worker "ls ~/pace-worker 2>/dev/null || echo 'does not exist — good'"
```

- [ ] **Step 2: Create the full structure**

```bash
ssh mbp-worker "mkdir -p ~/pace-worker/{py,logs,outputs,data}"
```

- [ ] **Step 3: Verify**

```bash
ssh mbp-worker "ls ~/pace-worker/"
```
Expected: `data  logs  outputs  py`

---

### Task 7: Set up Python venv + install PACE dependencies

**Where:** MBA terminal, SSH to MBP

- [ ] **Step 1: Create venv**

```bash
ssh mbp-worker "cd ~/pace-worker && python3 -m venv venv"
```

- [ ] **Step 2: Copy requirements.txt to MBP**

```bash
scp PACE/pace/py/requirements.txt mbp-worker:~/pace-worker/requirements.txt
```

- [ ] **Step 3: Install dependencies**

```bash
ssh mbp-worker "cd ~/pace-worker && venv/bin/pip install --upgrade pip && venv/bin/pip install -r requirements.txt"
```
This takes a few minutes (Playwright + Supabase + deps).

- [ ] **Step 4: Install Playwright browser (required for scraping)**

```bash
ssh mbp-worker "cd ~/pace-worker && venv/bin/python -m playwright install chromium"
```

- [ ] **Step 5: Verify**

```bash
ssh mbp-worker "~/pace-worker/venv/bin/python -c 'import supabase, playwright, bs4; print(\"deps OK\")'"
```
Expected: `deps OK`

---

### Task 8: Deploy .env credentials to MBP

**Where:** MBA terminal

- [ ] **Step 1: Read your local .env to get the values**

```bash
cat PACE/pace/.env
```
Note the `SUPABASE_URL` and `SUPABASE_KEY` values.

- [ ] **Step 2: Create .env on MBP with real values**

```bash
ssh mbp-worker "cat > ~/pace-worker/.env << 'EOF'
SUPABASE_URL=<paste value here>
SUPABASE_KEY=<paste value here>
EOF"
```

Replace `<paste value here>` with actual values before running.

- [ ] **Step 3: Verify the file exists and is not empty**

```bash
ssh mbp-worker "wc -l ~/pace-worker/.env && echo '--- keys present:' && grep -c '=.' ~/pace-worker/.env"
```
Expected: 2 lines, 2 keys with values.

- [ ] **Step 4: Verify .env is NOT in any sync path (stays local to MBP only)**

The `~/pace-worker/.env` file is outside of any Syncthing folder. No action needed — just confirming it's correct.

---

### Task 9: Deploy justfile to MBP + verify just works

**Where:** MBA terminal

- [ ] **Step 1: Copy justfile to MBP**

```bash
scp PACE/pace/worker/justfile mbp-worker:~/pace-worker/justfile
```

- [ ] **Step 2: Verify just can parse it**

```bash
ssh mbp-worker "cd ~/pace-worker && just --list"
```
Expected: list of all public targets (scrape-meet, ingest-meet, backfill-source-url, normalize, renormalize-all, upload, scrape-and-normalize, full-pipeline)

- [ ] **Step 3: Dry-run a simple target to verify env loading**

```bash
ssh mbp-worker "cd ~/pace-worker && just --dry-run normalize"
```
Expected: prints the commands that would run, no error about missing .env or missing python.

---

### Task 10: Install and authenticate Claude Code CLI on MBP

**Where:** MBA terminal (install), then MBP physical or SSH (auth)

- [ ] **Step 1: Install Claude Code CLI on MBP**

```bash
ssh mbp-worker "npm install -g @anthropic-ai/claude-code"
```

- [ ] **Step 2: Verify it's installed**

```bash
ssh mbp-worker "claude --version"
```
Expected: version string.

- [ ] **Step 3: Authenticate (requires interactive session — do this at MBP keyboard or via SSH with TTY)**

```bash
ssh -t mbp-worker "claude"
```
Follow the browser-based auth flow. Uses same Anthropic account as MBA. Exit after auth completes (Ctrl+C).

- [ ] **Step 4: Verify non-interactive mode works (needed for justfile oversight)**

```bash
ssh mbp-worker "claude -p --model claude-haiku-4-5-20251001 'respond with: haiku online'"
```
Expected: `haiku online` (or similar short response)

---

## Phase 4 — Syncthing Setup

### Task 11: Install Syncthing on both machines

**Where:** MBA first, then MBP

- [ ] **Step 1: Install Syncthing on MBA**

```bash
brew install syncthing
brew services start syncthing
```

Verify it's running:
```bash
brew services list | grep syncthing
```
Expected: `syncthing  started`

- [ ] **Step 2: Open MBA Syncthing UI**

```bash
open http://localhost:8384
```
Note the MBA's **Device ID** (shown in Actions → Show ID). Copy it.

- [ ] **Step 3: Install Syncthing on MBP**

```bash
ssh mbp-worker "brew install syncthing && brew services start syncthing"
```

- [ ] **Step 4: Open MBP Syncthing UI via SSH tunnel**

```bash
ssh -L 8385:localhost:8384 mbp-worker -N &
open http://localhost:8385
```
Note the MBP's **Device ID**. Copy it.

- [ ] **Step 5: Add MBP as a remote device in MBA Syncthing**

In MBA Syncthing UI (localhost:8384):
- Add Remote Device → paste MBP's Device ID → name it `mbp-worker`
- Accept the connection request that appears in MBP Syncthing UI (localhost:8385)

- [ ] **Step 6: Verify both machines see each other as connected**

In both UIs: Remote Devices should show the other machine as "Connected".

---

### Task 12: Configure the three Syncthing folder pairs

**Where:** Syncthing web UI on both machines

> Three folders. Each has a direction: MBA→MBP (send only) or MBP→MBA (receive only).

- [ ] **Step 1: Configure py/ sync — MBA sends, MBP receives**

In MBA Syncthing UI:
- Add Folder → Folder Label: `pace-py` → Folder Path: `/Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/py`
- Sharing tab → share with `mbp-worker`
- Advanced tab → Folder Type: **Send Only**
- Save

In MBP Syncthing UI (via tunnel on localhost:8385):
- Accept the folder share from MBA
- Set local path: `/Users/YOUR_MBP_USER/pace-worker/py` (run `whoami` on MBP to confirm username)
- Advanced tab → Folder Type: **Receive Only**
- Save

- [ ] **Step 2: Verify py/ sync works**

```bash
ssh mbp-worker "ls ~/pace-worker/py/ | head -5"
```
Expected: PACE python scripts (pace_scraper.py, pace_upload.py, etc.) should appear within ~30 seconds.

- [ ] **Step 3: Configure logs/ sync — MBP sends, MBA receives**

In MBP Syncthing UI:
- Add Folder → Label: `pace-logs` → Path: `/Users/YOUR_MBP_USER/pace-worker/logs`
- Share with MBA device
- Folder Type: **Send Only**
- Save

In MBA Syncthing UI:
- Accept → local path: `/Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/worker/logs`
- Folder Type: **Receive Only**
- Save

- [ ] **Step 4: Configure outputs/ sync — MBP sends, MBA receives**

Same as Step 3 but:
- MBP path: `/Users/YOUR_MBP_USER/pace-worker/outputs`
- MBA path: `/Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/worker/outputs`

- [ ] **Step 5: Add Syncthing ignore rules for py/ folder on MBA**

In MBA Syncthing UI, edit the `pace-py` folder → Ignore Patterns:
```
.gitignore
__pycache__
*.pyc
data
```

- [ ] **Step 6: Final sync verification**

```bash
# Write a test file on MBA
echo "sync test $(date)" > PACE/pace/py/_sync_test.txt

# Wait ~5 seconds, then check MBP received it
sleep 5
ssh mbp-worker "cat ~/pace-worker/py/_sync_test.txt"

# Clean up
rm PACE/pace/py/_sync_test.txt
```
Expected: the test content appears on MBP. Then clean up:
```bash
ssh mbp-worker "rm ~/pace-worker/py/_sync_test.txt"
```

---

## Phase 5 — Scheduling + Keep-Alive

### Task 13: Configure cron + prevent MBP sleep

**Where:** MBA terminal, SSH to MBP

- [ ] **Step 1: Disable sleep on MBP (keep it always-on as a worker)**

On MBP (run from SSH or physically):
```bash
ssh mbp-worker "sudo systemsetup -setcomputersleep Never && sudo systemsetup -setdisplaysleep 10"
```
This prevents the CPU from sleeping (required for cron jobs to fire) while still letting the display sleep.

Verify:
```bash
ssh mbp-worker "sudo systemsetup -getcomputersleep"
```
Expected: `Computer Sleep: Never`

- [ ] **Step 2: Get MBP username and just path for cron**

```bash
MBP_USER=$(ssh mbp-worker "whoami")
JUST_PATH=$(ssh mbp-worker "which just")
echo "User: $MBP_USER  just: $JUST_PATH"
```
Expected: e.g. `User: nemo  just: /usr/local/bin/just` (Intel MBP uses `/usr/local`, not `/opt/homebrew`)

- [ ] **Step 3: Set up cron jobs on MBP**

```bash
ssh -t mbp-worker "crontab -e"
```

Add these lines (substitute the actual values from Step 2):
```cron
# PACE Worker — Nightly backfill (2AM)
0 2 * * * cd /Users/YOUR_MBP_USER/pace-worker && /usr/local/bin/just backfill-source-url >> /Users/YOUR_MBP_USER/pace-worker/logs/cron.log 2>&1

# PACE Worker — Weekly renormalize (Sunday 3AM)
0 3 * * 0 cd /Users/YOUR_MBP_USER/pace-worker && /usr/local/bin/just renormalize-all >> /Users/YOUR_MBP_USER/pace-worker/logs/cron.log 2>&1
```

- [ ] **Step 3: Verify cron is loaded**

```bash
ssh mbp-worker "crontab -l"
```
Expected: the two entries above.

---

## Phase 6 — End-to-End Verification

### Task 14: SSH trigger test — run a real script

**Where:** MBA terminal

- [ ] **Step 1: Run normalize via SSH (use --dry-run equivalent or a safe script)**

Since `pace_renormalize_all.py` has `--dry-run`, use it as a safe first test:

```bash
ssh mbp-worker "cd ~/pace-worker && just _run pace_renormalize_all.py '--data-root ./data --dry-run' 'verify-dryrun'"
```
Expected: script runs, exits 0, log file written to MBP `~/pace-worker/logs/`.

- [ ] **Step 2: Verify log synced to MBA**

```bash
# Wait for Syncthing (usually < 5 seconds)
sleep 5
ls PACE/pace/worker/logs/
```
Expected: `verify-dryrun-YYYY-MM-DD-HHMM.log` appears.

```bash
cat PACE/pace/worker/logs/verify-dryrun-*.log
```
Expected: dry-run output from the script.

---

### Task 15: Failure + Haiku oversight test

**Where:** MBA terminal

This test deliberately triggers a failure to verify the oversight wrapper works.

- [ ] **Step 1: Trigger a failure with a bad arg**

```bash
ssh mbp-worker "cd ~/pace-worker && just _run pace_upload.py '--invalid-flag-that-does-not-exist' 'oversight-test'"
```
Expected: script fails, `_run` detects non-zero exit, Haiku produces a report.

- [ ] **Step 2: Wait for report to sync to MBA**

```bash
sleep 10
ls PACE/pace/worker/outputs/
```
Expected: `report-oversight-test-YYYY-MM-DD-HHMM.md` appears.

- [ ] **Step 3: Read the incident report**

```bash
cat PACE/pace/worker/outputs/report-oversight-test-*.md
```
Expected: markdown report with classification (likely `fixable-args` or `structural`), action taken, and recommendation.

- [ ] **Step 4: Clean up test artifacts**

```bash
rm PACE/pace/worker/outputs/report-oversight-test-*.md
rm PACE/pace/worker/logs/oversight-test-*.log 2>/dev/null || true
ssh mbp-worker "rm ~/pace-worker/outputs/report-oversight-test-*.md ~/pace-worker/logs/oversight-test-*.log 2>/dev/null || true"
```

---

### Task 16: Commit final state + update run history

**Where:** MBA terminal

- [ ] **Step 1: Verify worker/ contents on MBA are clean**

```bash
cd PACE/pace && git status worker/
```
Expected: only `.gitkeep` files tracked; no logs, outputs, or .env files.

- [ ] **Step 2: Final commit**

```bash
cd PACE/pace
git add worker/
git commit -m "chore: worker/ verified — distributed MBP pipeline setup complete"
```

- [ ] **Step 3: Copy updated justfile back to MBP-harness reference**

```bash
cp PACE/pace/worker/justfile /Users/ncionelo/Downloads/JOBS/PROJECTS/MBP-harness/distr-worker-sys/justfile
```

---

## Reference: SSH Quick Commands (post-setup)

```bash
# Ad-hoc: ingest a meet
ssh mbp-worker "cd ~/pace-worker && just ingest-meet 'https://flashresults.com/...' 'Penn Relays' '2026-04-25' outdoor 'Philadelphia, PA'"

# Ad-hoc: backfill source URLs
ssh mbp-worker "cd ~/pace-worker && just backfill-source-url"

# Check recent logs from MBA
ls -lt PACE/pace/worker/logs/ | head -10

# Check for any incident reports
ls PACE/pace/worker/outputs/*.md 2>/dev/null && echo "reports present" || echo "no reports"

# Update justfile on MBP after changes
scp PACE/pace/worker/justfile mbp-worker:~/pace-worker/justfile
```
