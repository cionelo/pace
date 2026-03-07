#!/usr/bin/env python3
"""
pace_scraper.py
v4.1 - Multi-provider race JSON scraper for PACE (pre-normalization)

Supports (best-effort):
- legacy_spa:
    live.xpresstiming.com
    results.adkinstrak.com
    live.deltatiming.com
    (AthleticLIVE-style SPAs using split_report / ind_res_list)
- rtspt_html:
    https://www.rtspt.com/events/.../xc.../
- leone_xc:
    https://results.leonetiming.com/xc.html?mid=...
- trackscoreboard:
    https://rt.trackscoreboard.com/meets/.../events/...
- pttiming:
    https://live.pttiming.com/xc-ptt.html?mid=...
    (handles single and multi-race pages)
- milesplit_live:
    https://milesplit.live/meets/.../events/.../results/...

Outputs (per detected event id):
  <outdir>/<event_id>/
    split_report.json   # provider-shaped, _source.spr when possible
    ind_res_list.json   # provider-shaped, _source.r when possible
    team_colors.json    # { team: { logo_url, primary_hex, palette } }

This is intentionally provider-agnostic upstream:
- It does not force a single schema yet.
- It creates stable, predictable JSON bundles that pace_normalize.py can consume.

Requirements:
  pip install playwright bs4 lxml requests
  python -m playwright install --with-deps chromium
"""

import argparse
import asyncio
import json
import pathlib
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

# ---------------- generic helpers ----------------

def event_id_from_url(url: str) -> str:
    """Derive a default event ID slug from the URL."""
    u = url.rstrip("/")
    parsed = urlparse(u)
    host = (parsed.netloc or "").lower()
    parts = [p for p in parsed.path.split("/") if p]

    # PTTiming: xc-ptt.html?mid=8189
    if "live.pttiming.com" in host:
        qs = parse_qs(parsed.query)
        mid = (qs.get("mid") or [""])[0]
        return mid or pathlib.Path(parsed.path).stem

    # Leone XC: xc.html?mid=8252
    if "results.leonetiming.com" in host:
        qs = parse_qs(parsed.query)
        mid = (qs.get("mid") or [""])[0]
        return mid or pathlib.Path(parsed.path).stem

    # MileSplit Live: /meets/713752/events/2/results/F/M
    if "milesplit.live" in host and "meets" in parts and "events" in parts:
        try:
            meet_idx = parts.index("meets")
            meet_id = parts[meet_idx + 1]
        except (ValueError, IndexError):
            meet_id = "ms"
        try:
            ev_idx = parts.index("events")
            ev_id = parts[ev_idx + 1]
        except (ValueError, IndexError):
            ev_id = "evt"
        gender = None
        # crude: last two segments often like F/M, M/F, etc.
        if len(parts) >= 2 and parts[-2] in ("F", "M"):
            gender = parts[-2]
        slug = f"{meet_id}_{ev_id}"
        if gender:
            slug += f"_{gender}"
        return slug

    # TrackScoreboard: /meets/{meet_id}/events/{event_id}[/{round}]
    if ("rt.trackscoreboard.com" in host
            or "lancer.trackscoreboard.com" in host
            or "live.halfmiletiming.com" in host):
        try:
            meet_idx = parts.index("meets")
            meet_id = parts[meet_idx + 1]
        except (ValueError, IndexError):
            meet_id = parts[-1] if parts else "ts"
        ev_id = None
        round_seg = None
        _ROUND_SEGS = {"prelim", "preliminary", "prelims", "final", "finals", "heat", "semis"}
        if "events" in parts:
            try:
                ev_idx = parts.index("events")
                ev_id = parts[ev_idx + 1]
                # /events/{id}/{round} — include round so prelim/final get distinct dirs
                if len(parts) > ev_idx + 2 and parts[ev_idx + 2].lower() in _ROUND_SEGS:
                    round_seg = parts[ev_idx + 2].lower()
            except (ValueError, IndexError):
                ev_id = None
        if ev_id and round_seg:
            return f"{meet_id}_{ev_id}_{round_seg}"
        return f"{meet_id}_{ev_id}" if ev_id else meet_id

    # Legacy SPA XC: /meets/.../events/xc/2153041
    if "events" in parts:
        return parts[-1]

    return parts[-1] if parts else host.replace(".", "_") or "event"


