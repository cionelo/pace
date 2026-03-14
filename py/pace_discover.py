#!/usr/bin/env python3
"""
pace_discover.py
Discover and classify all events on an AthleticLIVE meet page.

Usage:
  python pace_discover.py --url "https://live.rapidresultstiming.com/meets/62216"
  python pace_discover.py --url "..." --distance-only
  python pace_discover.py --url "..." --json

Output: table of events with columns:
  EVENT_ID | TYPE | NAME | GENDER | DISTANCE | CATEGORY | ROUND
"""

import argparse
import asyncio
import json
import re
import sys
from typing import Optional


# ---- Classification patterns ----

DISTANCE_RE = re.compile(r'(800|1500|Mile|1 Mile|3000|5000|5K|10000|10K|DMR|4x800|4x1600)', re.IGNORECASE)
GENDER_PATTERNS = {
    'Women': re.compile(r"\bWomen'?s?\b|Girls|\bW\b", re.IGNORECASE),
    'Men': re.compile(r"\bMen'?s?\b|Boys|\bM\b", re.IGNORECASE),
}
ROUND_RE = re.compile(r'\b(Prelim|Preliminary|Prelims|Final|Finals|Heat|Semis|Semi.Final)\b', re.IGNORECASE)

COMBINED_RE = re.compile(r'\b(Pent|Hept|Decath|Pentathlon|Heptathlon|Decathlon)\b', re.IGNORECASE)
SPRINT_RE = re.compile(r'\b(60|100|110|200|400|60H|100H|110H|400H)\s*m?\b', re.IGNORECASE)
FIELD_RE = re.compile(
    r'\b(High Jump|Long Jump|Triple Jump|Pole Vault|Shot Put|Discus|Hammer|Javelin|Weight Throw|'
    r'Pentathlon|Heptathlon|Decathlon)\b',
    re.IGNORECASE,
)


def classify_event(name: str) -> dict:
    """Return category, gender, distance, round for an event name."""
    category = "other"
    distance = ""
    gender = "Unknown"
    round_ = "Final"

    # Category — exclude multi-event components (Pent 800m, Hept 60m, etc.)
    if COMBINED_RE.search(name):
        category = "combined"
    elif DISTANCE_RE.search(name):
        category = "distance"
        m = DISTANCE_RE.search(name)
        distance = m.group(0) if m else ""
        # Normalize distance labels to canonical form
        _d = distance.lower()
        if _d in ("mile", "1 mile"):
            distance = "Mile"
        elif _d in ("5k",):
            distance = "5000m"
        elif _d in ("10k",):
            distance = "10000m"
        elif _d in ("800",):
            distance = "800m"
        elif _d in ("1500",):
            distance = "1500m"
        elif _d in ("3000",):
            distance = "3000m"
        elif _d in ("5000",):
            distance = "5000m"
        elif _d in ("10000",):
            distance = "10000m"
    elif SPRINT_RE.search(name):
        category = "sprint"
    elif FIELD_RE.search(name):
        category = "field"

    # Gender
    for g, pat in GENDER_PATTERNS.items():
        if pat.search(name):
            gender = g
            break

    # Round (prelim/final)
    m = ROUND_RE.search(name)
    if m:
        token = m.group(0).lower()
        if "prelim" in token or "heat" in token or "semi" in token:
            round_ = "Prelim"
        else:
            round_ = "Final"

    return {"category": category, "distance": distance, "gender": gender, "round": round_}


