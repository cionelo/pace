#!/usr/bin/env python3
"""
Generate events.json manifest from data/ folder.
Scans all event directories and creates a catalog for the UI.
"""

import json
import pathlib
from typing import Any, Dict, List

def extract_race_info(event_id: str, split_report: Dict[str, Any]) -> Dict[str, Any]:
    """Extract race metadata from split_report.json"""
    source = split_report.get("_source", {})
    
    # Get race name from first result
    race_name = "Unknown Race"
    race_date = ""
    
    # Try to extract from split report structure
    spr = source.get("spr", [])
    if spr:
        first_result = spr[0]
        r = first_result.get("r", {})
        
        # Get race name from athlete's event data
        a = r.get("a", {})
        meet_info = a.get("mi", "")
        
        # Extract race date if available
        # This is an example - adjust based on actual data structure
        
    return {
        "id": event_id,
        "name": race_name,
        "date": race_date or "Unknown",
        "location": "Unknown",
        "gender": "Unknown",
        "distance": "5K"  # Default assumption for XC
    }

def generate_manifest():
    """Scan data/ directory and create events.json"""
    data_dir = pathlib.Path("data")
    
    if not data_dir.exists():
        print("No data/ directory found")
        return
    
    events: List[Dict[str, Any]] = []
    
    # Scan all event directories
    for event_dir in sorted(data_dir.iterdir()):
        if not event_dir.is_dir():
            continue
        
        event_id = event_dir.name
        split_report_path = event_dir / "split_report.json"
        
        if not split_report_path.exists():
            print(f"Skipping {event_id}: no split_report.json")
            continue
        
        try:
            with open(split_report_path, 'r', encoding='utf-8') as f:
                split_report = json.load(f)
            
            # For now, use simple metadata
            # You can enhance this to parse more details from split_report
            event_info = {
                "id": event_id,
                "name": f"Event {event_id}",  # Fallback name
                "date": "Unknown",
                "location": "Unknown",
                "gender": "Unknown",
                "distance": "5K"
            }
            
            events.append(event_info)
            print(f"Added event: {event_id}")
            
        except Exception as e:
            print(f"Error processing {event_id}: {e}")
            continue
    
    # Write manifest
    manifest_path = data_dir / "events.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    
    print(f"\nGenerated manifest with {len(events)} events")
    print(f"Saved to: {manifest_path}")

if __name__ == "__main__":
    generate_manifest()