def ensure_dir(p: pathlib.Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def detect_provider(url: str) -> str:
    u = url.lower()

    if ("live.xpresstiming.com" in u
        or "results.adkinstrak.com" in u
        or "live.deltatiming.com" in u
        or "live.rapidresultstiming.com" in u
        or "athleticlive" in u
        or "live.athletictiming.net" in u
        or "live.jdlfasttrack.com" in u
        or "live.timinginc.com" in u
        or "blueridgetiming.live" in u
        or "live.fstiming.com" in u
        or "live.herostiming.com" in u
        or "live.athletic.net" in u
        or "live.dcracetiming.com" in u
        or "snapresults.snaptiming.com" in u):
        return "legacy_spa"

    if "results.leonetiming.com" in u and "xc.html" in u:
        return "leone_xc"

    if "rtspt.com" in u:
        return "rtspt_html"

    if "rt.trackscoreboard.com" in u:
        return "trackscoreboard"

    if "lancer.trackscoreboard.com" in u or "live.halfmiletiming.com" in u:
        return "trackscoreboard_html"

    if "live.pttiming.com" in u:
        return "pttiming"

    if "milesplit.live" in u:
        return "milesplit_live"

    return "unknown"


# ---------------- team colors helpers ----------------

HEX_RE = re.compile(r'#[0-9A-Fa-f]{6}')

def extract_hexes(svg_text: str) -> List[str]:
    found = HEX_RE.findall(svg_text or "")
    uniq = sorted(set(h.lower() for h in found))
    return [h.upper() for h in uniq]

def pick_primary(hexes: List[str]) -> Optional[str]:
    bad = {
        "#000000", "#0D0D0D", "#111111", "#1A1A1A", "#212121",
        "#FFFFFF", "#FFFDFD", "#FEFEFE", "#F6F6F6"
    }
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
            "palette": hexes,
        }
    return out


# ---------------- legacy SPA (Xpress / AdkinsTrak / DeltaTiming) ----------------

def _looks_like_legacy_json(u: str) -> bool:
    ul = u.lower()
    return (
        "split_report" in ul
        or "ind_res_list" in ul
        or "ind_res_list_doc" in ul
        or ("res_list" in ul and "/api/" in ul)
        or ("result" in ul and "api" in ul)
    )

def _is_legacy_split(u: str) -> bool:
    return "split_report" in u.lower()

def _is_legacy_reslist(u: str) -> bool:
    ul = u.lower()
    return ("ind_res_list" in ul) or ("ind_res_list_doc" in ul) or ("res_list" in ul)

