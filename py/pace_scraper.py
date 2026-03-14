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

    # FlashResults: /2026_Meets/Indoor/02-26_ACC/025-2_compiled.htm
    if "flashresults.com" in host:
        filename = parts[-1] if parts else ""
        meet_dir = parts[-2] if len(parts) >= 2 else "fr"
        if "_compiled" in filename:
            event_code = filename.split("_compiled")[0]
            return f"{meet_dir}_{event_code}"
        return filename.split(".")[0] or meet_dir

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
        or "snapresults.snaptiming.com" in u
        or "armorytrack.live" in u
        or "results.lakeshoreathleticservices.com" in u):
        return "legacy_spa"

    if "results.leonetiming.com" in u and "xc.html" in u:
        return "leone_xc"

    if "rtspt.com" in u:
        return "rtspt_html"

    if "rt.trackscoreboard.com" in u or "lancer.trackscoreboard.com" in u or "live.halfmiletiming.com" in u:
        return "trackscoreboard_html"

    if "live.pttiming.com" in u:
        return "pttiming"

    if "milesplit.live" in u:
        return "milesplit_live"

    if "flashresults.com" in u:
        return "flashresults"

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


# ---------------- PT Timing (Firebase RTDB) ----------------

def capture_pttiming(url: str, headful: bool) -> Dict[str, Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]]:
    """
    Fetches pttiming data directly from Firebase Realtime Database REST API.
    pttiming pages use Firebase RTDB (not XHR), so Playwright XHR interception
    cannot capture the data. The RTDB is publicly readable.

    Returns mapping: event_id -> (split_report, ind_res_list, logos)
    Each event_id corresponds to one race (ENR key from MeetEvents).
    """
    import urllib.request as _req

    def _fb_fetch(fb_url: str) -> Any:
        try:
            with _req.urlopen(fb_url, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            print(f"[pt] Firebase fetch error {fb_url}: {e}")
            return None

    def _empty_events(note: str) -> Dict[str, Tuple[Dict,Dict,Dict]]:
        base_id = event_id_from_url(url)
        return {base_id: (
            {"_source": {"spr": []}, "_provider": "pttiming", "_note": note},
            {"_source": {"r": []}, "_provider": "pttiming", "_note": note},
            {}
        )}

    # Extract meet ID from ?mid=XXXX
    mid_m = re.search(r"mid=(\d+)", url, re.IGNORECASE)
    if not mid_m:
        print(f"[pt] no mid= in URL: {url}")
        return _empty_events("no_mid_param")
    mid = mid_m.group(1)

    # Get Firebase base URL from page HTML (default to known URL)
    fb_base = "https://ptt-franklin.firebaseio.com/"
    try:
        page_req = _req.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with _req.urlopen(page_req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        m = re.search(r'fbURL\s*=\s*["\']([^"\']+)["\']', html)
        if m:
            fb_base = m.group(1).rstrip("/") + "/"
    except Exception as e:
        print(f"[pt] HTML fetch failed ({e}); using default fbURL")

    print(f"[pt] Firebase base: {fb_base}  mid: {mid}")
    fb_data = _fb_fetch(fb_base + mid + ".json")
    if not isinstance(fb_data, dict):
        print(f"[pt] Firebase returned no data for mid={mid}")
        return _empty_events("firebase_null")

    # Extract meet logo
    logos: Dict[str, str] = {}
    meta = fb_data.get("Meta") or {}
    logo_file = meta.get("logo") if isinstance(meta, dict) else None
    if logo_file:
        logos["primary"] = f"https://live.pttiming.com/img/{logo_file}"

    meet_events = fb_data.get("MeetEvents") or {}
    if not isinstance(meet_events, dict):
        print(f"[pt] no MeetEvents in Firebase data for mid={mid}")
        return _empty_events("no_meet_events")

    events: Dict[str, Tuple[Dict,Dict,Dict]] = {}

    for enr, evt in meet_events.items():
        if not isinstance(evt, dict):
            continue
        # Skip events with no entry data
        ed = evt.get("ED") or {}
        if not isinstance(ed, dict) or not ed:
            continue
        # Only include completed/official events
        status = evt.get("S", "")
        if status not in ("Complete", "Official", "InProgress"):
            continue

        entries = list(ed.values())

        # Split distance labels from SL (comma-sep meters, e.g. "209,409,609,809,1009,1209,1409,1609")
        sl_raw = evt.get("SL") or ""
        sl_labels = [s.strip() + "m" for s in str(sl_raw).split(",") if s.strip()] if sl_raw else []

        eid = f"{mid}_{enr.replace('-', '_')}"
        split_report = {
            "_source": {
                "spr": entries,
                "sl": sl_labels,
            },
            "_provider": "pttiming",
            "_event_name": evt.get("N", ""),
            "_enr": enr,
        }
        ind_res = {
            "_source": {"r": entries},
            "_provider": "pttiming",
            "_event_name": evt.get("N", ""),
        }
        events[eid] = (split_report, ind_res, logos)
        has_spd = any(isinstance(e, dict) and isinstance(e.get("SPD"), list) for e in entries)
        print(f"[pt] {eid} -> {evt.get('N','')} ({len(entries)} athletes, has_spd={has_spd})")

    if not events:
        print(f"[pt] no complete events found for mid={mid}")
        return _empty_events("no_complete_events")

    return events


# ---------------- MileSplit Live ----------------

async def capture_milesplit_live(url: str, headful: bool) -> Dict[str, Tuple[Dict[str,Any], Dict[str,Any], Dict[str,str]]]:
    """
    DOM-based scraper for milesplit.live. Uses Playwright to render the Angular
    SPA, then clicks each distance event to load Firestore data and extracts
    athlete names/times/splits from the rendered table DOM.

    milesplit.live uses Firebase Firestore (authenticated) for data, so XHR
    interception cannot capture it. Instead we extract from the rendered DOM
    after the Angular app has fetched and rendered the event results.

    Returns mapping: event_id -> (split_report, ind_res_list, logos)
    """
    from playwright.async_api import async_playwright

    DISTANCE_KWS = [
        "800", "1000", "1500", "mile", "3000", "5000", "10000",
        "steeplechase", "steeple", "dmr", "smr", "distance medley",
        "sprint medley", "600y", "600 y", "1000m", "1000 m",
    ]

    def _is_distance_event(name: str) -> bool:
        nl = name.lower()
        return any(kw in nl for kw in DISTANCE_KWS)

    def _empty_events(note: str) -> Dict[str, Tuple[Dict,Dict,Dict]]:
        base_id = event_id_from_url(url)
        return {base_id: (
            {"_source": {"spr": []}, "_provider": "milesplit_live", "_note": note},
            {"_source": {"r": []}, "_provider": "milesplit_live", "_note": note},
            {}
        )}

    # Normalise URL to events-list page
    meet_m = re.search(r"/meets/(\d+)", url)
    if not meet_m:
        print(f"[ms] no /meets/ID in URL: {url}")
        return _empty_events("no_meet_id")
    meet_id = meet_m.group(1)
    events_url = f"https://milesplit.live/meets/{meet_id}/events"

    all_events: Dict[str, Tuple[Dict,Dict,Dict]] = {}

    # JS snippet: extract athletes + splits from main (largest) results table.
    _EXTRACT_JS = """
    () => {
        const tables = Array.from(document.querySelectorAll('table'));
        let mainTable = null, maxRows = 0;
        for (const t of tables) {
            const r = t.querySelectorAll('tr').length;
            if (r > maxRows) { maxRows = r; mainTable = t; }
        }
        if (!mainTable || maxRows < 3) return {headers: [], athletes: []};

        const ths = Array.from(mainTable.querySelectorAll('th.splits'));
        const headers = ths.map(th => th.textContent.trim());

        const rows = Array.from(mainTable.querySelectorAll('tbody tr, tr')).slice(1);
        const athletes = [];
        for (const row of rows) {
            const nameTd  = row.querySelector('td.name, td[class*="name"]');
            const timeTd  = row.querySelector('td.time, td[class*="time"]');
            const teamTd  = row.querySelector('td.team, td[class*="team"]');
            const placeTd = row.querySelector('td.place, td[class*="place"]');
            const splitTds = Array.from(row.querySelectorAll('td.split'));

            // Extract athlete name from first text node only (excludes smallTeam sub-div)
            let rawName = '';
            if (nameTd) {
                for (const node of nameTd.childNodes) {
                    if (node.nodeType === 3) {  // TEXT_NODE
                        const t = node.textContent.replace(/\\s+/g,' ').trim();
                        if (t.length > 1) { rawName = t; break; }
                    }
                }
                if (!rawName) rawName = nameTd.textContent.replace(/\\s+/g,' ').trim();
            }
            const rawTeam = teamTd ? teamTd.textContent.replace(/\\s+/g,' ').trim() : '';
            // Team cell may include grade / bullet — keep text before the bullet
            const team = rawTeam.split('\\u2022')[0].trim();
            const rawTime = timeTd ? timeTd.textContent.replace(/\\s+/g,' ').trim() : '';
            // Extract first m:ss.d pattern
            const timeM = rawTime.match(/\\d{1,2}:\\d{2}\\.\\d{1,2}|\\d{2,3}\\.\\d{1,2}/);
            const time = timeM ? timeM[0] : '';
            const placeRaw = placeTd ? placeTd.textContent.trim() : '';
            const placeM = placeRaw.match(/^\\d+/);
            const place = placeM ? parseInt(placeM[0]) : null;

            const splits = splitTds.map(td => {
                const timeEl  = td.querySelector('.split-right-content .time, .time');
                const lapEl   = td.querySelector('.split-right-content .lap,  .lap');
                const placeEl = td.querySelector('.split-left-content .place, .place');
                return {
                    cs:   timeEl  ? timeEl.textContent.trim()  : '',
                    lap:  lapEl   ? lapEl.textContent.trim()   : '',
                    p:    placeEl ? placeEl.textContent.trim() : '',
                };
            }).filter(s => s.cs.length > 0);

            if (rawName.length > 2 && time.length > 0) {
                athletes.push({name: rawName, team, place, m: time, splits});
            }
        }
        return {headers, athletes};
    }
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        print(f"[ms nav] {events_url}")
        await page.goto(events_url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(10000)

        # Collect sidebar items (li.pointer) and filter to completed distance events
        items = await page.query_selector_all("li.pointer")
        event_list: List[Tuple[Any, str]] = []
        for item in items:
            txt = await item.inner_text()
            clean = " ".join(txt.strip().split())
            if "Completed" in clean and _is_distance_event(clean):
                event_list.append((item, clean))

        print(f"[ms] {len(event_list)} distance events to scrape from {events_url}")

        for item, evt_name in event_list:
            print(f"[ms] scraping: {evt_name[:60]}")
            try:
                await item.click()
                # Wait up to 25s for split cells to appear; fall back to 5s delay
                try:
                    await page.wait_for_function(
                        "() => document.querySelectorAll('td.split .split-right-content .time').length > 3",
                        timeout=25000,
                    )
                except Exception:
                    await page.wait_for_timeout(5000)

                current_url = page.url
                evt_id_m = re.search(r"/events/(\d+)/results/([A-Z])/([MF])", current_url)
                if evt_id_m:
                    raw_id = f"{meet_id}_{evt_id_m.group(1)}_{evt_id_m.group(2)}_{evt_id_m.group(3)}"
                else:
                    slug = re.sub(r"[^A-Za-z0-9]+", "_", evt_name.split("•")[0].strip())
                    raw_id = f"{meet_id}_{slug[:40]}"

                data = await page.evaluate(_EXTRACT_JS)
                headers: List[str] = data.get("headers", [])
                athletes: List[Dict[str, Any]] = data.get("athletes", [])

                if not athletes:
                    print(f"[ms] no athletes for {evt_name[:40]}")
                    continue

                # Attach split distance labels from table headers
                for ath in athletes:
                    for i, sp in enumerate(ath.get("splits", [])):
                        lbl = headers[i] if i < len(headers) else f"S{i+1}"
                        sp["label"] = lbl

                sl_labels = list(headers)
                split_report = {
                    "_source": {"spr": athletes, "sl": sl_labels},
                    "_provider": "milesplit_live",
                    "_event_name": evt_name,
                }
                ind_res = {
                    "_source": {"r": athletes},
                    "_provider": "milesplit_live",
                    "_event_name": evt_name,
                }
                has_spd = any(a.get("splits") for a in athletes)
                all_events[raw_id] = (split_report, ind_res, {})
                print(f"[ms] {raw_id}: {len(athletes)} athletes, has_splits={has_spd}")

            except Exception as e:
                print(f"[ms] error on {evt_name[:40]}: {type(e).__name__}: {e}")
                continue

        await browser.close()

    if not all_events:
        return _empty_events("no_events_scraped")
    return all_events


# ---------------- FlashResults (static HTML) ----------------

def _parse_fr_athlete(text: str) -> Dict[str, str]:
    """Parse FlashResults athlete cell.

    Format: 'Paul SPECHT 11 Wake Forest [SR]'
    or (no bib): 'Aiden NEAL North Carolina [SR]'
    Returns dict with keys: name, team, bib, year.
    """
    text = text.replace("\xa0", " ").strip()
    # Strip trailing flag words (SB, PB, PR) that sometimes follow the year bracket
    text = re.sub(r"\s+(SB|PB|PR)\s*$", "", text, flags=re.IGNORECASE)
    year = ""
    m = re.search(r"\[(\w+)\]\s*$", text)
    if m:
        year = m.group(1)
        text = text[: m.start()].strip()
    # Try to find a standalone integer (bib) in the text
    bib_m = re.search(r"\b(\d+)\b", text)
    if bib_m:
        bib = bib_m.group(1)
        name = text[: bib_m.start()].strip()
        team = text[bib_m.end() :].strip()
    else:
        # No bib: separate name from school.
        # Convention: athlete format is "FirstName LASTNAME School".
        # The LAST NAME is ALL CAPS and immediately follows the first name.
        # Stop at the FIRST all-caps word to avoid absorbing team abbreviations
        # like "NC" (NC State) into the athlete name.
        words = text.split()
        name_end = 0
        for i, w in enumerate(words):
            if re.match(r"^[A-Z]{2,}$", w):
                name_end = i + 1
                break  # stop at first ALL CAPS word (the last name)
        if name_end == 0:
            name_end = min(2, len(words))
        bib = ""
        name = " ".join(words[:name_end])
        team = " ".join(words[name_end:])
    return {"name": name.strip(), "team": team.strip(), "bib": bib, "year": year}


def _parse_fr_time(raw: str) -> Tuple[str, Dict[str, bool]]:
    """Strip trailing flag tokens (SB, PB, PR) from a time string.

    Returns (clean_time_str, flags_dict).
    """
    raw = raw.strip()
    flags: Dict[str, bool] = {"pr": False, "sb": False}
    for token in ("PR", "PB", "SB"):
        if raw.upper().endswith(token):
            raw = raw[: -len(token)].strip()
            if token in ("PR", "PB"):
                flags["pr"] = True
            else:
                flags["sb"] = True
    return raw, flags


def _parse_fr_split_cell(cell: str) -> str:
    """Extract cumulative time from '30.28 [30.28]' split cell format."""
    cell = cell.strip()
    m = re.match(r"^([\d:.]+)", cell)
    return m.group(1) if m else ""


def _find_fr_results_table(soup: BeautifulSoup) -> Optional[Any]:
    """Find the results table (has Pl + Athlete or Team headers)."""
    for table in soup.find_all("table"):
        first_tr = table.find("tr")
        if not first_tr:
            continue
        cells = [c.get_text(" ", strip=True).lower() for c in first_tr.find_all(["td", "th"])]
        if "pl" in cells and ("athlete" in cells or "team" in cells):
            return table
    return None


def capture_flashresults(url: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Scrape a FlashResults compiled event page (static HTML).

    URL should be the *_compiled.htm page.
    Returns (split_report, ind_res_list) in pace.v1 spr/r format.
    """
    print(f"[fr] GET {url}")
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"[fr] fetch error: {e}")
        return (
            {"_source": {"spr": []}, "_provider": "flashresults", "_note": "fetch_error"},
            {"_source": {"r": []}, "_provider": "flashresults", "_note": "fetch_error"},
        )

    soup = BeautifulSoup(resp.text, "lxml")

    # --- Find splits links (handles single-section "Splits" and multi-section "Sect NView Splits") ---
    splits_urls: List[str] = []
    seen_split_hrefs: set = set()
    for a in soup.find_all("a"):
        href = a.get("href", "")
        txt = a.get_text(strip=True).lower()
        if "split" in txt and href and href not in seen_split_hrefs:
            # Only follow links that look like section split pages (e.g. 026-1-01.htm)
            if re.search(r"-0\d+\.htm", href, re.IGNORECASE):
                seen_split_hrefs.add(href)
                splits_urls.append(urljoin(url, href))

    # --- Parse splits pages (single-section or multi-section) ---
    spr_rows: List[Dict[str, Any]] = []
    res_rows: List[Dict[str, Any]] = []

    def _parse_splits_table(ssoup: BeautifulSoup) -> int:
        """Parse one splits page and append rows to spr_rows/res_rows. Returns row count added."""
        stable = _find_fr_results_table(ssoup)
        if not stable:
            return 0
        rows = stable.select("tr")
        if not rows:
            return 0
        header_row = rows[0]
        headers = [c.get_text(" ", strip=True) for c in header_row.find_all(["td", "th"])]
        hlow = [h.lower() for h in headers]

        pl_idx = next((i for i, h in enumerate(hlow) if h == "pl"), None)
        athlete_idx = next(
            (i for i, h in enumerate(hlow) if h in ("athlete", "team")), None
        )
        time_idx = next((i for i, h in enumerate(hlow) if h == "time"), None)

        split_labels: List[str] = []
        split_col_idxs: List[int] = []
        if time_idx is not None:
            for i in range(time_idx + 1, len(headers)):
                lbl = headers[i].strip()
                if lbl and re.match(r"^\d", lbl):
                    split_labels.append(lbl)
                    split_col_idxs.append(i)
                elif lbl.lower() == "mile":
                    split_labels.append("Mile")
                    split_col_idxs.append(i)

        added = 0
        for tr in rows[1:]:
            tds = tr.find_all(["td", "th"])
            if len(tds) < 2:
                continue

            def cell(idx: Optional[int], _tds: Any = tds) -> str:
                if idx is None or idx >= len(_tds):
                    return ""
                return _tds[idx].get_text(" ", strip=True)

            place_raw = cell(pl_idx)
            athlete_raw = cell(athlete_idx)
            time_raw = cell(time_idx)
            if not athlete_raw or not place_raw:
                continue
            try:
                place = int(place_raw.strip())
            except ValueError:
                place = None

            parsed = _parse_fr_athlete(athlete_raw)
            time_str, flags = _parse_fr_time(time_raw)

            splits: List[Dict[str, Any]] = []
            for lbl, col_i in zip(split_labels, split_col_idxs):
                elapsed = _parse_fr_split_cell(cell(col_i))
                if elapsed:
                    splits.append({"label": lbl, "tm": elapsed})

            athlete_node: Dict[str, Any] = {
                "n": parsed["name"],
                "t": {"n": parsed["team"], "f": parsed["team"], "lg": ""},
            }
            if parsed["bib"]:
                athlete_node["b"] = parsed["bib"]

            spr_rows.append({
                "r": {"a": athlete_node, "p": place, "tm": time_str, "splits": splits, "fl": flags}
            })
            res_rows.append({
                "r": {"a": athlete_node, "p": place, "tm": time_str, "fl": flags}
            })
            added += 1
        return added

    for splits_url in splits_urls:
        print(f"[fr] splits -> {splits_url}")
        try:
            sresp = requests.get(splits_url, timeout=30)
            sresp.raise_for_status()
            n = _parse_splits_table(BeautifulSoup(sresp.text, "lxml"))
            print(f"[fr] +{n} rows from section")
        except Exception as e:
            print(f"[fr] splits parse error: {type(e).__name__}: {e}")

    if splits_urls:
        print(f"[fr] splits total: {len(spr_rows)} rows")

    # --- If no splits page or it failed, fall back to compiled results table ---
    if not res_rows:
        print("[fr] falling back to compiled results table")
        ctable = _find_fr_results_table(soup)
        if ctable:
            rows = ctable.select("tr")
            header_row = rows[0]
            headers = [c.get_text(" ", strip=True) for c in header_row.find_all(["td", "th"])]
            hlow = [h.lower() for h in headers]
            pl_idx = next((i for i, h in enumerate(hlow) if h == "pl"), None)
            athlete_idx = next(
                (i for i, h in enumerate(hlow) if h in ("athlete", "team")), None
            )
            time_idx = next((i for i, h in enumerate(hlow) if h == "time"), None)

            for tr in rows[1:]:
                tds = tr.find_all(["td", "th"])
                if len(tds) < 2:
                    continue
                def cell(idx):
                    if idx is None or idx >= len(tds):
                        return ""
                    return tds[idx].get_text(" ", strip=True)
                place_raw = cell(pl_idx)
                athlete_raw = cell(athlete_idx)
                time_raw = cell(time_idx)
                if not athlete_raw or not place_raw:
                    continue
                try:
                    place = int(place_raw.strip())
                except ValueError:
                    place = None
                parsed = _parse_fr_athlete(athlete_raw)
                time_str, flags = _parse_fr_time(time_raw)
                athlete_node = {
                    "n": parsed["name"],
                    "t": {"n": parsed["team"], "f": parsed["team"], "lg": ""},
                }
                if parsed["bib"]:
                    athlete_node["b"] = parsed["bib"]
                res_rows.append({
                    "r": {"a": athlete_node, "p": place, "tm": time_str, "fl": flags}
                })
                spr_rows.append({
                    "r": {"a": athlete_node, "p": place, "tm": time_str, "splits": [], "fl": flags}
                })
            print(f"[fr] compiled fallback: {len(res_rows)} rows")

    split_report: Dict[str, Any] = {"_source": {"spr": spr_rows}, "_provider": "flashresults"}
    ind_res: Dict[str, Any] = {"_source": {"r": res_rows}, "_provider": "flashresults"}
    if not spr_rows:
        split_report["_note"] = "no_data"
    return split_report, ind_res


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
        events = capture_pttiming(args.url, headful=args.headful)
        for eid, (split_report, ind_res, logos) in events.items():
            write_event_bundle(outdir, eid, split_report, ind_res, logos)

    elif provider == "milesplit_live":
        events = asyncio.run(
            capture_milesplit_live(args.url, headful=args.headful)
        )
        for eid, (split_report, ind_res, logos) in events.items():
            write_event_bundle(outdir, eid, split_report, ind_res, logos)

    elif provider == "flashresults":
        split_report, ind_res = capture_flashresults(args.url)
        write_event_bundle(outdir, base_eid, split_report, ind_res, {})

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
