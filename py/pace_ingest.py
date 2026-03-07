#!/usr/bin/env python3
"""
pace_ingest.py
Orchestrator: URL(s) -> scrape -> normalize -> validate -> upload

Usage:
  python pace_ingest.py "https://live.xpresstiming.com/..."
  python pace_ingest.py "url1" "url2" "url3"
  python pace_ingest.py --from race_input.txt
  python pace_ingest.py --from race_input.txt --force-upload
"""

import argparse
import pathlib
import subprocess
import sys


def parse_urls_from_file(path: pathlib.Path) -> list[str]:
    """Extract URLs from a race_input.txt-style file."""
    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("http://") or line.startswith("https://"):
            urls.append(line)
    return urls


def run_step(label: str, cmd: list[str]) -> bool:
    """Run a subprocess, print output, return success."""
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0


def ingest_url(url: str, data_root: pathlib.Path, force_upload: bool, headful: bool) -> bool:
    """Full pipeline for one URL."""
    py_dir = pathlib.Path(__file__).parent

    # Step 1: Scrape
    scrape_cmd = [
        sys.executable, str(py_dir / "pace_scraper.py"),
        "--url", url,
        "--outdir", str(data_root),
    ]
    if headful:
        scrape_cmd.append("--headful")

    if not run_step(f"SCRAPE: {url}", scrape_cmd):
        print(f"[FAIL] Scraping failed for {url}")
        return False

    # Step 2: Normalize
    norm_cmd = [
        sys.executable, str(py_dir / "pace_normalize.py"),
        "--root", str(data_root),
        "--force",
    ]
    if not run_step("NORMALIZE", norm_cmd):
        print(f"[FAIL] Normalization failed")
        return False

    # Step 3: Find normalized files and validate
    normalized_files = list(data_root.rglob("pace_normalized.json"))
    if not normalized_files:
        print("[FAIL] No pace_normalized.json files found after normalization")
        return False

    all_valid = True
    for nf in normalized_files:
        validate_cmd = [sys.executable, str(py_dir / "pace_validate.py"), str(nf)]
        if not run_step(f"VALIDATE: {nf.parent.name}", validate_cmd):
            all_valid = False
            print(f"[FAIL] Validation failed for {nf}")

    if not all_valid and not force_upload:
        print("\nValidation failed. Fix issues above or use --force-upload to bypass.")
        return False

    if not all_valid and force_upload:
        print("\nValidation failed but --force-upload is set. Proceeding...")

    # Step 4: Upload
    for nf in normalized_files:
        upload_cmd = [sys.executable, str(py_dir / "pace_upload.py"), str(nf)]
        if not run_step(f"UPLOAD: {nf.parent.name}", upload_cmd):
            print(f"[FAIL] Upload failed for {nf}")
            return False

    print(f"\nPipeline complete for {url}")
    return True


def main():
    ap = argparse.ArgumentParser("PACE ingestion pipeline")
    ap.add_argument("urls", nargs="*", help="One or more race URLs")
    ap.add_argument("--from", dest="from_file", help="File with race URLs (one per line)")
    ap.add_argument("--data-root", default="data", help="Root data directory")
    ap.add_argument("--force-upload", action="store_true", help="Upload even if validation fails")
    ap.add_argument("--headful", action="store_true", help="Visible browser for debugging")
    args = ap.parse_args()

    urls = list(args.urls)
    if args.from_file:
        urls.extend(parse_urls_from_file(pathlib.Path(args.from_file)))

    if not urls:
        print("No URLs provided. Use positional args or --from <file>")
        sys.exit(1)

    data_root = pathlib.Path(args.data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    results = []
    for url in urls:
        ok = ingest_url(url, data_root, args.force_upload, args.headful)
        results.append((url, ok))

    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    for url, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {url}")

    failures = sum(1 for _, ok in results if not ok)
    sys.exit(1 if failures > 0 else 0)


if __name__ == "__main__":
    main()
