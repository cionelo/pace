#!/usr/bin/env python3
"""
diag_xhr.py
Diagnostic: open a URL with Playwright and log ALL XHR/fetch requests + responses.
Used to find the exact URL pattern for split_report on sites like live.fstiming.com.

Usage:
  python3 diag_xhr.py --url "https://live.fstiming.com/meets/62261/events/individual/2280994"
  python3 diag_xhr.py --url "https://live.fstiming.com/meets/62261" --mode discover
"""

import argparse
import asyncio
import json
import re
import sys
from typing import Any, Dict, List


async def run_diag(url: str, mode: str, wait_s: int) -> None:
    from playwright.async_api import async_playwright

    all_requests: List[Dict[str, Any]] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        # Log every request
        def on_request(req):
            if req.resource_type in ("xhr", "fetch", "websocket"):
                all_requests.append({"type": req.resource_type, "url": req.url, "method": req.method})

        page.on("request", on_request)

        # Also capture JSON responses
        json_responses: List[Dict[str, Any]] = []

        async def on_response(resp):
            try:
                ct = resp.headers.get("content-type", "")
                if "json" in ct or "javascript" in ct:
                    try:
                        data = await resp.json()
                        json_responses.append({"url": resp.url, "status": resp.status, "data_preview": repr(data)[:200]})
                    except Exception:
                        pass
            except Exception:
                pass

        page.on("response", on_response)

        print(f"[diag] navigating: {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2000)

        if mode == "splits":
            # Simulate what the scraper does: click Results, then Splits tab
            for label in ["Results", "Individuals", "Athletes"]:
                try:
                    await page.get_by_role("tab", name=label).click(timeout=1500)
                    await page.wait_for_timeout(500)
                    print(f"[diag] clicked tab: {label}")
                    break
                except Exception:
                    pass

            for label in ["Splits", "Split"]:
                try:
                    await page.get_by_role("tab", name=label).click(timeout=1500)
                    await page.wait_for_timeout(1000)
                    print(f"[diag] clicked splits tab: {label}")
                    break
                except Exception:
                    pass

            # Scroll to trigger lazy loads
            for _ in range(10):
                await page.mouse.wheel(0, 600)
                await page.wait_for_timeout(300)

            # Wait for additional network activity
            await page.wait_for_timeout(wait_s * 1000)

        elif mode == "discover":
            # Wait for the page to fully load, then check for day/session tabs
            await page.wait_for_timeout(3000)

            # Find all tabs and clickable elements
            tabs = await page.evaluate("""
                () => {
                    const items = [];
                    // Role-based tabs
                    document.querySelectorAll('[role="tab"]').forEach(el => {
                        items.push({type: 'tab', text: el.innerText.trim(), id: el.id || ''});
                    });
                    // Button-like nav elements
                    document.querySelectorAll('button, .tab, .nav-item, [data-tab]').forEach(el => {
                        const t = el.innerText.trim();
                        if (t) items.push({type: 'button/nav', text: t.substring(0, 60), id: el.id || ''});
                    });
                    return items;
                }
            """)
            print("\n[diag] === Tabs / Nav elements ===")
            for t in tabs[:30]:
                print(f"  [{t['type']}] {t['text']!r}")

            # Find all event links (not just /events/)
            all_links = await page.evaluate("""
                () => Array.from(document.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.innerText.trim().replace(/\\n/g, ' ').substring(0, 80)
                })).filter(x => x.href && !x.href.endsWith('#'))
            """)
            print(f"\n[diag] === All links ({len(all_links)} total) ===")
            event_links = [l for l in all_links if '/events/' in l['href']]
            print(f"  Event links: {len(event_links)}")
            for l in event_links[:50]:
                print(f"  {l['href']} | {l['text']!r}")

            # Now click each tab and check what event links appear
            tab_els = await page.query_selector_all('[role="tab"]')
            for i, tab_el in enumerate(tab_els[:10]):
                tab_text = await tab_el.inner_text()
                print(f"\n[diag] --- Clicking tab: {tab_text!r} ---")
                try:
                    await tab_el.click()
                    await page.wait_for_timeout(1500)
                    new_links = await page.evaluate("""
                        () => Array.from(document.querySelectorAll('a[href*="/events/"]')).map(a => ({
                            href: a.href,
                            text: (a.closest('tr,li,div') || a).innerText.trim().replace(/\\n/g, ' | ').substring(0, 80)
                        }))
                    """)
                    print(f"  Found {len(new_links)} event links after clicking tab")
                    for l in new_links[:20]:
                        print(f"    {l['href'].split('/')[-1]} | {l['text']!r}")
                except Exception as e:
                    print(f"  Failed to click: {e}")

        await browser.close()

    print("\n[diag] === XHR/Fetch Requests ===")
    for r in all_requests:
        print(f"  [{r['type'].upper()}] {r['method']} {r['url']}")

    print(f"\n[diag] === JSON Responses ({len(json_responses)}) ===")
    for r in json_responses:
        print(f"  [{r['status']}] {r['url']}")
        print(f"    preview: {r['data_preview'][:100]}")

    # Highlight anything that looks split-related
    print("\n[diag] === Split-related URLs ===")
    split_keywords = ["split", "lap", "checkpoint", "spr", "timing"]
    for r in all_requests:
        url_l = r["url"].lower()
        if any(kw in url_l for kw in split_keywords):
            print(f"  SPLIT-CANDIDATE: {r['url']}")
    for r in json_responses:
        url_l = r["url"].lower()
        if any(kw in url_l for kw in split_keywords):
            print(f"  SPLIT-JSON: {r['url']}")
            print(f"    preview: {r['data_preview'][:150]}")


def main():
    ap = argparse.ArgumentParser("PACE XHR Diagnostic")
    ap.add_argument("--url", required=True)
    ap.add_argument("--mode", default="splits", choices=["splits", "discover"],
                    help="splits=event page mode, discover=meet page mode")
    ap.add_argument("--wait", type=int, default=3, help="Extra wait seconds after interaction")
    args = ap.parse_args()
    asyncio.run(run_diag(args.url, args.mode, args.wait))


if __name__ == "__main__":
    main()
