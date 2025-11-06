# splits_scraper.py
# v2.0 — capture split_report + ind_res_list JSON and team colors
# Saves under: data/<event_id>/{split_report.json, ind_res_list.json, team_colors.json}
#
# Requires:
#   pip install playwright bs4 lxml requests
#   python -m playwright install chromium

# Usage:
#   python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044"
#
# Run headful (first time recommended so JS loads splits):
#   python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --headful
#
# Force rebuild / overwrite cache:
#   python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --force
#
# Custom output directory (default = ./data):
#   python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --outdir "./race_cache"
#
# What gets created (per event ID):
#   data/<event_id>/
#     split_report.json     # per-split timing data + place movement
#     ind_res_list.json     # result labels, PR/SB flags, bib, team text labels
#     team_colors.json      # primary hex + palette extracted from SVG logos


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
    # prefer non-white/black-ish colors
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

# -------- Playwright capture --------
def _looks_like_event_json(u: str) -> bool:
    # accept both key feeds regardless of suffix/content-type
    ul = u.lower()
    return ("split_report" in ul) or ("ind_res_list_doc" in ul)

def _is_split(u: str) -> bool:
    return "split_report" in u.lower()

def _is_reslist(u: str) -> bool:
    return "ind_res_list_doc" in u.lower()

async def _scroll_everywhere(page, total_ms=20000):
    # window scroll
    t0 = time.time()
    step_px = 900
    while (time.time() - t0) * 1000 < total_ms:
        await page.mouse.wheel(0, step_px)
        await page.wait_for_timeout(160)
    # scroll all overflow containers
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

async def _click_splits_tab(page):
    labels = ["Splits", "SPLITS", "Split"]
    for text in labels:
        try:
            await page.get_by_role("tab", name=text).click(timeout=900)
            await page.wait_for_timeout(450)
            print(f"[ui] clicked tab via role: {text}")
            return True
        except Exception:
            try:
                await page.get_by_text(text, exact=False).click(timeout=900)
                await page.wait_for_timeout(450)
                print(f"[ui] clicked tab via text: {text}")
                return True
            except Exception:
                continue
    return False

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
            except Exception:
                # fallback: text->json
                try:
                    txt = await resp.text()
                    data = json.loads(txt)
                except Exception:
                    print(f"[saw event json but parse failed] {u}")
                    return
            if _is_split(u):
                split_report, split_url = data, u
                print(f"[captured split_report] {u}")
            elif _is_reslist(u):
                ind_res, ind_url = data, u
                print(f"[captured ind_res_list_doc] {u}")
        except Exception:
            pass

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headful)
        ctx = await browser.new_context(
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")
        )
        page = await ctx.new_page()
        page.on("response", lambda r: asyncio.create_task(on_response(r)))

        print(f"[nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1000)

        await _click_splits_tab(page)
        await _scroll_everywhere(page, total_ms=20000)

        # nudge up to 60s, re-clicking and scrolling
        deadline = time.time() + 60
        while (split_report is None or ind_res is None) and time.time() < deadline:
            await _scroll_everywhere(page, total_ms=2500)
            await page.wait_for_timeout(300)
            await _click_splits_tab(page)

        # collect possible logo urls from DOM as fallback
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
        # split_report uses spr[], ind_res_list uses r[]
        for arr_key in ("spr","r"):
            rows = src.get(arr_key) or []
            for entry in rows:
                # normalize record shape
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

# -------- CLI --------
def main():
    ap = argparse.ArgumentParser("Capture split_report + ind_res_list JSON and team colors")
    ap.add_argument("--url", required=True, help="Event URL (e.g., https://live.xpresstiming.com/meets/.../2149044)")
    ap.add_argument("--outdir", default="data", help="Root folder to store cached JSONs")
    ap.add_argument("--headful", action="store_true", help="Open a visible browser (recommended first run)")
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

    split_report, split_url, ind_res, ind_url, logos = asyncio.run(
        sniff_event_json(args.url, headful=args.headful)
    )

    if not split_report:
        print("error: split_report not captured. Run with --headful, click 'Splits', scroll until 1K/2K/3K are visible.")
        sys.exit(1)

    # write split_report
    split_path.write_text(json.dumps(split_report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {split_path}")

    # write ind_res_list if captured
    if ind_res:
        reslist_path.write_text(json.dumps(ind_res, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {reslist_path}")
    else:
        print("warn: ind_res_list not captured; UI labels like PR/SB may be limited this run.")

    # write team colors
    colors = build_team_colors_json(logos)
    colors_path.write_text(json.dumps(colors, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {colors_path} ({len(colors)} teams)")

    print(f"[done] cached in {event_dir}")

if __name__ == "__main__":
    main()