async def capture_legacy_spa(url: str, headful: bool) -> Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]:
    from playwright.async_api import async_playwright

    split_report: Optional[Dict[str, Any]] = None
    ind_res: Optional[Dict[str, Any]] = None
    logos: Dict[str, str] = {}

    async def on_response(resp):
        nonlocal split_report, ind_res
        try:
            u = resp.url
            if not _looks_like_legacy_json(u):
                return
            try:
                data = await resp.json()
            except Exception:
                try:
                    txt = await resp.text()
                    data = json.loads(txt)
                except Exception:
                    print(f"[legacy json-miss] {u}")
                    return

            if _is_legacy_split(u) and split_report is None:
                split_report = data
                print(f"[legacy] captured split_report {u}")
            elif _is_legacy_reslist(u) and ind_res is None:
                ind_res = data
                print(f"[legacy] captured ind_res_list {u}")
        except Exception as e:
            print(f"[legacy resp err] {type(e).__name__}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        page.on("response", on_response)

        print(f"[legacy nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(800)

        async def scroll_everywhere(total_ms=2400):
            t0 = time.time()
            step_px = 900
            while (time.time() - t0) * 1000 < total_ms:
                await page.mouse.wheel(0, step_px)
                await page.wait_for_timeout(160)
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

        async def click_labels(labels: List[str], tag: str):
            for text in labels:
                try:
                    await page.get_by_role("tab", name=text).click(timeout=900)
                    await page.wait_for_timeout(250)
                    print(f"[legacy ui] {tag} via role: {text}")
                    return True
                except Exception:
                    try:
                        await page.get_by_text(text, exact=False).click(timeout=900)
                        await page.wait_for_timeout(250)
                        print(f"[legacy ui] {tag} via text: {text}")
                        return True
                    except Exception:
                        continue
            return False

        await click_labels(["Results","Individuals","Athletes"], "results")
        await scroll_everywhere()
        await click_labels(["Splits","Split"], "splits")
        await scroll_everywhere()

        deadline = time.time() + 90
        toggle = True
        while (split_report is None or ind_res is None) and time.time() < deadline:
            if toggle:
                await click_labels(["Splits","Split"], "splits")
            else:
                await click_labels(["Results","Individuals","Athletes"], "results")
            toggle = not toggle
            await scroll_everywhere()
            await page.wait_for_timeout(300)

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

    if split_report is None:
        split_report = {"_source": {"spr": []}, "_provider": "legacy_spa", "_note": "missing_split_report"}
        print("[legacy] missing split_report; using empty spr")

    if ind_res is None:
        ind_res = {"_source": {"r": []}, "_provider": "legacy_spa", "_note": "missing_ind_res_list"}
        print("[legacy] missing ind_res_list; using empty r")

    return split_report, ind_res, logos


# ---------------- RTSpt / Raspy HTML ----------------

def parse_rtspt_html(url: str) -> Tuple[Dict[str,Any], Dict[str,Any]]:
    print(f"[rtspt] GET {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")

    table = None
    for tag in soup.find_all(["h2","h3","h4","h5"]):
        if "individual results" in tag.get_text(" ", strip=True).lower():
            table = tag.find_next("table")
            if table:
                break
    if not table:
        table = soup.find("table")

    if not table:
        print("[rtspt] no table; empty")
        return (
            {"_source": {"spr": []}, "_provider": "rtspt_html"},
            {"_source": {"r": []}, "_provider": "rtspt_html"},
        )

    headers = [th.get_text(" ", strip=True) for th in table.select("tr th")]
    hmap = {h.lower(): i for i, h in enumerate(headers)}

    def get(cells, key, default=""):
        i = hmap.get(key.lower())
        if i is None or i >= len(cells):
            return default
        return cells[i].get_text(" ", strip=True)

    spr_rows = []
    res_rows = []

    for tr in table.select("tr")[1:]:
        tds = tr.select("td")
        if not tds:
            continue

        place = get(tds, "pl", get(tds, "place", ""))
        name = get(tds, "name", get(tds, "athlete", ""))
        team = get(tds, "team", "")
        tm = get(tds, "time", get(tds, "final", ""))

        athlete = {"n": name, "t": {"n": team, "f": team, "lg": ""}}
        res_rows.append({"r": {"a": athlete, "p": place, "tm": tm}})
        spr_rows.append({"r": {"a": athlete, "p": place, "tm": tm, "splits": []}})

    split_report = {"_source": {"spr": spr_rows}, "_provider": "rtspt_html"}
    ind_res = {"_source": {"r": res_rows}, "_provider": "rtspt_html"}
    print(f"[rtspt] parsed {len(res_rows)} rows")

    return split_report, ind_res


# ---------------- Leone Timing XC compiled ----------------

def parse_leone_xc(url: str) -> Tuple[Dict[str,Any], Dict[str,Any]]:
    print(f"[leone] GET {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")

    compiled_link = None
    for a in soup.find_all("a"):
        txt = (a.get_text(" ", strip=True) or "").lower()
        href = a.get("href") or ""
        if "compiled" in txt and "html" in txt and href:
            compiled_link = urljoin(url, href)
            break

    if not compiled_link:
        print("[leone] no compiled link; empty")
        return (
            {"_source": {"spr": []}, "_provider": "leone_xc"},
            {"_source": {"r": []}, "_provider": "leone_xc"},
        )

    print(f"[leone] compiled -> {compiled_link}")
    cr = requests.get(compiled_link, timeout=30)
    cr.raise_for_status()
    csoup = BeautifulSoup(cr.text, "lxml")

    table = csoup.find("table")
    if not table:
        print("[leone] no table; empty")
        return (
            {"_source": {"spr": []}, "_provider": "leone_xc"},
            {"_source": {"r": []}, "_provider": "leone_xc"},
        )

    headers = [th.get_text(" ", strip=True) for th in table.select("tr th")]
    hmap = {h.lower(): i for i, h in enumerate(headers)}

    def get(cells, key, default=""):
        i = hmap.get(key.lower())
        if i is None or i >= len(cells):
            return default
        return cells[i].get_text(" ", strip=True)

    spr_rows = []
    res_rows = []

    for tr in table.select("tr")[1:]:
        tds = tr.select("td")
        if not tds:
            continue

        place = get(tds, "pl", get(tds, "place", ""))
        name = get(tds, "name", get(tds, "athlete", ""))
        team = get(tds, "team", "")
        tm = get(tds, "time", get(tds, "final", ""))

        athlete = {"n": name, "t": {"n": team, "f": team, "lg": ""}}
        res_rows.append({"r": {"a": athlete, "p": place, "tm": tm}})
        spr_rows.append({"r": {"a": athlete, "p": place, "tm": tm, "splits": []}})

    split_report = {"_source": {"spr": spr_rows}, "_provider": "leone_xc"}
    ind_res = {"_source": {"r": res_rows}, "_provider": "leone_xc"}
    print(f"[leone] parsed {len(res_rows)} rows")

    return split_report, ind_res


# ---------------- TrackScoreboard / Raspy ----------------

def _looks_like_ts_json(u: str) -> bool:
    ul = u.lower()
    return ("trackscoreboard" in ul) and ("result" in ul or "split" in ul or "api" in ul)

def _is_ts_split(u: str) -> bool:
    return "split" in u.lower()

def _is_ts_reslist(u: str) -> bool:
    return "result" in u.lower()

async def capture_trackscoreboard(url: str, headful: bool) -> Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]:
    from playwright.async_api import async_playwright

    split_report: Optional[Dict[str, Any]] = None
    ind_res: Optional[Dict[str, Any]] = None

    async def on_response(resp):
        nonlocal split_report, ind_res
        try:
            u = resp.url
            if not _looks_like_ts_json(u):
                return
            try:
                data = await resp.json()
            except Exception:
                try:
                    txt = await resp.text()
                    data = json.loads(txt)
                except Exception:
                    print(f"[ts json-miss] {u}")
                    return

            if _is_ts_split(u) and split_report is None:
                split_report = {"_source": {"spr": data}, "_provider": "trackscoreboard_raw"}
                print(f"[ts] captured split JSON {u}")
            elif _is_ts_reslist(u) and ind_res is None:
                ind_res = {"_source": {"r": data}, "_provider": "trackscoreboard_raw"}
                print(f"[ts] captured result JSON {u}")
        except Exception as e:
            print(f"[ts resp err] {type(e).__name__}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        page.on("response", on_response)

        print(f"[ts nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1200)

        deadline = time.time() + 60
        while (split_report is None or ind_res is None) and time.time() < deadline:
            await page.mouse.wheel(0, 800)
            await page.wait_for_timeout(400)

        await browser.close()

    if split_report is None:
        split_report = {"_source": {"spr": []}, "_provider": "trackscoreboard_raw", "_note": "missing_split"}
        print("[ts] no split JSON; using empty spr")

    if ind_res is None:
        ind_res = {"_source": {"r": []}, "_provider": "trackscoreboard_raw", "_note": "missing_results"}
        print("[ts] no result JSON; using empty r")

    return split_report, ind_res, {}


# ---------------- TrackScoreboard HTML (v4.1.187 Angular SSR) ----------------
# Handles lancer.trackscoreboard.com and live.halfmiletiming.com.
# These SPAs are server-side rendered — all data is in the DOM, no XHR.

async def capture_trackscoreboard_html(url: str, headful: bool) -> Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        print(f"[ts-html nav] {url}")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3000)

        # ---- Results tab (default active) ----
        r_rows = await page.evaluate("""
            () => {
                const eventTabs = document.querySelector('.event-tabs');
                if (!eventTabs) return [];
                const body = Array.from(eventTabs.querySelectorAll('mat-tab-body'))
                    .find(b => b.classList.contains('mat-mdc-tab-body-active'));
                if (!body) return [];
                const rows = Array.from(body.querySelectorAll('tr.mat-mdc-row'));
                return rows.map(tr => {
                    const placeCell  = tr.querySelector('td.place-col');
                    const nameCell   = tr.querySelector('td.name-col');
                    const timeCell   = tr.querySelector('td.time-col');
                    const markSpan   = tr.querySelector('span.mark-value');
                    const nameLines  = (nameCell?.innerText || '').split('\\n')
                        .map(s => s.trim()).filter(Boolean);
                    return { r: {
                        Name:  nameLines[0] || '',
                        Team:  nameLines[1] || '',
                        Year:  nameLines[2] || '',
                        Place: parseInt((placeCell?.innerText || '').trim()) || null,
                        Time:  (timeCell?.querySelector('span.mark-value') || markSpan || timeCell)
                               ?.innerText?.trim() || '',
                    }};
                }).filter(row => row.r.Name || row.r.Time);
            }
        """)
        print(f"[ts-html] {len(r_rows)} result rows")

        # ---- Splits tab (if present) ----
        spr_rows: List[Dict[str,Any]] = []
        try:
            splits_tab = page.locator('.event-tabs .mdc-tab__text-label', has_text='Splits')
            if await splits_tab.count() > 0:
                await splits_tab.first.click(timeout=4000)
                await page.wait_for_timeout(2500)
                spr_rows = await page.evaluate("""
                    () => {
                        const eventTabs = document.querySelector('.event-tabs');
                        if (!eventTabs) return [];
                        const body = Array.from(eventTabs.querySelectorAll('mat-tab-body'))
                            .find(b => b.classList.contains('mat-mdc-tab-body-active'));
                        if (!body) return [];
                        const table = body.querySelector('table');
                        if (!table) return [];

                        // Build split labels from header cells after TIME
                        const headers = Array.from(table.querySelectorAll('th'))
                            .map(th => th.innerText.trim());
                        const timeIdx = headers.findIndex(h => h === 'TIME');
                        const splitLabels = headers.slice(timeIdx + 1).filter(h => h);

                        return Array.from(table.querySelectorAll('tr.mat-mdc-row')).map(tr => {
                            const nameCell  = tr.querySelector('td.name-col');
                            const nameLines = (nameCell?.innerText || '').split('\\n')
                                .map(s => s.trim()).filter(Boolean);
                            const splitCells = Array.from(tr.querySelectorAll('td.split-col'));
                            const splits = splitCells.map((cell, i) => {
                                // cell text: "cumulative\\nlap" or just "cumulative"
                                const parts = cell.innerText.trim().split('\\n')
                                    .map(s => s.trim()).filter(Boolean);
                                return { label: splitLabels[i] || ('S' + (i+1)), tm: parts[0] || '' };
                            }).filter(sp => sp.tm);
                            if (!nameLines[0] && splits.length === 0) return null;
                            return { r: { name: nameLines[0] || '', team: nameLines[1] || '', splits } };
                        }).filter(Boolean);
                    }
                """)
                print(f"[ts-html] {len(spr_rows)} split rows")
            else:
                print("[ts-html] no Splits tab")
        except Exception as e:
            print(f"[ts-html] splits err: {type(e).__name__}: {e}")

        # ---- Team logos ----
        logos: Dict[str, str] = {}
        try:
            html = await page.content()
            soup = BeautifulSoup(html, "lxml")
            for img in soup.select("img[src*='logos']"):
                src = img.get("src", "")
                alt = (img.get("alt") or "").strip()
                if src:
                    logos.setdefault(alt or src.split("/")[-1], src)
        except Exception:
            pass

        await browser.close()

    split_report: Dict[str, Any] = {"_source": {"spr": spr_rows}, "_provider": "trackscoreboard_html"}
    ind_res: Dict[str, Any] = {"_source": {"r": r_rows}, "_provider": "trackscoreboard_html"}
    if not spr_rows:
        split_report["_note"] = "no_splits_tab"
    if not r_rows:
        ind_res["_note"] = "no_results"
        print("[ts-html] no result rows captured")

    return split_report, ind_res, logos


# ---------------- PT Timing (single or multi-race) ----------------

def _looks_like_pt_json(u: str) -> bool:
    ul = u.lower()
    return ("pttiming.com" in ul) and ("json" in ul or "result" in ul or "xc" in ul)

def _safe_json_attempt(txt: str) -> Optional[Any]:
    try:
        return json.loads(txt)
    except Exception:
        return None

async def capture_pttiming(url: str, headful: bool) -> Dict[str, Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]]:
    """
    Returns mapping: event_id -> (split_report, ind_res_list, logos)
    For multi-race pages, attempts to separate by race metadata.
    """
    from playwright.async_api import async_playwright

    results_payloads: List[Any] = []
    splits_payloads: List[Any] = []

    async def on_response(resp):
        try:
            u = resp.url
            if not _looks_like_pt_json(u):
                return
            try:
                data = await resp.json()
            except Exception:
                txt = await resp.text()
                data = _safe_json_attempt(txt)
                if data is None:
                    print(f"[pt json-miss] {u}")
                    return
            if "split" in u.lower():
                splits_payloads.append(data)
                print(f"[pt] saw split-like {u}")
            else:
                results_payloads.append(data)
                print(f"[pt] saw result-like {u}")
        except Exception as e:
            print(f"[pt resp err] {type(e).__name__}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1600, "height": 950})
        page = await ctx.new_page()
        page.on("response", on_response)

        print(f"[pt nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1200)

        deadline = time.time() + 45
        while time.time() < deadline:
            await page.mouse.wheel(0, 800)
            await page.wait_for_timeout(300)

        await browser.close()

    events: Dict[str, Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]] = {}

    def make_id_from_meta(meta: Dict[str,Any], fallback_prefix: str, idx: int) -> str:
        name = (
            meta.get("EventName")
            or meta.get("RaceName")
            or meta.get("Name")
            or meta.get("Gender")
            or f"{fallback_prefix}_{idx+1}"
        )
        slug = re.sub(r"[^A-Za-z0-9]+", "_", str(name)).strip("_")
        return slug or f"{fallback_prefix}_{idx+1}"

    if not results_payloads and not splits_payloads:
        base_id = event_id_from_url(url)
        events[base_id] = (
            {"_source": {"spr": []}, "_provider": "pttiming", "_note": "no_payload"},
            {"_source": {"r": []}, "_provider": "pttiming", "_note": "no_payload"},
            {}
        )
        print("[pt] no JSON captured; wrote empty shells")
        return events

    if len(results_payloads) <= 1 and len(splits_payloads) <= 1:
        base_id = event_id_from_url(url)
        split_report = {"_source": {"spr": []}, "_provider": "pttiming"}
        ind_res = {"_source": {"r": []}, "_provider": "pttiming"}

        if results_payloads:
            rp = results_payloads[0]
            ind_res["_source"]["r"] = rp if isinstance(rp, list) else [rp]
        if splits_payloads:
            sp = splits_payloads[0]
            split_report["_source"]["spr"] = sp if isinstance(sp, list) else [sp]

        events[base_id] = (split_report, ind_res, {})
        print(f"[pt] single-race mapped -> {base_id}")
        return events

    base_prefix = event_id_from_url(url) or "pt"

    for idx, payload in enumerate(results_payloads):
        if isinstance(payload, dict):
            meta = payload.get("Meta") or payload.get("Race") or payload
        else:
            meta = {}
        eid = make_id_from_meta(meta, base_prefix, idx)
        ind = {
            "_source": {
                "r": payload if isinstance(payload, list) else [payload]
            },
            "_provider": "pttiming"
        }
        if idx < len(splits_payloads):
            spr_data = splits_payloads[idx]
            split = {
                "_source": {
                    "spr": spr_data if isinstance(spr_data, list) else [spr_data]
                },
                "_provider": "pttiming"
            }
        else:
            split = {"_source": {"spr": []}, "_provider": "pttiming"}
        events[eid] = (split, ind, {})
        print(f"[pt] multi-race mapped -> {eid}")

    return events


# ---------------- MileSplit Live ----------------

def _looks_like_ms_json(u: str) -> bool:
    ul = u.lower()
    return ("milesplit.live" in ul) and ("/api/" in ul or "results" in ul or "meets" in ul)

def _is_ms_results(u: str) -> bool:
    ul = u.lower()
    return "result" in ul or "results" in ul

def _is_ms_splits(u: str) -> bool:
    ul = u.lower()
    return "split" in ul or "lap" in ul or "checkpoint" in ul

async def capture_milesplit_live(url: str, headful: bool) -> Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]:
    from playwright.async_api import async_playwright

    ind_res: Optional[Dict[str, Any]] = None
    split_report: Optional[Dict[str, Any]] = None

    async def on_response(resp):
        nonlocal ind_res, split_report
        try:
            u = resp.url
            if not _looks_like_ms_json(u):
                return

            try:
                data = await resp.json()
            except Exception:
                try:
                    txt = await resp.text()
                    data = json.loads(txt)
                except Exception:
                    print(f"[ms json-miss] {u}")
                    return

            if isinstance(data, dict):
                if "results" in data and ind_res is None:
                    rows = data["results"]
                    if not isinstance(rows, list):
                        rows = [rows]
                    ind_res = {"_source": {"r": rows}, "_provider": "milesplit_live"}
                    print(f"[ms] captured results from {u}")

                if split_report is None:
                    for k in ("splits", "laps", "checkpoint_splits"):
                        if k in data:
                            val = data[k]
                            if not isinstance(val, list):
                                val = [val]
                            split_report = {
                                "_source": {"spr": val},
                                "_provider": "milesplit_live"
                            }
                            print(f"[ms] captured splits from {u} via key '{k}'")
                            break

            elif isinstance(data, list):
                if data and isinstance(data[0], dict) and ind_res is None and _is_ms_results(u):
                    ind_res = {"_source": {"r": data}, "_provider": "milesplit_live"}
                    print(f"[ms] captured list-style results from {u}")

                if data and isinstance(data[0], dict) and split_report is None and _is_ms_splits(u):
                    split_report = {"_source": {"spr": data}, "_provider": "milesplit_live"}
                    print(f"[ms] captured list-style splits from {u}")

        except Exception as e:
            print(f"[ms resp err] {type(e).__name__}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        page.on("response", on_response)

        print(f"[ms nav] {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1200)

        deadline = time.time() + 45
        while time.time() < deadline and (ind_res is None or split_report is None):
            await page.mouse.wheel(0, 800)
            await page.wait_for_timeout(300)

        await browser.close()

    if ind_res is None:
        ind_res = {
            "_source": {"r": []},
            "_provider": "milesplit_live",
            "_note": "no_results_detected"
        }
        print("[ms] no results JSON; using empty r")

    if split_report is None:
        split_report = {
            "_source": {"spr": []},
            "_provider": "milesplit_live",
            "_note": "no_splits_detected"
        }
        print("[ms] no splits JSON; using empty spr")

    return split_report, ind_res, {}


# ---------------- write bundle ----------------

def write_event_bundle(outdir: pathlib.Path,
                       event_id: str,
                       split_report: Dict[str,Any],
                       ind_res: Dict[str,Any],
                       logos: Dict[str,str]) -> None:
    event_dir = outdir / event_id
    ensure_dir(event_dir)

    split_path = event_dir / "split_report.json"
    reslist_path = event_dir / "ind_res_list.json"
    colors_path = event_dir / "team_colors.json"

    if not isinstance(split_report, dict):
        split_report = {"_source": {"spr": []}, "_note": "invalid_split_report"}
    if not isinstance(ind_res, dict):
        ind_res = {"_source": {"r": []}, "_note": "invalid_ind_res_list"}

    split_path.write_text(json.dumps(split_report, ensure_ascii=False, indent=2), encoding="utf-8")
    reslist_path.write_text(json.dumps(ind_res, ensure_ascii=False, indent=2), encoding="utf-8")

    colors = build_team_colors_json(logos) if logos else {}
    colors_path.write_text(json.dumps(colors, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[write] {event_id} -> {split_path}, {reslist_path}, {colors_path}")


# ---------------- main CLI ----------------

def main():
    ap = argparse.ArgumentParser("PACE multi-provider race scraper (pre-normalization)")
    ap.add_argument("--url", required=True, help="Race URL (Xpress, Raspy, Leone, PT, MileSplit, etc.)")
    ap.add_argument("--outdir", default="data", help="Root folder to store cached JSON bundles")
    ap.add_argument("--headful", action="store_true", help="Visible browser (for local debugging)")
    ap.add_argument("--force", action="store_true", help="Ignore cache if already present")
    args = ap.parse_args()

    provider = detect_provider(args.url)
    base_eid = event_id_from_url(args.url)
    outdir = pathlib.Path(args.outdir)
    ensure_dir(outdir)

    print(f"[meta] provider={provider} base_eid={base_eid} outdir={outdir}")

    if not args.force and provider != "pttiming":
        event_dir = outdir / base_eid
        if (event_dir / "split_report.json").exists() and \
           (event_dir / "ind_res_list.json").exists() and \
           (event_dir / "team_colors.json").exists():
            print(f"[meta] cache hit -> {event_dir}")
            return

    if provider == "legacy_spa":
        split_report, ind_res, logos = asyncio.run(
            capture_legacy_spa(args.url, headful=args.headful)
        )
        write_event_bundle(outdir, base_eid, split_report, ind_res, logos)

    elif provider == "rtspt_html":
        split_report, ind_res = parse_rtspt_html(args.url)
        write_event_bundle(outdir, base_eid, split_report, ind_res, {})

    elif provider == "leone_xc":
        split_report, ind_res = parse_leone_xc(args.url)
        write_event_bundle(outdir, base_eid, split_report, ind_res, {})

    elif provider == "trackscoreboard":
        split_report, ind_res, logos = asyncio.run(
            capture_trackscoreboard(args.url, headful=args.headful)
        )
        write_event_bundle(outdir, base_eid, split_report, ind_res, logos)

    elif provider == "trackscoreboard_html":
        split_report, ind_res, logos = asyncio.run(
            capture_trackscoreboard_html(args.url, headful=args.headful)
        )
        write_event_bundle(outdir, base_eid, split_report, ind_res, logos)

    elif provider == "pttiming":
        events = asyncio.run(
            capture_pttiming(args.url, headful=args.headful)
        )
        for eid, (split_report, ind_res, logos) in events.items():
            write_event_bundle(outdir, eid, split_report, ind_res, logos)

    elif provider == "milesplit_live":
        split_report, ind_res, logos = asyncio.run(
            capture_milesplit_live(args.url, headful=args.headful)
        )
        write_event_bundle(outdir, base_eid, split_report, ind_res, logos)

    else:
        print("[warn] unknown provider; writing empty shell")
        write_event_bundle(
            outdir,
            base_eid,
            {"_source": {"spr": []}, "_provider": "unknown"},
            {"_source": {"r": []}, "_provider": "unknown"},
            {}
        )

if __name__ == "__main__":
    main()
