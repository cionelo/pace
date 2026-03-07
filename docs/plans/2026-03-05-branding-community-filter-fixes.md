# Branding, Community Hub & Filter Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fish-logo branding + favicon, a two-icon community hub (Ko-fi support link + contact/submission modal via Formspree), and fix three athlete search bugs (gender filter not applying, wrong sort order, uninformative empty state).

**Architecture:** Tasks 1–3 are fully independent (zero shared files) and MUST be dispatched as parallel agents. Task 4 is the sequential integration step that wires everything into `Header.tsx`. No DB schema changes. No new routes. All changes are front-end only in `apps/web/`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Zustand, Supabase (already wired — no changes to client), Formspree (external POST endpoint for contact form)

---

## Parallel Dispatch — Tasks 1, 2, 3

> **IMPORTANT:** Before starting Task 4, dispatch Tasks 1, 2, and 3 as three separate parallel agents simultaneously. Each touches completely different files. Task 4 MUST wait until all three complete.

```
Agent 1 → Task 1 (favicon + index.html)
Agent 2 → Task 2 (ContactModal.tsx + .env.local)
Agent 3 → Task 3 (db.ts + AthleteSearch.tsx)
                ↓ all three complete
          Task 4 (Header.tsx — integration)
```

---

## Task 1: Favicon

**Files:**
- Create: `apps/web/public/favicon.png`
- Modify: `apps/web/index.html`

No test infrastructure exists in this project. Each task ends with a manual smoke-test and a commit.

**Step 1: Copy the logo file**

```bash
cp "/Users/ncionelo/Downloads/business card website itsnemo.dev/itsnemo.dev work site/logos/nemo-favicon-1.png" \
   "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web/public/favicon.png"
```

Expected: file appears at `apps/web/public/favicon.png`. Verify:
```bash
ls -lh "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web/public/favicon.png"
```

**Step 2: Add favicon link to index.html**

Current `apps/web/index.html` (entire file):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PACE</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Replace with (add the `<link rel="icon">` line after `<title>`):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PACE</title>
    <link rel="icon" type="image/png" href="/favicon.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 3: Smoke test**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
npm run dev
```

Open `http://localhost:5173` in browser. Verify:
- Browser tab shows the orange fish icon (not the default Vite logo)

**Step 4: Commit**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git add apps/web/public/favicon.png apps/web/index.html
git commit -m "feat: add fish logo favicon"
```

---

## Task 2: ContactModal Component

**Files:**
- Create: `apps/web/src/components/ContactModal.tsx`
- Modify: `apps/web/.env.local`

**Step 1: Add Formspree placeholder to .env.local**

Current `apps/web/.env.local` ends at line 2. Append these lines (do NOT remove existing lines):
```
# Community hub — Formspree form ID
# 1. Create free account at https://formspree.io
# 2. Create a new form, copy the 8-char form ID
# 3. Replace the value below: VITE_FORMSPREE_ID=xxxxxxxx
# Future: migrate to Notion DB via MCP
# VITE_FORMSPREE_ID=
```

**Step 2: Create ContactModal.tsx**

Create `apps/web/src/components/ContactModal.tsx` with this exact content:

```tsx
import { useState } from "react";

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
}

type FormType = "Bug Report" | "Race Request" | "Feature Request";
type SubmitState = "idle" | "submitting" | "success" | "error";

const DESCRIPTION_LABEL: Record<FormType, string> = {
  "Bug Report": "What went wrong? Include athlete/race name if applicable.",
  "Race Request": "Which race should be added? Any context about conference/season?",
  "Feature Request": "Describe the feature.",
};

