# PACE Demo Animations — Design Spec

**Date:** 2026-04-04  
**Goal:** 5 standalone HTML demo clips for IG reel marketing launch. Each clip plays automatically in Chrome, gets screen-recorded with QuickTime at iPhone 14 viewport (390×844), exported as .mov, imported into CapCut as overlay asset.

---

## Overview

5 separate files, each in `pace/demos/`:

| File | Feature | Duration |
|------|---------|----------|
| `demo-search.html` | Unified Search | ~8s |
| `demo-windows.html` | Window Switching | ~6s |
| `demo-chart.html` | Pace Chart + Virtual Gap | ~10s |
| `demo-custom.html` | Custom Athlete Entry | ~10s |
| `demo-theme.html` | Dark/Light Theme Toggle | ~5s |

---

## Technical Approach

**JS-scripted timeline** — each file is a self-contained HTML+CSS+JS document with no external dependencies. A JS timeline function sequences steps with `setTimeout`, using:

- **Typewriter effect**: append characters one at a time to a string, re-render
- **SVG `stroke-dashoffset` animation**: pace lines draw in from left to right
- **CSS class toggling**: active/inactive states, dropdown show/hide, modal open/close, theme switch
- **Auto-restart loop**: after the final step + a 1s pause, the animation resets and replays

**iPhone 14 frame**: each file renders at exactly 390px wide × 844px tall (the viewport). A static iPhone frame SVG wraps the app content — Dynamic Island notch, rounded corners, side buttons, black bezel. The "screen" area is the live app mockup.

**Design tokens**: all colors hardcoded from `index.css` — no Tailwind classes (standalone files, no build step).

**Font**: `'Work Sans', system-ui, sans-serif` loaded via Google Fonts `<link>` tag. Monospace values use `'JetBrains Mono', monospace`.

---

## Dark mode tokens (used in all clips except theme toggle light phase)

```
bg:           rgb(23,20,18)
card:         rgb(30,27,24)
card-inner:   rgb(37,34,32)
input:        rgb(37,34,32)
border:       rgb(42,37,32)
border-subtle:rgb(34,31,28)
text:         rgb(250,249,247)
text-secondary:rgb(168,162,158)
text-muted:   rgb(107,101,96)
accent:       rgb(234,88,12)
accent-subtle:rgb(30,21,16)
chart-grid:   rgb(42,37,32)
```

## Light mode tokens (theme toggle clip only)

```
bg:           rgb(255,255,255)
card:         rgb(255,255,255)
card-inner:   rgb(245,245,244)
input:        rgb(245,245,244)
border:       rgb(231,229,228)
text:         rgb(28,25,23)
text-secondary:rgb(120,113,108)
text-muted:   rgb(168,162,158)
accent:       rgb(194,65,12)
chart-grid:   rgb(231,229,228)
```

---

## Clip 1 — Unified Search (`demo-search.html`)

**Duration:** ~8s, loops

**Sequence:**

| Time | Action |
|------|--------|
| 0.0s | App shows PaceWindow header + filter pills (Men selected, orange) + empty rounded-full search bar, cursor blinking |
| 0.5s | Typewriter: "ingebrigtsen" at ~60ms/char |
| 1.5s | Dropdown opens: sticky "RACES" header → 2 race rows ("Big 10 Championships · Men · 1500m · 2024", "NCAA Nationals · Men · 1500m · 2024"). Sticky "ATHLETES" header → 1 row: "Jakob Ingebrigtsen · Kristiansen IL · 3:29.18 · NCAA 1500m 2024 · +" |
| 3.0s | Tap race row → dropdown closes, orange pill appears: "Big 10 Championships · Men · 1500m · 2024 ×" |
| 3.5s | Search bar clears, placeholder becomes "Search athletes in this race..." |
| 4.0s | Typewriter: "jakob" |
| 4.6s | Dropdown opens: "ATHLETES" only → "Jakob Ingebrigtsen · Kristiansen IL · 3:29.18 · +" |
| 5.5s | Tap "+" → chip appears: orange dot + "Jakob Ingebrigtsen ×". "0/6 athletes" counter updates to "1/6 athletes" |
| 6.5s | Freeze 0.5s |
| 7.0s | Fade to black → restart |

**Key UI fidelity:**
- Race pill: `bg-pace-accent-subtle` bg, `text-pace-accent` text, accent border, `border-radius: 9999px`
- Dropdown: `border-radius: 16px`, `box-shadow: 0 4px 16px rgba(0,0,0,0.3)`, `max-height: 288px`
- Athlete row: name in `text` color, team + time in `text-muted`, time in monospace, race name as accent underline link, "+" in orange pill
- Chip: `bg-card-inner`, 8px colored dot, name, `×` button

---

## Clip 2 — Window Switching (`demo-windows.html`)

**Duration:** ~6s, loops

**Sequence:**

| Time | Action |
|------|--------|
| 0.0s | W1 active (orange pill in bottom tab bar). PaceWindow shows: 2 athlete chips (Habtom Samuel orange, Marco Langon blue), pace chart with two lines drawn in |
| 1.5s | Tap W2 → W2 pill goes orange, W1 goes muted. Content cross-fades to W2: shows "Search for a race or athlete to get started" empty state |
| 3.0s | Tap W1 → W1 active, chart reappears |
| 4.5s | Tap W2 again → empty state |
| 5.5s | Fade to black → restart |

**Key UI fidelity:**
- Tab bar: `position:fixed; bottom:0`, `backdrop-filter:blur(12px)`, `background:rgba(23,20,18,0.85)`, `border-top:1px solid border-color`
- Active pill: `background:accent`, white text, `border-radius:9999px`, `padding:4px 14px`
- Inactive pill: `background:card-inner`, `text-secondary`
- Content transition: 200ms opacity fade

