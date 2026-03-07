# Vercel Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get the PACE frontend live on Vercel with a public URL, connected to the existing Supabase backend.

**Architecture:** The frontend (`apps/web/`) is a Vite SPA that reads directly from Supabase via the anon key — no server needed. Deploy is: push repo to GitHub → connect Vercel → set 2 env vars → done. The Python ingestion scripts stay local; they are never deployed.

**Tech Stack:** Vite, Vercel CLI, GitHub (`gh` CLI), Supabase (already hosted)

---

## Pre-flight checks (do these before the tasks)

1. `.env.local` is already in `.gitignore` — confirmed safe.
2. `vite.config.ts` has no hardcoded `base` — confirmed, Vercel will work without changes.
3. No GitHub remote exists yet — Task 1 creates it.

---

## Task 1: Push to GitHub

**Step 1: Check for uncommitted changes**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git status
```

If there are uncommitted changes, commit them first:
```bash
git add -A
git commit -m "chore: pre-deploy cleanup"
```

**Step 2: Create GitHub repo and push**

If you have the `gh` CLI installed:
```bash
gh repo create pace --public --source=. --remote=origin --push
```

This creates a public repo named `pace` under your GitHub account, sets it as `origin`, and pushes all commits.

If you don't have `gh` CLI:
1. Go to github.com → New repository → name it `pace` → public → **do not** initialize with README → Create
2. Then run:
```bash
git remote add origin https://github.com/YOUR_USERNAME/pace.git
git push -u origin main
```

**Step 3: Verify**

```bash
git remote -v
```
Expected output:
```
origin  https://github.com/YOUR_USERNAME/pace.git (fetch)
origin  https://github.com/YOUR_USERNAME/pace.git (push)
```

Open `https://github.com/YOUR_USERNAME/pace` in browser — confirm all files are there. Confirm `.env.local` is NOT listed (it's gitignored).

---

## Task 2: Deploy to Vercel

**Step 1: Install Vercel CLI (if not already installed)**

```bash
npm install -g vercel
```

Verify:
```bash
vercel --version
```
Expected: prints a version number like `33.x.x`

**Step 2: Run vercel from apps/web**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
vercel
```

You'll be prompted interactively. Answer as follows:

| Prompt | Answer |
|---|---|
| Set up and deploy? | `Y` |
| Which scope? | Your personal account |
| Link to existing project? | `N` |
| Project name? | `pace` (or `pace-app`, your choice) |
| In which directory is your code? | `.` (current dir — already in apps/web) |
| Want to override the settings? | `N` |

Vercel auto-detects Vite and sets build command `vite build`, output dir `dist`. No overrides needed.

**Step 3: Note the preview URL**

After deploy, Vercel prints a URL like `https://pace-abc123.vercel.app`. Open it in browser. It will load but show an error (Supabase connection fails because env vars aren't set yet). That's expected — fix in next step.

---

## Task 3: Set Environment Variables

**Step 1: Add Supabase env vars**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
vercel env add VITE_SUPABASE_URL
```
When prompted for value, paste:
```
https://zlvtnrtkqfhkjimbpkmp.supabase.co
```
When asked which environments, select all three: `Production`, `Preview`, `Development`.

```bash
vercel env add VITE_SUPABASE_ANON_KEY
```
When prompted for value, paste the anon key from your local `.env.local` file (the long `eyJ...` string).
Select all three environments again.

**Step 2: Redeploy to apply env vars**

Env vars only take effect on a fresh build:
```bash
vercel --prod
```

This triggers a production deployment (not just a preview). Wait for it to complete (~30–60 seconds).

**Step 3: Smoke test the live URL**

Vercel prints your production URL: `https://pace-YOUR_PROJECT_NAME.vercel.app`

Open it. Verify:
- [ ] App loads (no blank screen, no console errors about missing env vars)
- [ ] Fish favicon appears in browser tab
- [ ] Header shows: fish logo · PACE · built by itsnemo.dev · ♥ · ✉ · + New Window
- [ ] Click "+ New Window" → PaceWindow appears
- [ ] Select a distance (e.g. 5000m) → event dropdown populates from Supabase
- [ ] Search an athlete name → results appear, sorted fastest first
- [ ] Toggle M/W → results immediately filter

---

## Task 4: Connect GitHub for Auto-Deploy (optional but recommended)

This makes every push to `main` automatically redeploy — no manual `vercel --prod` needed.

**Step 1: Link GitHub repo in Vercel dashboard**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click your `pace` project
3. Settings → Git → Connect Git Repository → select `YOUR_USERNAME/pace`
4. Set **Root Directory** to `apps/web`
5. Save

**Step 2: Verify**

Make a trivial commit and push:
```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git commit --allow-empty -m "chore: trigger vercel deploy test"
git push
```

Go to Vercel dashboard → Deployments tab. A new deployment should appear within seconds and complete in ~1 minute.

---

## Future: Custom Domain

If you want `pace.itsnemo.dev` or similar:
1. Vercel dashboard → your project → Settings → Domains → Add Domain
2. Enter `pace.itsnemo.dev`
3. Vercel gives you a CNAME record to add in your DNS provider
4. Once DNS propagates (~5 min for Cloudflare, up to 24h otherwise), HTTPS is automatic

---

## Future: Fix Supabase Inactivity Pause

Supabase free tier pauses after 1 week of zero traffic. To prevent:
1. Create free account at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: HTTP(s) ping to your Vercel URL every 5 minutes
3. Done — Supabase stays warm

---

## Notes

- **Ko-fi URL**: once your Ko-fi account is live, update the one string `https://ko-fi.com/PLACEHOLDER` in `apps/web/src/components/Header.tsx`, push to `main`, and Vercel auto-redeploys.
- **Formspree**: set `VITE_FORMSPREE_ID=xxxxxxxx` via `vercel env add VITE_FORMSPREE_ID` once your Formspree form is created.
- **Python scripts are never deployed** — they run locally only. Vercel only builds `apps/web/`.
- **Supabase anon key** is safe to expose in the browser — it's read-only and designed for public use. Supabase RLS enforces access control.
