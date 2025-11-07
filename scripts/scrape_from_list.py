#!/usr/bin/env python3
"""
scrape_from_list.py - Scrape XC races from a curated list

Parses race_input.txt format:
    Women 5000m College
    2025 Sun Belt XC Championship | Oct 31, 2025 | 9:32 AM EDT
    https://live.xpresstiming.com/meets/57259/events/xc/2149044

Then:
1. Calls splits_scraper.py for each race
2. Generates data/events.json with all metadata

Usage:
    python scripts/scrape_from_list.py [--input FILE] [--dry-run] [--headful]
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
from datetime import datetime
from typing import Any, Dict, List

# ========== CONFIG ==========
DELAY_BETWEEN_RACES = 2  # seconds

# ========== UTILITIES ==========
def log(msg: str, level: str = "INFO"):
    """Simple logging"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

def extract_event_id(url: str) -> str:
    """Extract event ID from URL"""
    match = re.search(r'/events/xc/(\d+)', url)
    if match:
        return match.group(1)
    return url.rstrip('/').split('/')[-1]

def parse_distance(distance_str: str) -> str:
    """
    Parse distance from strings like:
    - "Women 5000m College" -> "5K"
    - "Men 8000m" -> "8K"
    - "Women 6000m" -> "6K"
    """
    distance_map = {
        "5000m": "5K",
        "5k": "5K",
        "6000m": "6K",
        "6k": "6K",
        "8000m": "8K",
        "8k": "8K",
        "10000m": "10K",
        "10k": "10K"
    }
    
    distance_lower = distance_str.lower()
    for key, value in distance_map.items():
        if key in distance_lower:
            return value
    
    return "Unknown"

def parse_gender(line: str) -> str:
    """Extract gender from race description line"""
    line_lower = line.lower()
    if "women" in line_lower or "female" in line_lower:
        return "Women"
    elif "men" in line_lower or "male" in line_lower:
        return "Men"
    return "Unknown"