export default function ContactModal({ open, onClose }: ContactModalProps) {
  const [type, setType] = useState<FormType>("Bug Report");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const body: Record<string, string> = { type, description };
      if (url) body.url = url;
      if (email) body.email = email;

      const res = await fetch(
        `https://formspree.io/f/${import.meta.env.VITE_FORMSPREE_ID}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }
      );
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  function handleClose() {
    setState("idle");
    setType("Bug Report");
    setDescription("");
    setUrl("");
    setEmail("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-100">
            {state === "success" ? "Sent!" : "Contact"}
          </h2>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {state === "success" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Thanks! We'll review your submission.
            </p>
            <button
              onClick={handleClose}
              className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormType)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
              >
                <option>Bug Report</option>
                <option>Race Request</option>
                <option>Feature Request</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                {DESCRIPTION_LABEL[type]}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full resize-none"
              />
            </div>

            {type === "Race Request" && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Race Results URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Email (optional, for follow-up)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded px-3 py-2 text-sm w-full"
              />
            </div>

            {state === "error" && (
              <p className="text-xs text-red-400">
                Something went wrong. Please try again.
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-40 transition-colors"
              >
                {state === "submitting" ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Smoke test**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
npm run dev
```

The modal is not yet wired to Header (that's Task 4), but the TypeScript compiler will validate the file. Check the terminal for any TS errors. Expected: no errors, dev server starts normally.

**Step 4: Commit**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git add apps/web/src/components/ContactModal.tsx apps/web/.env.local
git commit -m "feat: add ContactModal component (Formspree, bug/race/feature submissions)"
```

---

## Task 3: Filter & Search Fixes

**Files:**
- Modify: `apps/web/src/lib/db.ts`
- Modify: `apps/web/src/components/AthleteSearch.tsx`

**Background for the implementor:**
- `searchAthletes` in `db.ts` currently orders by `place` (finish position) and does not accept a `gender` filter.
- `AthleteSearch.tsx` has a `genderFilter` state that controls which *events* are fetched, but does NOT pass it into the athlete search query — so toggling M/W doesn't narrow the results list.
- The empty-state message is a generic "No results" regardless of whether the user typed a name.

**Step 1: Add `gender` to `AthleteSearchFilters` in db.ts**

In `apps/web/src/lib/db.ts`, find the `AthleteSearchFilters` interface at lines 45–49:

```ts
interface AthleteSearchFilters {
  eventId?: string;
  teamName?: string;
  distance?: string;
}
```

Replace with:

```ts
interface AthleteSearchFilters {
  eventId?: string;
  teamName?: string;
  distance?: string;
  gender?: string;
}
```

**Step 2: Apply gender filter in searchAthletes**

In `searchAthletes` (lines 51–86), find this block:

```ts
  if (filters?.distance) {
    dbQuery = dbQuery.eq("event.distance", filters.distance);
  }
```

Add the gender filter immediately after it:

```ts
  if (filters?.distance) {
    dbQuery = dbQuery.eq("event.distance", filters.distance);
  }
  if (filters?.gender) {
    dbQuery = dbQuery.eq("event.gender", filters.gender);
  }
```

**Step 3: Sort by time_s (fastest first)**

In `searchAthletes`, find line 63:

```ts
    .order("place", { ascending: true })
```

Replace with:

```ts
    .order("time_s", { ascending: true, nullsFirst: false })
```

`nullsFirst: false` ensures athletes with a null `time_s` (rare edge case) appear at the bottom, not the top.

**Step 4: Pass gender to doSearch in AthleteSearch.tsx**

In `apps/web/src/components/AthleteSearch.tsx`, find the `doSearch` callback (lines 50–67). The `searchAthletes` call currently looks like:

```ts
      const data = await searchAthletes(nameQuery, {
        eventId: selectedEventId || undefined,
        distance,
      });
```

Replace with:

```ts
      const data = await searchAthletes(nameQuery, {
        eventId: selectedEventId || undefined,
        distance,
        gender: genderFilter || undefined,
      });
```

**Step 5: Update the empty-state message**

In `AthleteSearch.tsx`, find lines 191–193:

```tsx
            {!loading && results.length === 0 && (
              <p className="text-xs text-zinc-500 py-2">No results</p>
            )}
```

Replace with:

```tsx
            {!loading && results.length === 0 && nameQuery && (
              <p className="text-xs text-zinc-500 py-2">
                No {distance} results found for &ldquo;{nameQuery}&rdquo;
              </p>
            )}
            {!loading && results.length === 0 && !nameQuery && (
              <p className="text-xs text-zinc-500 py-2">No results</p>
            )}
```

**Step 6: Smoke test**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
npm run dev
```

Open the app. Add a PaceWindow, select "5000m":
- Click "W" gender filter → results list immediately updates to women's athletes only (fastest time at top)
- Click "M" → flips to men's only
- Type a name that has no 5000m results (e.g. a sprinter's name if one exists) → message reads `No 5000m results found for "..."` instead of generic "No results"
- Clear the name field → message reverts to "No results"

**Step 7: Commit**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git add apps/web/src/lib/db.ts apps/web/src/components/AthleteSearch.tsx
git commit -m "fix: gender filter applies immediately, sort fastest-first, descriptive empty state"
```

---

## Task 4: Header Integration (Sequential — after Tasks 1, 2, 3 all complete)

**Files:**
- Modify: `apps/web/src/components/Header.tsx`

> Only start this task after Tasks 1, 2, and 3 are all committed. This file integrates the favicon (Task 1), ContactModal (Task 2), and is the final visual piece of the branding work.

**Step 1: Read the current Header.tsx**

Current `apps/web/src/components/Header.tsx`:

```tsx
import { useWindowStore } from "../stores/window-store";
import { MAX_WINDOWS } from "../lib/constants";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
      <h1 className="text-xl font-bold tracking-tight text-white">PACE</h1>
      <button
        onClick={() => addWindow()}
        disabled={atCapacity}
        className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        + New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}
      </button>
    </header>
  );
}
```

**Step 2: Replace Header.tsx entirely**

Replace the entire file with:

```tsx
import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import { MAX_WINDOWS } from "../lib/constants";
import ContactModal from "./ContactModal";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;
  const [contactOpen, setContactOpen] = useState(false);

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
        {/* Ko-fi support — replace PLACEHOLDER once account is created */}
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

**Step 3: Smoke test**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/apps/web"
npm run dev
```

Open `http://localhost:5173`. Verify all of the following:

**Branding:**
- [ ] Fish logo appears left of "PACE" title in the header
- [ ] "built by itsnemo.dev" appears in thin italic zinc-500 text next to the title
- [ ] "itsnemo.dev" is a clickable link that opens `https://itsnemo.dev` in a new tab
- [ ] Browser tab shows the fish favicon

**Ko-fi icon:**
- [ ] A ♥ icon appears to the right of the title area
- [ ] Hovering turns it red (`hover:text-red-400`)
- [ ] Clicking opens `https://ko-fi.com/PLACEHOLDER` in a new tab (placeholder until account created)

**Contact modal:**
- [ ] An ✉ icon appears next to the ♥ icon
- [ ] Clicking ✉ opens the ContactModal
- [ ] Modal has a type dropdown with "Bug Report", "Race Request", "Feature Request"
- [ ] Switching to "Race Request" reveals the URL field; switching away hides it
- [ ] Clicking the overlay (outside the modal panel) closes it
- [ ] Clicking × closes it
- [ ] Cancel button closes it
- [ ] Submit with empty description is blocked (browser native required validation)

**Filter fixes (verify these still work):**
- [ ] Open a PaceWindow, select "5000m", click "W" → results immediately show only women's athletes, sorted fastest first
- [ ] Type a name with no 5000m results → see `No 5000m results found for "..."` message

**Step 4: Commit**

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
git add apps/web/src/components/Header.tsx
git commit -m "feat: branding (logo, attribution, Ko-fi, contact modal) in header"
```

---

## Final Notes

**Ko-fi URL swap (future):** When your Ko-fi account is live, find the one string `https://ko-fi.com/PLACEHOLDER` in `Header.tsx` and replace it with your real URL. No other changes needed.

**Formspree setup (future):** Create a free account at [formspree.io](https://formspree.io), create a form, copy the 8-char form ID, and set `VITE_FORMSPREE_ID=xxxxxxxx` in `apps/web/.env.local`. The modal will start sending live submissions immediately.

**Notion migration path (future):** When ready to move submissions to Notion, replace the `fetch(...)` call in `ContactModal.tsx`'s `handleSubmit` with a call to the Notion MCP. Form fields and UI remain unchanged.

**Season filter:** The previous plan `docs/plans/2026-03-04-frontend-fixes-123.md` (Task 1) also modifies `AthleteSearch.tsx` to add a season filter. If that plan has not yet been executed, apply it after this plan to avoid a merge conflict — both plans touch `AthleteSearch.tsx` at different lines.
