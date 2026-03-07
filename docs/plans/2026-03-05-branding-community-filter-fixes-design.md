# Branding, Community Hub & Filter Fixes — Design Doc

**Date:** 2026-03-05

---

## Goal

Three independent workstreams delivered in one batch:

1. **Branding** — fish logo (nemo-favicon-1.png) in header + favicon; "built by itsnemo.dev" attribution
2. **Community hub** — two header icon buttons: Ko-fi support link + contact modal (bug reports, race requests, feature requests) via Formspree
3. **Search/filter fixes** — gender filter immediately filters athlete results; sort results fastest-first; descriptive empty-state message when name search returns no results for a distance

---

## Architecture

All changes are front-end only. No DB schema changes. No new routes.

```
apps/web/
  public/
    favicon.png              ← copied from nemo-favicon-1.png (Agent A)
  index.html                 ← favicon link updated (Agent A)
  src/
    components/
      Header.tsx             ← logo, attribution, Ko-fi icon, contact icon, ContactModal (Step 4)
      ContactModal.tsx       ← new — Formspree form (Agent B)
    lib/
      db.ts                  ← gender filter + sort order in searchAthletes (Agent C)
    components/
      AthleteSearch.tsx      ← pass gender to query, descriptive empty state (Agent C)
  .env.local                 ← add VITE_FORMSPREE_ID placeholder (Agent B)
```

---

## Parallel Execution Plan

```
Batch 1 — run 3 agents simultaneously (zero shared files):
  Agent A  →  favicon.png + index.html
  Agent B  →  ContactModal.tsx (new) + .env.local placeholder
  Agent C  →  db.ts + AthleteSearch.tsx

Step 4 (sequential, after batch) → Header.tsx integrates everything
```

---

## Agent A — Favicon

**Files:**
- Create: `apps/web/public/favicon.png` (copy of nemo-favicon-1.png)
- Modify: `apps/web/index.html`

**Source image path:**
```
/Users/ncionelo/Downloads/business card website itsnemo.dev/itsnemo.dev work site/logos/nemo-favicon-1.png
```

**index.html change:**
Replace existing `<link rel="icon" ...>` with:
```html
<link rel="icon" type="image/png" href="/favicon.png" />
```

---

## Agent B — ContactModal

**Files:**
- Create: `apps/web/src/components/ContactModal.tsx`
- Modify: `apps/web/.env.local` (add placeholder line)

### Form fields

| Field | Type | Required | Visibility |
|---|---|---|---|
| `type` | `<select>` | yes | always |
| `description` | `<textarea>` | yes | always |
| `url` | `<input type="url">` | no | only when type = "Race Request" |
| `email` | `<input type="email">` | no | always |

**Type options:** `Bug Report` | `Race Request` | `Feature Request`

**Description label per type:**
- Bug Report → "What went wrong? Include athlete/race name if applicable."
- Race Request → "Which race should be added? Any context about conference/season?"
- Feature Request → "Describe the feature."

### Submission

```
POST https://formspree.io/f/${import.meta.env.VITE_FORMSPREE_ID}
Content-Type: application/json
Body: { type, description, url?, email? }
```

**States:** `idle` → `submitting` (button disabled, "Sending…") → `success` ("Thanks! We'll review your submission.") → `error` ("Something went wrong. Please try again.")

Success state shows a close button. Error state shows a retry button that resets to idle.

### .env.local placeholder

Add this comment block (do NOT overwrite existing env vars):
```
# Community hub — Formspree form ID
# 1. Create free account at https://formspree.io
# 2. Create a new form, copy the 8-char form ID
# 3. Set it here: VITE_FORMSPREE_ID=xxxxxxxx
# Future: migrate to Notion DB via MCP
# VITE_FORMSPREE_ID=
```

### ContactModal props

```tsx
interface ContactModalProps {
  open: boolean;
  onClose: () => void;
}
```

Modal renders `null` when `open === false`. Overlay click closes the modal (calls `onClose`). Escape key closes the modal.

### Styling

Consistent with app's zinc palette:
- Overlay: `fixed inset-0 bg-black/60 z-50 flex items-center justify-center`
- Panel: `bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md mx-4`
- Inputs/selects/textarea: `bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full`
- Submit button: `bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-40`
- Close (X) button top-right: `text-zinc-400 hover:text-zinc-200`