def parse_date(date_str: str) -> str:
    """
    Parse date from format: "Oct 31, 2025" -> "2025-10-31"
    """
    try:
        # Try parsing "Oct 31, 2025" format
        dt = datetime.strptime(date_str.strip(), "%b %d, %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        try:
            # Try "October 31, 2025" format
            dt = datetime.strptime(date_str.strip(), "%B %d, %Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            # Return as-is if can't parse
            return date_str.strip()

def parse_race_entry(lines: List[str]) -> Dict[str, Any]:
    """
    Parse a 3-line race entry:
    Line 1: Women 5000m College
    Line 2: 2025 Sun Belt XC Championship | Oct 31, 2025 | 9:32 AM EDT
    Line 3: https://live.xpresstiming.com/meets/57259/events/xc/2149044
    
    Returns: {"id": "...", "name": "...", "date": "...", "gender": "...", "distance": "...", "url": "..."}
    """
    if len(lines) != 3:
        return None
    
    description_line = lines[0].strip()
    metadata_line = lines[1].strip()
    url_line = lines[2].strip()
    
    # Extract gender and distance from first line
    gender = parse_gender(description_line)
    distance = parse_distance(description_line)
    
    # Parse metadata line: "2025 Sun Belt XC Championship | Oct 31, 2025 | 9:32 AM EDT"
    parts = [p.strip() for p in metadata_line.split('|')]
    
    meet_name = parts[0] if len(parts) > 0 else "Unknown Meet"
    date_str = parts[1] if len(parts) > 1 else "Unknown"
    
    # Convert date to YYYY-MM-DD
    date = parse_date(date_str)
    
    # Build race name
    race_name = f"{meet_name} - {gender}'s {distance}"
    
    # Extract event ID from URL
    event_id = extract_event_id(url_line)
    
    # Try to extract location from meet name (if it has state/city)
    location = "Unknown"
    # Common patterns: "at City, ST" or just keep it unknown for now
    
    return {
        "id": event_id,
        "name": race_name,
        "date": date,
        "location": location,
        "gender": gender,
        "distance": distance,
        "url": url_line
    }

def parse_input_file(filepath: str) -> List[Dict[str, Any]]:
    """
    Parse race_input.txt file
    
    Format: 3 lines per race, blank line separator
    """
    log(f"Parsing input file: {filepath}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split by blank lines
        entries = []
        current_lines = []
        
        for line in content.split('\n'):
            line = line.strip()
            
            if line:
                current_lines.append(line)
            else:
                # Blank line - process accumulated lines
                if current_lines:
                    entry = parse_race_entry(current_lines)
                    if entry:
                        entries.append(entry)
                        log(f"Parsed: {entry['name']} ({entry['date']})")
                    else:
                        log(f"Failed to parse entry: {current_lines}", "WARNING")
                    current_lines = []
        
        # Don't forget last entry if file doesn't end with blank line
        if current_lines:
            entry = parse_race_entry(current_lines)
            if entry:
                entries.append(entry)
                log(f"Parsed: {entry['name']} ({entry['date']})")
        
        log(f"Successfully parsed {len(entries)} races")
        return entries
        
    except FileNotFoundError:
        log(f"File not found: {filepath}", "ERROR")
        return []
    except Exception as e:
        log(f"Error parsing file: {e}", "ERROR")
        return []

def scrape_race(url: str, headful: bool = False) -> bool:
    """
    Call splits_scraper.py for a race URL
    
    Returns: True if successful
    """
    log(f"Scraping: {url}")
    
    try:
        # Use sys.executable to get the current Python interpreter
        cmd = [sys.executable, "splits_scraper.py", "--url", url]
        if headful:
            cmd.append("--headful")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 min timeout per race
        )
        
        if result.returncode == 0:
            log(f"✓ Success: {url}")
            return True
        else:
            log(f"✗ Failed: {url}", "ERROR")
            if result.stderr:
                log(f"  Error: {result.stderr[:200]}", "ERROR")
            return False
            
    except subprocess.TimeoutExpired:
        log(f"✗ Timeout: {url}", "ERROR")
        return False
    except Exception as e:
        log(f"✗ Error: {url} - {e}", "ERROR")
        return False

def generate_events_json(races: List[Dict[str, Any]], output_path: str = "data/events.json"):
    """Generate events.json from race list"""
    
    # Sort by date (most recent first)
    races_sorted = sorted(races, key=lambda x: x.get('date', 'Unknown'), reverse=True)
    
    # Remove 'url' field before saving (not needed in events.json)
    events = []
    for race in races_sorted:
        event = {k: v for k, v in race.items() if k != 'url'}
        events.append(event)
    
    # Ensure output directory exists
    output_file = pathlib.Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    
    log(f"✓ Generated {output_path} with {len(events)} races")

# ========== MAIN ==========
def main():
    parser = argparse.ArgumentParser(description="Scrape races from curated list")
    parser.add_argument("--input", default="race_input.txt", help="Input file (default: race_input.txt)")
    parser.add_argument("--dry-run", action="store_true", help="Parse file but don't scrape")
    parser.add_argument("--headful", action="store_true", help="Run browser in visible mode")
    args = parser.parse_args()
    
    log("=" * 60)
    log("Race List Scraper")
    log("=" * 60)
    
    # Step 1: Parse input file
    races = parse_input_file(args.input)
    
    if not races:
        log("No races found in input file!", "ERROR")
        sys.exit(1)
    
    log(f"\nFound {len(races)} races to process\n")
    
    # Step 2: Scrape each race
    successful = 0
    failed = 0
    
    for i, race in enumerate(races, 1):
        log(f"[{i}/{len(races)}] {race['name']}")
        
        if args.dry_run:
            log(f"  [DRY RUN] Would scrape: {race['url']}")
            log(f"  Metadata: {race['gender']}, {race['distance']}, {race['date']}")
        else:
            success = scrape_race(race['url'], headful=args.headful)
            if success:
                successful += 1
            else:
                failed += 1
            
            # Delay between races
            if i < len(races):
                time.sleep(DELAY_BETWEEN_RACES)
        
        print()  # Blank line for readability
    
    # Step 3: Generate events.json
    if not args.dry_run:
        generate_events_json(races)
    
    # Summary
    log("=" * 60)
    log("SUMMARY")
    log("=" * 60)
    log(f"Total races: {len(races)}")
    
    if args.dry_run:
        log("\n[DRY RUN] No data was scraped")
        log("Remove --dry-run to actually scrape")
    else:
        log(f"Successful: {successful}")
        log(f"Failed: {failed}")
        log(f"\nData saved to: data/")
        log(f"Events manifest: data/events.json")
        
        if failed > 0:
            log(f"\n⚠️  {failed} races failed - check logs above", "WARNING")

if __name__ == "__main__":
    main()