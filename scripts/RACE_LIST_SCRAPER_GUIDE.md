# Race List Scraper - Quick Guide

## 🎯 Simple Workflow

1. **Curate your races** in `race_input.txt`
2. **Run the script** - it scrapes everything
3. **Done!** Your `events.json` is ready

---

## 📝 Step 1: Create race_input.txt

Format: **3 lines per race, blank line separator**

```
Women 5000m College
2025 Sun Belt XC Championship | Oct 31, 2025 | 9:32 AM EDT
https://live.xpresstiming.com/meets/57259/events/xc/2149044

Men 8000m College
2025 Sun Belt XC Championship | Oct 31, 2025 | 10:15 AM EDT
https://live.xpresstiming.com/meets/57259/events/xc/2149045

Women 6000m
2025 GSC XC Championships | Oct 25, 2025 | 9:00 AM EDT
https://live.xpresstiming.com/meets/57204/events/xc/2148768
```

**Line 1:** Gender + Distance (script extracts metadata)  
**Line 2:** Meet Name | Date | Time (parsed automatically)  
**Line 3:** Full XpressTiming URL

---

## 🚀 Step 2: Run the Script

```bash
# Test first (dry run - just parses file)
python scripts/scrape_from_list.py --dry-run

# Actually scrape
python scripts/scrape_from_list.py

# Watch it work (visible browser)
python scripts/scrape_from_list.py --headful

# Use different input file
python scripts/scrape_from_list.py --input my_races.txt
```

---

## 📊 Step 3: What You Get

### Generated Files:
```
data/
├── 2149044/
│   ├── split_report.json
│   ├── ind_res_list.json
│   └── team_colors.json
├── 2149045/
│   └── ...
└── events.json  ← Manifest for your dropdown
```

### Example `events.json`:
```json
[
  {
    "id": "2149044",
    "name": "2025 Sun Belt XC Championship - Women's 5K",
    "date": "2025-10-31",
    "location": "Unknown",
    "gender": "Women",
    "distance": "5K"
  },
  {
    "id": "2149045",
    "name": "2025 Sun Belt XC Championship - Men's 8K",
    "date": "2025-10-31",
    "location": "Unknown",
    "gender": "Men",
    "distance": "8K"
  }
]
```

---

## ⏱️ Expected Runtime

- **Dry run:** < 1 second (just parses file)
- **6 races:** ~10-12 minutes (each race takes ~60-90 seconds)

---

## 💡 Tips

### Adding More Races
Just append to `race_input.txt`:
```
Women 5000m
New Meet Name | Nov 15, 2025 | 10:00 AM EST
https://live.xpresstiming.com/meets/.../events/xc/...

```

### Re-running
- Script skips races that already exist (unless you delete their folders)
- Always regenerates `events.json` from your input file
- Safe to run multiple times

### Location Field
Currently set to "Unknown" - you can manually edit `events.json` after generation to add locations if needed.

---

## 🐛 Troubleshooting

**"File not found: race_input.txt"**
- Make sure file is at repo root
- Or use `--input path/to/file.txt`

**Race scraping fails**
- Check the URL is valid
- Try with `--headful` to see what's happening
- Verify XpressTiming has the data

**Wrong metadata parsed**
- Check your input format matches exactly
- Must be 3 lines per race with blank line separator

---

## ✅ Example Session

```bash
$ python scripts/scrape_from_list.py

[10:30:15] [INFO] ============================================================
[10:30:15] [INFO] Race List Scraper
[10:30:15] [INFO] ============================================================
[10:30:15] [INFO] Parsing input file: race_input.txt
[10:30:15] [INFO] Parsed: 2025 Sun Belt XC Championship - Women's 5K (2025-10-31)
[10:30:15] [INFO] Parsed: 2025 Sun Belt XC Championship - Men's 8K (2025-10-31)
[10:30:15] [INFO] Parsed: 2025 GSC XC Championships - Men's 8K (2025-10-25)
[10:30:15] [INFO] Parsed: 2025 GSC XC Championships - Women's 6K (2025-10-25)
[10:30:15] [INFO] Successfully parsed 4 races

[10:30:15] [INFO] Found 4 races to process

[10:30:15] [INFO] [1/4] 2025 Sun Belt XC Championship - Women's 5K
[10:30:15] [INFO] Scraping: https://live.xpresstiming.com/meets/57259/events/xc/2149044
[10:31:45] [INFO] ✓ Success: https://live.xpresstiming.com/meets/57259/events/xc/2149044

[10:31:47] [INFO] [2/4] 2025 Sun Belt XC Championship - Men's 8K
...

[10:42:30] [INFO] ✓ Generated data/events.json with 4 races

[10:42:30] [INFO] ============================================================
[10:42:30] [INFO] SUMMARY
[10:42:30] [INFO] ============================================================
[10:42:30] [INFO] Total races: 4
[10:42:30] [INFO] Successful: 4
[10:42:30] [INFO] Failed: 0
[10:42:30] [INFO] 
[10:42:30] [INFO] Data saved to: data/
[10:42:30] [INFO] Events manifest: data/events.json
```

---

## 🎯 Benefits Over Auto-Scraper

- ✅ **Full control** - you pick exactly what races to include
- ✅ **Better metadata** - you provide the exact names/dates
- ✅ **Faster** - no searching/filtering, just direct scraping
- ✅ **More reliable** - no dependency on XpressTiming's meet-list structure
- ✅ **Curated catalog** - only championship/important meets

---

**That's it! Super simple.** 🚀
