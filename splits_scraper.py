# splits_scraper.py
# v2.1 — CI-hardened: always write split_report.json, ind_res_list.json, team_colors.json
# - Broader network sniff (split_report, ind_res_list_doc, ind_res_list, res_list)
# - Alternating tab clicks (Splits <-> Results/Individuals) with timed retries
# - Headless-safe scrolling + viewport nudges
# - Guaranteed fallback: DOM scrape builds minimal ind_res_list.json if network never yields JSON
# - More explicit logging for GitHub Actions

import argparse, asyncio, json, pathlib, re, sys, time
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

# -------- helpers: ids/paths --------
def event_id_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]

def ensure_dir(p: pathlib.Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

# -------- helpers: SVG → colors --------
HEX_RE = re.compile(r'#[0-9A-Fa-f]{6}')

def extract_hexes(svg_text: str) -> List[str]:
    found = HEX_RE.findall(svg_text or "")
    uniq = sorted(set(h.lower() for h in found))
    return [h.upper() for h in uniq]

def pick_primary(hexes: List[str]) -> Optional[str]:
    bad = {"#000000","#0D0D0D","#111111","#1A1A1A","#212121",
           "#FFFFFF","#FFFDFD","#FEFEFE","#F6F6F6"}
    for h in hexes:
        if h.upper() not in bad:
            return h
    return hexes[0] if hexes else None

def fetch_svg_text(url: str, timeout: int = 20) -> Optional[str]:
    if not url or ".svg" not in url.lower():
        return None
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.text
    except Exception:
        return None

def build_team_colors_json(logos: Dict[str, str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for team, url in logos.items():
        svg = fetch_svg_text(url)
        hexes = extract_hexes(svg) if svg else []
        primary = pick_primary(hexes)
        out[team or url.split("/")[-1]] = {
            "logo_url": url,
            "primary_hex": primary or "",
            "palette": hexes
        }
    return out

# -------- URL classifiers --------
def _looks_like_event_json(u: str) -> bool:
    ul = u.lower()
    return (
        ("split_report" in ul)
        or ("ind_res_list_doc" in ul)
        or ("ind_res_list" in ul)
        or ("res_list" in ul and "/api/" in ul)
    )

def _is_split(u: str) -> bool:
    return "split_report" in u.lower()

def _is_reslist(u: str) -> bool:
    ul = u.lower()
    return ("ind_res_list_doc" in ul) or ("ind_res_list" in ul) or ("res_list" in ul)

# -------- Playwright capture --------
async def _scroll_everywhere(page, total_ms=20000):
    # window scroll
    t0 = time.time()
    step_px = 900
    while (time.time() - t0) * 1000 < total_ms:
        await page.mouse.wheel(0, step_px)
        await page.wait_for_timeout(160)
    # scroll overflow containers
    await page.evaluate("""
(() => {
  const nodes = Array.from(document.querySelectorAll('*'));
  nodes.forEach(n => {
    const s = getComputedStyle(n);
    const oh = n.scrollHeight - n.clientHeight;
    if (oh > 120 && (s.overflowY === 'auto' || s.overflowY === 'scroll')) {
      n.scrollTop = n.scrollHeight;
    }
  });
})();
""")

async def _click_tab(page, labels: List[str], log_prefix: str) -> bool:
    for text in labels:
        try:
            await page.get_by_role("tab", name=text).click(timeout=900)
            await page.wait_for_timeout(350)
            print(f"[ui] {log_prefix} via role: {text}")
            return True
        except Exception:
            try:
                await page.get_by_text(text, exact=False).click(timeout=900)
                await page.wait_for_timeout(350)
                print(f"[ui] {log_prefix} via text: {text}")
                return True
            except Exception:
                continue
    return False

async def _click_splits_tab(page):
    return await _click_tab(page, ["Splits","SPLITS","Split"], "clicked Splits")

async def _click_results_tab(page):
    # Sites vary: Results/Individuals/Athletes
    return await _click_tab(page, ["Results","RESULTS","Individuals","INDIVIDUALS","Individual","Athletes"], "clicked Results/Individuals")

async def sniff_event_json(url: str, headful: bool) -> Tuple[Optional[Dict[str,Any]], Optional[str],
                                                              Optional[Dict[str,Any]], Optional[str],
                                                              Dict[str,str]]:
    """
    Returns: (split_report_json, split_url, ind_res_list_json, ind_url, logos_map[team_name->logo_url])
    """
    split_report: Optional[Dict[str, Any]] = None
    split_url: Optional[str] = None
    ind_res: Optional[Dict[str, Any]] = None
    ind_url: Optional[str] = None
    logos: Dict[str, str] = {}

    from playwright.async_api import async_playwright

    async def on_response(resp):
        nonlocal split_report, split_url, ind_res, ind_url
        try:
            u = resp.url
            if not _looks_like_event_json(u):
                return
            # try JSON
            try:
                data = await resp.json()
            except Exception as e:
                try:
                    txt = await resp.text()
                    data = json.loads(txt)
                except Exception as e2:
                    print(f"[json-miss] {u} ({type(e).__name__}/{type(e2).__name__})")
                    return
            if _is_split(u):
                if split_report is None:
                    split_report, split_url = data, u
                    print(f"[captured split_report] {u}")
            elif _is_reslist(u):
                if ind_res is None:
                    ind_res, ind_url = data, u
                    print(f"[captured ind_res_list] {u}")
        except Exception as e:
            print(f"[resp-handler-err] {type(e).__name__}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headful, args=[
            # help on some CI/containers
            "--disable-dev-shm-usage", "--no-sandbox",
        ])
        ctx = await browser.new_context(
            viewport={"width": 1400, "height": 1000},
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")
        )
        page = await ctx.new_page()

        # Verbose but useful in CI logs
        page.on("response", on_response)

        print(f"[nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(800)

        # initial tries on both tabs
        await _click_results_tab(page)
        await _scroll_everywhere(page, total_ms=2000)
        await _click_splits_tab(page)
        await _scroll_everywhere(page, total_ms=2000)

        # Alternate tabs and scroll for up to ~120s
        deadline = time.time() + 120
        toggle = True
        while (split_report is None or ind_res is None) and time.time() < deadline:
            if toggle:
                await _click_splits_tab(page)
            else:
                await _click_results_tab(page)
            toggle = not toggle
            await _scroll_everywhere(page, total_ms=1800)
            await page.wait_for_timeout(350)

        # harvest logo URLs from DOM
        try:
            html = await page.content()
            soup = BeautifulSoup(html, "lxml")
            for img in soup.select("img[src*='team-images'][src$='.svg']"):
                src = img.get("src", "")
                alt = (img.get("alt") or "").strip()
                if src:
                    logos.setdefault(alt or src.split("/")[-1], src)
        except Exception:
            pass

        await browser.close()

    # also derive logos from captured JSONs
    def harvest_from_json(blob: Optional[Dict[str,Any]]):
        if not blob: return
        src = (blob.get("_source") or {})
        for arr_key in ("spr","r"):
            rows = src.get(arr_key) or []
            for entry in rows:
                r = entry.get("r") if isinstance(entry.get("r"), dict) else entry
                if not isinstance(r, dict): continue
                a = r.get("a") or {}
                t = a.get("t") or {}
                team = t.get("f") or t.get("n") or ""
                lg   = t.get("lg") or t.get("logo") or ""
                if team and lg:
                    logos.setdefault(team, lg)

    harvest_from_json(split_report)
    harvest_from_json(ind_res)

    return split_report, split_url, ind_res, ind_url, logos

# -------- Fallback builders --------
def build_minimal_reslist_from_dom(html: str) -> Optional[Dict[str,Any]]:
    soup = BeautifulSoup(html, "lxml")
    rows = []
    # generic table scrape; adjust if needed later
    table = soup.find("table")
    if not table:
        # sometimes rows are list items
        for li in soup.select("li"):
            txt = li.get_text(" ", strip=True)
            if txt:
                rows.append({"cells":[txt]})
    else:
        for tr in table.select("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.select("th,td")]
            if len(cells) >= 1:
                rows.append({"cells": cells})
    if rows:
        return {"_source": {"r": rows}, "_note": "fallback_dom_scrape_minimal"}
    return None

# -------- CLI --------
def main():
    ap = argparse.ArgumentParser("Capture split_report + ind_res_list JSON and team colors (CI-hardened)")
    ap.add_argument("--url", required=True, help="Event URL (e.g., https://live.xpresstiming.com/meets/.../2149044)")
    ap.add_argument("--outdir", default="data", help="Root folder to store cached JSONs")
    ap.add_argument("--headful", action="store_true", help="Open a visible browser (optional in CI)")
    ap.add_argument("--force", action="store_true", help="Ignore cache and rebuild")
    args = ap.parse_args()

    eid = event_id_from_url(args.url)
    root = pathlib.Path(args.outdir)
    event_dir = root / eid
    ensure_dir(event_dir)

    split_path = event_dir / "split_report.json"
    reslist_path = event_dir / "ind_res_list.json"
    colors_path = event_dir / "team_colors.json"

    if not args.force and split_path.exists() and reslist_path.exists() and colors_path.exists():
        print(f"cache hit → {event_dir}")
        print("done.")
        return

    # sniff network first
    split_report, split_url, ind_res, ind_url, logos = asyncio.run(
        sniff_event_json(args.url, headful=args.headful)
    )

    # if still missing res list, do a one-shot headless DOM fetch for minimal
    if ind_res is None:
        try:
            # single GET to page; JS won’t run here but we only want static text fallback
            r = requests.get(args.url, timeout=30, headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
            })
            r.raise_for_status()
            dom_fallback = build_minimal_reslist_from_dom(r.text)
            if dom_fallback:
                ind_res = dom_fallback
                ind_url = "(fallback_dom)"
                print("[fallback] built minimal ind_res_list from DOM")
        except Exception as e:
            print(f"[fallback-failed] {type(e).__name__}")

    # require split_report (critical); res_list can be fallback
    if not split_report:
        print("error: split_report not captured. Exiting with code 2 so CI can retry.")
        sys.exit(2)

    # write split_report
    split_path.write_text(json.dumps(split_report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {split_path}")

    # write ind_res_list (guaranteed by now)
    if not ind_res:
        ind_res = {"_source": {"r": []}, "_note": "empty_placeholder"}  # absolute last resort
        print("[warn] writing empty placeholder ind_res_list.json")
    reslist_path.write_text(json.dumps(ind_res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {reslist_path}")

    # write team colors
    colors = build_team_colors_json(logos)
    colors_path.write_text(json.dumps(colors, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {colors_path} ({len(colors)} teams)")

    print(f"[done] cached in {event_dir}")

if __name__ == "__main__":
    main()