async def discover_events(url: str) -> list:
    """Use Playwright to open meet page and extract all event links.

    AthleticLIVE SPAs filter events by day/session using <button class="btn-secondary">
    elements. This function clicks each inactive day button to reveal events hidden
    behind the default view (e.g. 3000m events on Day 2).
    """
    from playwright.async_api import async_playwright

    raw_links: list = []
    seen_hrefs: set = set()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        async def harvest():
            """Collect all event links currently visible in the DOM."""
            items = await page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href*="/events/"]')).map(a => {
                    // TrackScoreboard: span.event-name holds the clean label
                    const nameSpan = a.querySelector('.event-name, span.event-name');
                    let label;
                    if (nameSpan) {
                        label = nameSpan.innerText.trim();
                    } else {
                        let parent = a.closest('tr, li, div');
                        label = (parent ? parent.innerText : a.innerText).trim().replace(/\\n/g, ' | ');
                    }
                    return { href: a.href, label: label };
                })
            """)
            added = 0
            for item in items:
                href = item["href"]
                if href not in seen_hrefs:
                    seen_hrefs.add(href)
                    raw_links.append(item)
                    added += 1
            return added

        # Collect from the default (Day 1) view
        await harvest()

        # Find day/session filter buttons — AthleticLIVE uses btn-secondary for these.
        # Clicking inactive ones reveals events from other days.
        day_buttons = await page.evaluate("""
            () => Array.from(document.querySelectorAll('button.btn-secondary')).map(btn => ({
                text: btn.innerText.trim(),
                active: btn.classList.contains('active')
            })).filter(b => b.text && !b.active)
        """)

        for btn_info in day_buttons:
            try:
                btn = page.get_by_role("button", name=btn_info["text"], exact=True)
                await btn.first.click(timeout=3000)
                await page.wait_for_timeout(1200)
                n = await harvest()
                print(f"[discover] day button {btn_info['text']!r}: +{n} new events")
            except Exception as e:
                print(f"[discover] could not click day button {btn_info['text']!r}: {e}")

        await browser.close()

    # Round-keyword segments that can appear as the final URL path component
    # (TrackScoreboard pattern: /events/{id}/{round})
    _URL_ROUND_SEGS = {"prelim", "preliminary", "prelims", "final", "finals", "heat", "semis"}

    # Build structured event list
    events = []
    for r in raw_links:
        href = r["href"]

        url_parts = href.rstrip("/").split("/")
        last_seg = url_parts[-1]
        # TrackScoreboard encodes round as last URL segment: /events/{id}/{Prelim|Final}
        if last_seg.lower() in _URL_ROUND_SEGS and len(url_parts) >= 2:
            event_id = url_parts[-2]
            url_round = "Prelim" if last_seg.lower() in {"prelim", "preliminary", "prelims", "heat"} else "Final"
        else:
            event_id = last_seg
            url_round = None
        is_relay = "/relay/" in href
        event_type = "relay" if is_relay else "individual"

        # Row text format: "Official | Event Name | Day Time"
        # Take index [1] to skip status badge; fall back to [0]
        label_parts = [p.strip() for p in r["label"].split("|")]
        label = label_parts[1] if len(label_parts) > 1 else label_parts[0]

        info = classify_event(label)
        # URL-encoded round takes precedence over text-classified round
        # (handles cases where the label doesn't contain round keywords)
        effective_round = url_round if url_round is not None else info["round"]
        events.append({
            "id": event_id,
            "type": event_type,
            "name": label,
            "gender": info["gender"],
            "distance": info["distance"],
            "category": info["category"],
            "round": effective_round,
            "href": href,
        })

    return events


def discover_flashresults(index_url: str) -> list:
    """Discover all events on a FlashResults meet index page (static HTML).

    Parses the index.htm (or index.html) page using requests + BeautifulSoup.
    Returns event list in the same format as discover_events().
    """
    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin

    print(f"[fr-discover] GET {index_url}")
    try:
        resp = requests.get(index_url, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"[fr-discover] fetch error: {e}")
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    # Import event_id_from_url from pace_scraper to ensure consistent IDs
    import sys as _sys
    import pathlib as _pathlib
    _py_dir = _pathlib.Path(__file__).parent
    if str(_py_dir) not in _sys.path:
        _sys.path.insert(0, str(_py_dir))
    try:
        from pace_scraper import event_id_from_url as _eid_fn
    except ImportError:
        def _eid_fn(u):  # type: ignore[misc]
            parts = u.rstrip("/").split("/")
            fn = parts[-1] if parts else ""
            meet_dir = parts[-2] if len(parts) >= 2 else "fr"
            if "_compiled" in fn:
                return f"{meet_dir}_{fn.split('_compiled')[0]}"
            return fn.split(".")[0] or meet_dir

    seen_hrefs: set = set()
    events: list = []

    for td in soup.select("td.fixed-column"):
        a = td.find("a")
        if not a:
            continue
        href = a.get("href", "")
        if not href or "_compiled" not in href:
            continue

        full_href = urljoin(index_url, href)
        if full_href in seen_hrefs:
            continue
        seen_hrefs.add(full_href)

        event_name = a.get_text(" ", strip=True)
        if not event_name:
            continue

        # Round: read from next sibling TD after fixed-column
        sibling_tds = td.parent.find_all("td")
        try:
            td_idx = list(sibling_tds).index(td)
            round_td = sibling_tds[td_idx + 1] if td_idx + 1 < len(sibling_tds) else None
            round_text = round_td.get_text(strip=True).lower() if round_td else ""
        except (ValueError, IndexError):
            round_text = ""

        if "prelim" in round_text or "heat" in round_text or "semi" in round_text:
            page_round = "Prelim"
        else:
            page_round = "Final"

        event_id = _eid_fn(full_href)
        info = classify_event(event_name)
        # Page-specified round takes precedence over classify_event's text inference
        effective_round = page_round

        # Determine type: relay if the event name contains relay keywords
        is_relay = bool(re.search(r"\brelay\b|\bDMR\b|\b4x", event_name, re.IGNORECASE))
        event_type = "relay" if is_relay else "individual"

        events.append({
            "id": event_id,
            "type": event_type,
            "name": event_name,
            "gender": info["gender"],
            "distance": info["distance"],
            "category": info["category"],
            "round": effective_round,
            "href": full_href,
        })

    print(f"[fr-discover] found {len(events)} events")
    return events


async def discover_trackscoreboard(url: str) -> list:
    """Use Playwright to discover events on a rt.trackscoreboard.com meet page."""
    from playwright.async_api import async_playwright
    import sys as _sys
    import pathlib as _pathlib

    # Ensure /events suffix
    events_url = url.rstrip("/")
    if not events_url.endswith("/events"):
        events_url += "/events"

    # Import event_id_from_url for consistent IDs
    _py_dir = _pathlib.Path(__file__).parent
    if str(_py_dir) not in _sys.path:
        _sys.path.insert(0, str(_py_dir))
    try:
        from pace_scraper import event_id_from_url as _eid_fn
    except ImportError:
        def _eid_fn(u):  # type: ignore[misc]
            return u.rstrip("/").split("/")[-1]

    events: list = []
    seen_hrefs: set = set()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        print(f"[ts-discover] {events_url}")
        await page.goto(events_url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        links = await page.query_selector_all("a[href]")
        for link in links:
            href = await link.get_attribute("href")
            text = await link.inner_text()
            if not href or "/events/" not in href:
                continue

            full_href = ("https://rt.trackscoreboard.com" + href) if href.startswith("/") else href
            if full_href in seen_hrefs:
                continue
            seen_hrefs.add(full_href)

            # Skip pentathlon sub-events: /meets/N/events/N/Round/N
            path_parts = href.rstrip("/").split("/")
            try:
                ev_idx = path_parts.index("events")
                if len(path_parts) - ev_idx > 3:
                    continue
            except ValueError:
                pass

            round_ = "Prelim" if "/Prelim" in href else "Final"
            # Clean event name (strip trailing status tokens like Scored/Done/JO)
            event_name = re.sub(r'\s*(Scored|Done|JO)\s*$', '', text.strip()).strip()
            if not event_name:
                continue

            info = classify_event(event_name)
            is_relay = bool(re.search(r"\brelay\b|\bDMR\b|\b4x", event_name, re.IGNORECASE))
            event_type = "relay" if is_relay else "individual"

            events.append({
                "id": _eid_fn(full_href),
                "type": event_type,
                "name": event_name,
                "gender": info["gender"],
                "distance": info["distance"],
                "category": info["category"],
                "round": round_,
                "href": full_href,
            })

        await browser.close()

    print(f"[ts-discover] found {len(events)} events")
    return events


def discover_meet(url: str) -> list:
    """Provider-aware meet discovery dispatcher.

    Calls discover_flashresults() for flashresults.com URLs,
    calls discover_trackscoreboard() for rt.trackscoreboard.com URLs,
    otherwise falls back to the Playwright-based discover_events().
    """
    import asyncio
    if "flashresults.com" in url.lower():
        return discover_flashresults(url)
    if "rt.trackscoreboard.com" in url.lower():
        return asyncio.run(discover_trackscoreboard(url))
    return asyncio.run(discover_events(url))


def print_table(events: list, distance_only: bool) -> None:
    """Print formatted table to stdout."""
    rows = [e for e in events if not distance_only or e["category"] == "distance"]
    if not rows:
        print("No events found." + (" (try without --distance-only)" if distance_only else ""))
        return

    fmt = "{:>12}  {:<10}  {:<8}  {:<8}  {:<50}  {:<8}"
    print(fmt.format("EVENT_ID", "TYPE", "GENDER", "DIST", "NAME", "ROUND"))
    print("-" * 110)
    for e in rows:
        print(fmt.format(
            e["id"],
            e["type"],
            e["gender"],
            e["distance"] or e["category"],
            e["name"][:50],
            e["round"],
        ))


def main():
    ap = argparse.ArgumentParser(description="Discover events on an AthleticLIVE meet page")
    ap.add_argument("--url", required=True, help="Meet URL")
    ap.add_argument("--distance-only", action="store_true", help="Only show distance events")
    ap.add_argument("--json", dest="as_json", action="store_true", help="Output as JSON")
    args = ap.parse_args()

    events = asyncio.run(discover_events(args.url))

    if args.as_json:
        print(json.dumps(events, indent=2))
    else:
        print_table(events, distance_only=args.distance_only)


if __name__ == "__main__":
    main()