---

## Clip 3 — Pace Chart + Virtual Gap (`demo-chart.html`)

**Athletes:** Habtom Samuel (orange, `rgb(234,88,12)`) and Marco Langon (blue, `#3b82f6`)  
**Race:** NCAA D1 Nationals 5000m  
**Duration:** ~10s, loops

**Simulated split data (5000m, 12 laps of ~417m):**

Habtom Samuel: builds negative split — starts ~76s/lap, finishes ~70s/lap  
Marco Langon: more even, ~74s/lap throughout, fades at the end  

X axis labels: `400m 800m 1200m 1600m 2000m 2400m 2800m 3200m 3600m 4000m 4400m 5000m`  
Y axis (Lap Pace mode): formatted as `"1:16.2"` etc.

**Sequence:**

| Time | Action |
|------|--------|
| 0.0s | Chart area visible — axes showing, no lines yet. Mode buttons visible: [Virtual Gap] [Lap Pace ●] [Position] [Gain/Loss] — Lap Pace active |
| 0.5s | Orange line (Samuel) draws in left→right via stroke-dashoffset animation over 1.5s |
| 2.2s | Blue line (Langon) draws in over 1.5s |
| 4.0s | Tooltip appears at 2400m: "2400m" label, Samuel "1:14.8" (elapsed), Langon "1:15.2" |
| 5.5s | Tooltip fades. "Virtual Gap" mode button highlights → lines replot |
| 6.0s | Lines replot: Y axis switches to gap format, reference line at y=0 appears dashed. Samuel line goes negative (below 0 = ahead of even pace — he's running a negative split), Langon stays near 0 then creeps positive as he fades |
| 7.5s | Tooltip at 4000m: Samuel "-1.2s" (ahead of even pace), Langon "+0.4s" (behind even pace) |
| 9.0s | Fade to black → restart |

**Key UI fidelity:**
- Mode buttons: `border-radius:9999px overflow-hidden border`, active = `background:text-color text-bg-color`
- Y-zoom buttons: small `+` / `−` circles top-left
- Tooltip: `background:rgba(30,27,24,0.95)`, `border-radius:12px`, split label in monospace
- Reference line at y=0: `strokeDasharray:"4 4"`, muted color

---

## Clip 4 — Custom Athlete Entry (`demo-custom.html`)

**Duration:** ~10s, loops

**Sequence:**

| Time | Action |
|------|--------|
| 0.0s | PaceWindow visible with Habtom Samuel already on chart. "+ Custom" dashed button visible below search bar |
| 0.8s | Tap "+ Custom" → modal slides up (translateY animation from bottom), backdrop darkens |
| 1.2s | Modal open: header "Custom Athlete", two tabs "Pace Line" (active, orange underline) and "Manual Splits" |
| 1.8s | Typewriter in Target time field: "13:45.00" (5000m negative split target) |
| 3.5s | Splits field: "8", Strategy: "Negative Split", % field: "5" — all pre-filled in sequence |
| 4.5s | Preview table animates in: 8 rows, Lap / Elapsed columns, monospace values |
| 6.0s | Tap "Add to Window" → modal closes |
| 6.5s | New dashed line (purple `#8b5cf6`) draws onto chart |
| 7.5s | Name "13:45.00 Neg 5%" chip appears in legend at bottom |
| 9.0s | Fade to black → restart |

**Key UI fidelity:**
- Modal: `position:fixed; inset:0`, `background:rgba(0,0,0,0.4); backdrop-filter:blur(4px)`, inner card `border-radius:16px`, `max-width:448px`
- Tab underline: `border-bottom:2px solid accent`
- Preview table: `background:card-inner`, `border-radius:12px`, `font-family:monospace`
- Dashed line on chart: `strokeDasharray:"8 4"`
- "+ Custom" button: `border:1px dashed border-color`, hover → accent color

---

## Clip 5 — Theme Toggle (`demo-theme.html`)

**Duration:** ~5s, loops

**Sequence:**

| Time | Action |
|------|--------|
| 0.0s | Full app dark mode: header with PACE logo, ☽ icon button (top-right), PaceWindow with 2 athletes + chart |
| 1.5s | Tap ☽ button (hover:scale-105 micro-animation) |
| 1.7s | 300ms CSS transition: all background/border/text colors shift to light tokens. Chart grid lightens. Icon changes to ☀ |
| 2.5s | Light mode settled |
| 3.5s | Tap ☀ → 300ms transition back to dark |
| 4.5s | Freeze on dark → fade to black → restart |

**Key UI fidelity:**
- All color transitions use `transition: background-color 300ms, color 300ms, border-color 300ms`
- Chart SVG lines stay same color (orange/blue) — only the axes, grid, bg shift
- Header button: `border-radius:50%`, `border:1px solid border-color`, `hover:scale(1.05)`

---

## File Structure

```
pace/
  demos/
    demo-search.html
    demo-windows.html
    demo-chart.html
    demo-custom.html
    demo-theme.html
```

Each file is fully self-contained — no imports, no build step. Open directly in Chrome.

---

## Recording Instructions (for Nemo)

1. Open file in Chrome
2. Press `Cmd+Shift+4` → `Space` → click Chrome window to screenshot dimensions (verify 390px wide)
3. Use QuickTime → File → New Screen Recording → drag to select just the iPhone frame area
4. Record 2–3 loops minimum
5. Stop → save .mov → import to CapCut

Or: set Chrome DevTools to iPhone 14 Pro device (390×844), use QuickTime to record the window.