---

## Agent C — Filter & Search Fixes

**Files:**
- Modify: `apps/web/src/lib/db.ts`
- Modify: `apps/web/src/components/AthleteSearch.tsx`

### Fix 1 — Gender filter (db.ts:45-86)

Add `gender` to `AthleteSearchFilters`:
```ts
interface AthleteSearchFilters {
  eventId?: string;
  teamName?: string;
  distance?: string;
  gender?: string;   // ← add
}
```

In `searchAthletes`, after the `distance` filter:
```ts
if (filters?.gender) dbQuery = dbQuery.eq("event.gender", filters.gender);
```

### Fix 2 — Sort fastest first (db.ts:63)

Change:
```ts
.order("place", { ascending: true })
```
To:
```ts
.order("time_s", { ascending: true, nullsFirst: false })
```

`time_s` is a numeric seconds value; nulls-last ensures athletes with no recorded time appear at the bottom rather than the top.

### Fix 3 — Gender passed from AthleteSearch (AthleteSearch.tsx:50-67)

In the `doSearch` callback, update the `searchAthletes` call:
```ts
const data = await searchAthletes(nameQuery, {
  eventId: selectedEventId || undefined,
  distance,
  gender: genderFilter || undefined,   // ← add
});
```

### Fix 4 — Descriptive empty state (AthleteSearch.tsx:191-193)

Replace:
```tsx
{!loading && results.length === 0 && (
  <p className="text-xs text-zinc-500 py-2">No results</p>
)}
```
With:
```tsx
{!loading && results.length === 0 && nameQuery && (
  <p className="text-xs text-zinc-500 py-2">
    No {distance} results found for "{nameQuery}"
  </p>
)}
{!loading && results.length === 0 && !nameQuery && (
  <p className="text-xs text-zinc-500 py-2">No results</p>
)}
```

---

## Step 4 (Sequential) — Header.tsx

**Files:**
- Modify: `apps/web/src/components/Header.tsx`

This runs after the batch. All other changes are already in place.

### New header layout

```
Left:  [fish img 24px]  PACE  ·  built by itsnemo.dev
Right: [♥ Ko-fi]  [✉ Contact]  [+ New Window (N/MAX)]
```

### Implementation

```tsx
import { useState } from "react";
import ContactModal from "./ContactModal";

export default function Header() {
  const [contactOpen, setContactOpen] = useState(false);
  // ... existing store hooks ...

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
      {/* Left: logo + title + attribution */}
      <div className="flex items-center gap-2">
        <img src="/favicon.png" alt="PACE logo" className="w-6 h-6" />
        <h1 className="text-xl font-bold tracking-tight text-white">PACE</h1>
        <span className="text-xs font-thin italic text-zinc-500">
          built by{" "}
          <a
            href="https://itsnemo.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            itsnemo.dev
          </a>
        </span>
      </div>

      {/* Right: community icons + new window */}
      <div className="flex items-center gap-3">
        {/* Ko-fi support — placeholder URL until account created */}
        <a
          href="https://ko-fi.com/PLACEHOLDER"
          target="_blank"
          rel="noopener noreferrer"
          title="Support PACE on Ko-fi"
          className="text-zinc-400 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ♥
        </a>

        {/* Contact / submissions */}
        <button
          onClick={() => setContactOpen(true)}
          title="Report a bug or request a race"
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          ✉
        </button>

        {/* Existing new window button */}
        <button
          onClick={() => addWindow()}
          disabled={atCapacity}
          className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          + New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}
        </button>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
```

---

## Future Notes

- **Ko-fi URL**: replace `https://ko-fi.com/PLACEHOLDER` in `Header.tsx` once account is created. Single string swap, no other changes needed.
- **Formspree → Notion migration**: `ContactModal.tsx` currently POSTs to Formspree. When ready to migrate, replace the `fetch` call with a Notion MCP write to a submissions database. The form fields and UI stay unchanged.
- **Season filter**: the season filter fix from `2026-03-04-frontend-fixes-123.md` (Task 1) is not yet applied. It should be applied in the same session as this plan (or before) to avoid a merge conflict on `AthleteSearch.tsx`.
