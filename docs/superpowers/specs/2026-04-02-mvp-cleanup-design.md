# PACE MVP Cleanup — Design Spec

**Date:** 2026-04-02
**Goal:** Clean, polished MVP ready for IG advertisement push. Ground-up fixes, no bandaids.
**Approach:** Data-first (Phase 1), then UI overhaul (Phase 2). Patriot League investigation runs as a separate parallel session.

---

## Phase 1: Data Normalization & Schema

### 1a. Conferences table + alias system

New tables:

```sql
conferences (
  id          uuid PK,
  name        text NOT NULL,       -- canonical: "Big 12"
  short_name  text,                -- "B12" (nullable)
  division    text NOT NULL         -- "D1", "D2", "D3"
)

conference_aliases (
  id            uuid PK,
  conference_id uuid FK → conferences,
  alias         text UNIQUE         -- "Big XII", "Big 12", "Big Twelve"
)
```

- `events` gets a `conference_id` FK referencing `conferences`.
- Backfill migration maps existing event names to conferences via pattern matching (similar to division migration 004).
- The unified search bar queries `conference_aliases` so "SEC", "Southeastern Conference", or "Southeastern" all resolve to the same conference.

### 1b. Distance normalization

| Raw value | Normalized | Season |
|-----------|-----------|--------|
| "5000", "5,000" | "5000m" | indoor/outdoor |
| "10000", "10,000" | "10,000m" | indoor/outdoor |
| "5K", "5k" | "5K" | xc |
| "8K", "8k" | "8K" | xc |
| "10K", "10k" | "10K" | xc |
| "mile", "Mile", "MILE" | "Mile" | indoor/outdoor |
| "800", "800m" | "800m" | indoor/outdoor |
| "1500", "1500m" | "1500m" | indoor/outdoor |
| "3000", "3000m" | "3000m" | indoor |

Key distinction: **5K/8K/10K = XC races. 5000m/10,000m = Track (indoor or outdoor).** These are not interchangeable.

Applied via migration + ingestion pipeline guardrails.

### 1c. Purge out-of-scope events

**Allowed distances:** 800m, 1500m, Mile, 3000m, 5000m, 10,000m, 5K, 8K, 10K, DMR, 4xMile.

Relay distances stored as-is ("DMR", "4xMile") — no meter conversion. These are recognized event labels.

Everything else (600y, 400m, 200m, 60m, etc.) gets deleted from the DB. Ingestion pipeline must reject out-of-scope distances going forward.

### 1d. Name normalization

- **Athlete last names:** ALL CAPS → Title Case ("SMITH" → "Smith"). Applied via SQL `initcap()` migration + ingestion pipeline normalization.
- **Event names:** Normalize inconsistent whitespace (double spaces, leading/trailing). No structural changes to event name format — the condensed display format (1f) handles readability at the UI layer.

### 1e. Race list sorting

Events sorted by: **date DESC → conference name → gender → distance**.
Logical grouping so users scan quickly instead of reading every line.

### 1f. Race result display format (condensed)

Current verbose format:
> `1:23.19 · 2026 Big 12 Indoor Championships Women 600y Section 1 · 2026-02-28`

Condensed to:
> `Big 12 Indoor · W 800m · Feb 28, 2026`

Conference + season, gender shorthand (M/W), normalized distance, human-readable date.

---

## Phase 2: UI Overhaul

### 2a. Unified smart search bar

Single input per PaceWindow. Searches races and athletes simultaneously. Results grouped in dropdown:

```
┌─────────────────────────────────────┐
│ 🔍  "big 12 800"                    │
├─────────────────────────────────────┤
│ RACES                               │
│  Big 12 Indoor · W 800m · 2026-02-28│
│  Big 12 Indoor · M 800m · 2026-02-28│
├─────────────────────────────────────┤
│ ATHLETES                            │
│  Jane Smith · Houston · 2:04.31     │
│  Maria Lopez · Kansas · 2:05.88     │
└─────────────────────────────────────┘
```

**Behavior:**
- Query hits `conference_aliases`, `events.name`, `events.distance`, and `athletes.name` simultaneously.
- Selecting a **Race** scopes subsequent athlete results to that event (race chip appears above the bar, removable via X).
- Selecting an **Athlete** adds them directly to the window. If no race is selected, athlete results show their most recent race context (event name, time, date) so the user knows what they're adding.
- Gender/Division/Year filters remain as compact pill toggles above the search bar.
- Debounce at 300ms.

