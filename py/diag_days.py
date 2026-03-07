#!/usr/bin/env python3
"""
diag_days.py
Diagnostic: find all events by clicking day/session filter buttons on meet pages.
Works for AthleticLIVE SPAs that use button-based day filtering.

Usage:
  python3 diag_days.py --url "https://live.fstiming.com/meets/62261"
  python3 diag_days.py --url "https://live.herostiming.com/meets/59934"
"""

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, List


async def run(url: str) -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        print(f"=== Navigating: {url} ===")
        await page.goto(url, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # Find day/session filter buttons (btn-secondary pattern used on AthleticLIVE)
        day_buttons = await page.evaluate("""
            () => {
                const btns = [];
                document.querySelectorAll('button').forEach(el => {
                    const cls = el.className || '';
                    const t = el.innerText.trim();
                    // Day filter buttons are often btn-secondary
                    // Match buttons that look like day names
                    if (t && (cls.includes('btn-secondary') || /day|sat|sun|fri|mon|tue|wed|thu|track|field|session|morning|afternoon/i.test(t))) {
                        btns.push({text: t, class: cls.substring(0, 60), active: cls.includes('active')});
                    }
                });
                return btns;
            }
        """)

        print(f"\n=== Day/Session filter buttons found: {len(day_buttons)} ===")
        for b in day_buttons:
            print(f"  {'[ACTIVE]' if b['active'] else '       '} {b['text']!r}")

        # Collect all events across all day buttons
        all_events: Dict[str, Dict[str, Any]] = {}

        async def collect_events_on_page(day_label: str):
            await page.wait_for_timeout(1500)
            links = await page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href*="/events/"]')).map(a => {
                    let parent = a.closest('tr, li, div');
                    return {
                        href: a.href,
                        label: (parent ? parent.innerText : a.innerText).trim().replace(/\\n/g, ' | ')
                    };
                })
            """)
            for item in links:
                href = item["href"]
                if href not in all_events:
                    all_events[href] = {"href": href, "label": item["label"], "day": day_label}

        # Collect initial events (default day)
        print(f"\n=== Collecting events on default view ===")
        await collect_events_on_page("(default)")
        print(f"  Found {sum(1 for _ in all_events)} events so far")

        # Click each day button and collect events
        for btn_info in day_buttons:
            btn_text = btn_info["text"]
            if btn_info["active"]:
                continue  # already collected
            try:
                btn = page.get_by_text(btn_text, exact=True)
                await btn.first.click(timeout=3000)
                await page.wait_for_timeout(1500)
                prev_count = len(all_events)
                await collect_events_on_page(btn_text)
                new_count = len(all_events) - prev_count
                print(f"  After clicking {btn_text!r}: +{new_count} new events ({len(all_events)} total)")
            except Exception as e:
                print(f"  Failed to click {btn_text!r}: {e}")

        await browser.close()

    # Print all events found
    print(f"\n=== All events found ({len(all_events)} total) ===")
    for href, e in sorted(all_events.items(), key=lambda x: x[0]):
        parts = href.rstrip("/").split("/")
        event_id = parts[-1]
        is_relay = "/relay/" in href
        label = e["label"]
        parts_l = [p.strip() for p in label.split("|")]
        name = parts_l[1] if len(parts_l) > 1 else parts_l[0]
        etype = "relay" if is_relay else "indiv"
        print(f"  [{etype}] {event_id:>10} | day={e['day']!r} | {name[:60]!r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    args = ap.parse_args()
    asyncio.run(run(args.url))


if __name__ == "__main__":
    main()
