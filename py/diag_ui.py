#!/usr/bin/env python3
"""
diag_ui.py
Dump all tabs, buttons, nav elements, and ALL XHRs on a page.
Also tries clicking every tab to see what new XHRs fire.

Usage:
  python3 diag_ui.py --url "https://live.fstiming.com/meets/62261/events/individual/2280994"
"""

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, List


async def run(url: str) -> None:
    from playwright.async_api import async_playwright

    all_xhr: List[str] = []
    all_json: List[Dict[str, Any]] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        def on_request(req):
            if req.resource_type in ("xhr", "fetch"):
                all_xhr.append(req.url)

        async def on_response(resp):
            ct = resp.headers.get("content-type", "")
            if "json" in ct:
                try:
                    data = await resp.json()
                    all_json.append({"url": resp.url, "data": data})
                except Exception:
                    pass

        page.on("request", on_request)
        page.on("response", on_response)

        print(f"=== Loading: {url} ===")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        # Dump all interactive elements
        elements = await page.evaluate("""
            () => {
                const items = [];
                // All tabs
                document.querySelectorAll('[role="tab"]').forEach(el => {
                    items.push({kind: 'tab', text: el.innerText.trim(), class: el.className, aria: el.getAttribute('aria-selected')});
                });
                // All buttons
                document.querySelectorAll('button').forEach(el => {
                    const t = el.innerText.trim();
                    if (t) items.push({kind: 'button', text: t.substring(0,60), class: el.className.substring(0,60)});
                });
                // Links containing 'split' or relevant
                document.querySelectorAll('a').forEach(el => {
                    const href = el.href || '';
                    const t = el.innerText.trim();
                    if (/split|result|individual|event/i.test(href) || /split|result/i.test(t)) {
                        items.push({kind: 'link', text: t.substring(0,60), href: href});
                    }
                });
                return items;
            }
        """)

        print(f"\n=== All interactive elements ({len(elements)}) ===")
        for e in elements:
            print(f"  [{e['kind']}] {e.get('text','')!r} | {e.get('aria','')!r} | {e.get('href','')!r} | class: {e.get('class','')[:40]!r}")

        # Try clicking every tab
        tab_els = await page.query_selector_all('[role="tab"]')
        print(f"\n=== Clicking each of {len(tab_els)} tabs ===")
        for i, tab_el in enumerate(tab_els):
            tab_text = (await tab_el.inner_text()).strip()
            pre_len = len(all_xhr)
            try:
                await tab_el.click(timeout=2000)
                await page.wait_for_timeout(1500)
                new_xhrs = all_xhr[pre_len:]
                print(f"\n  [TAB {i}] {tab_text!r} -> {len(new_xhrs)} new XHRs")
                for x in new_xhrs:
                    print(f"    XHR: {x}")
            except Exception as e:
                print(f"\n  [TAB {i}] {tab_text!r} -> CLICK FAILED: {e}")

        # Also scroll to trigger lazy loads
        for _ in range(8):
            await page.mouse.wheel(0, 500)
            await page.wait_for_timeout(200)

        await browser.close()

    print(f"\n=== ALL XHRs ({len(all_xhr)}) ===")
    for x in all_xhr:
        print(f"  {x}")

    print(f"\n=== All JSON responses ({len(all_json)}) ===")
    for j in all_json:
        url_s = j["url"]
        data = j["data"]
        # Print preview (not massive arrays)
        if isinstance(data, dict):
            keys = list(data.keys())
            preview = f"keys={keys[:8]}"
        elif isinstance(data, list):
            preview = f"list len={len(data)}"
        else:
            preview = repr(data)[:80]
        print(f"  {url_s}")
        print(f"    {preview}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    args = ap.parse_args()
    asyncio.run(run(args.url))


if __name__ == "__main__":
    main()