### 2b. Clickable race names → source URL

Wherever a race name appears (search results, legend tooltip, athlete detail), if `source_url` exists, it renders as a clickable link opening in a new tab. Subtle external-link icon indicator.

### 2c. Custom athlete/splits entry

"+ Custom" button opens a modal with two tabs:

**Tab 1 — Manual Splits:**
- Name (required), optional race selector for comparison context.
- Dynamic split rows: distance label + elapsed time. Auto-calculates lap splits.

**Tab 2 — Pace Line Generator:**
- Target finish time, distance (auto-filled from window), split strategy (Even / Negative / Positive with customizable %).
- Generates and previews splits automatically.

**Display:**
- Custom athletes render with **dashed lines** (vs solid for real data).
- Pace lines labeled in legend (e.g., "4:00 Even").
- Client-side only (Zustand store) — no DB writes. Ephemeral to session.

### 2d. Window capacity

**10 athletes max per window** (up from 5). Requires expanding the color palette from 5 to 10 distinct, high-contrast colors that work on both light and dark themes.

### 2e. Light mode + theme toggle

- **Light mode default** on first visit. Preference saved to `localStorage`.
- Toggle in header (sun/moon icon).
- Clean white/warm gray base with strong contrast. Bold accent colors.
- Dark theme (current zinc-950) preserved as toggle option.
- 10 athlete line colors remain consistent across themes.
- Chart grid lines, axis labels, tooltip backgrounds adapt per theme via CSS custom properties.

### 2f. Mobile experience

**Breakpoints:**

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 640px | Single window, tab bar to switch |
| Tablet | 640–1024px | 1–2 columns |
| Desktop | > 1024px | 1–3 columns (current) |

**Mobile UX:**
- **Window switching:** Bottom tab bar (W1, W2, W3…). Swipe or tap. One window visible at a time.
- **Search:** Full-width. Filter pills collapse into a "Filters" button → slide-up sheet.
- **Chart:** Full-width, taller ratio. Zoom buttons repositioned for touch. Mode toggles as horizontal scroll strip.
- **Legend:** Chips wrap below chart. 5 visible, "+N more" expandable row for overflow.
- **Custom entry modal:** Full-screen bottom sheet on mobile.

**Performance (iPhone 13 Mini floor):**
- Virtualize search result lists.
- Lazy-load charts (only render active/visible window).
- Debounce resize events.
- Opacity fades over transform animations.
- JS bundle target: < 200KB gzipped.

**Standard screen sizes to build for:**

| Device | Width |
|---|---|
| iPhone SE | 375px |
| iPhone 13 Mini | 390px |
| Standard (14/15) | 393px |
| Pro Max | 430px |
| Tablet | 768px |
| Desktop | 1024px+ |

### 2g. Frontend design direction

**Brand energy:** Collegiate running culture. Inspired by Nike track posters, On Running's editorial style, race-day broadcast graphics, conference championship energy.

**Typography:** Bold athletic sans-serif for headings (Oswald, Bebas Neue, or Inter Black). Clean readable body font. Authoritative, not playful.

**Motion:** Purposeful micro-interactions — chart lines drawing in, search results sliding into place. Nothing gratuitous. Speed and precision.

**Color philosophy:** 10 athlete line colors are the heroes. Chrome (backgrounds, borders, nav) stays minimal so data pops. The chart is the track — everything else is stadium infrastructure.

**Texture:** Subtle track-inspired details — lane-line motifs, split markers echoing lap counters. Suggestive, not literal.

**Tone:** Serious tool for people who care about splits. Confident, not flashy.

**Process:** `frontend-design` and `ui-ux-pro-max` skills generate concrete mockup concepts for: (1) search + window layout (desktop), (2) mobile layout + tab switching, (3) chart + legend styling, (4) light/dark color systems, (5) 10-color athlete palette. Each concept presented to user for approval before code.

---

## Out of Scope

- Patriot League investigation + reingestion (separate parallel session)
- New data ingestion beyond cleanup of existing data
- User accounts / authentication
- Backend API (direct Supabase client remains)
