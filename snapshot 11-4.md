# RaceVisualizer Project Snapshot - Nov 4, 2025

## 🎯 Project Goal
XC race analytics dashboard using scraped JSON data (split_report.json, team_colors.json) 
from live.xpresstiming.com. NOT Google Sheets. Pure JSON → Vite → Charts.

## ✅ Current Status: WORKING
- 6 charts rendering with dynamic data
- Team colors applying correctly  
- Lazy-load button on results table working
- All animations smooth (750ms)

## 📁 Tech Stack (Actual)
```
Vite (bundler)
├── main.js (entry point, loads modules)
├── app.js (data loading, UI controls, normalization)
├── charts.js (Chart.js renderers - 6 charts)
├── index.html (semantic HTML)
├── styles.css (custom CSS - NO Tailwind used despite import)
└── tw.css (imported but unused - just has @tailwind directives)

Data: /data/<event_id>/split_report.json + team_colors.json
```

## 🗂️ Data Structure
```javascript
window.__raceData = {
  race: { name: '', splits: [{label: '1K'}, {label: '2K'}, ...] },
  athletes: [{
    athlete_id: '12345',
    name: 'Jane Doe',
    team: 'Texas State',
    place: 1,
    final_time: '16:52.10',
    splits: [
      {label: '1K', elapsed: '3:25.7', elapsed_s: 205.7, lap_s: 205.7, place_at_split: 3},
      // ... more splits
    ]
  }, ...]
}
```

## 🎨 6 Charts (All Working)
1. **Team Pace Lines** - Individual athletes + team avg (renderTeamPaceChart)
2. **Runner Split Comparison** - Compare 2 athletes A vs B (renderRunnerCompareChart)
3. **Split Pace Progression** - Team avg pace per split (createPacingChart)
4. **Position Movement** - Avg position through race (createPositionChart)
5. **Team Spread Evolution** - Time gap 1st-5th scorer (createSpreadChart)
6. **Cumulative Team Scoring** - XC scoring progression (createScoringChart)

## 🔧 Key Functions
**app.js:**
- `normalizeSplitReport(raw)` - Converts XpressTiming JSON to clean structure
- `loadEvent(eventId)` - Main loader, applies team colors, renders all charts
- `renderResultsTable(data)` - Populates athlete table
- `wireControls()` - Event listeners for all UI controls
- `populateTeamSelectors()` - Fills dropdowns with team names

**charts.js:**
- `colorFor(team, alpha)` - Gets team color with fallback to hash
- `applyTeamColors(map)` - Loads colors from team_colors.json
- All 6 chart functions take `teamsToVisualize` array
- Charts use `window.__raceData` directly

## 🎨 Team Colors
Loaded from team_colors.json:
```json
{
  "Coastal Carolina": {"primary_hex": "#006F71", ...},
  "App State": {"primary_hex": "#100F0D", ...}
}
```

Applied via `colorFor(teamName, alpha)` in charts.js

## 🐛 Known Issues / To-Do
1. **Tailwind imported but unused** - tw.css has directives but no utility classes in HTML
   - Decision needed: Remove it OR refactor HTML to use utilities
   - Current CSS is custom, clean, and working great
   
2. **Top control panel filters** - Primary Team, Compare Teams, Show Displacers
   - Wire these to refresh the 4 main charts (currently only affect initial load)
   - `refreshMainCharts()` function exists but may need refinement

3. **Dynamic splits** - Currently assumes 5 splits, works for variable but untested with miles

## 📝 Important Patterns
**Data is DYNAMIC - nothing hardcoded:**
- Split labels from `data.race.splits.map(s => s.label)`
- Calculations loop through actual splits arrays
- Team colors from JSON or hash-generated fallback
- All dropdowns populated from loaded data

**Chart styling consistent:**
```javascript
// All charts use:
animation: { duration: 750, easing: 'easeInOutQuart' }
borderWidth: 3, pointRadius: 4, pointHoverRadius: 6
colorFor(team, 0.9) for lines, (0.2) for fills
```

## 🚀 Next Session Topics
1. **Tailwind decision** - keep custom CSS or integrate utilities?
2. **Filter wiring** - make top controls refresh all 4 main charts dynamically
3. **README** - add architecture diagram, tech explanation, live demo link
4. **Deployment** - GitHub Pages setup
5. **Testing** - add basic tests for normalization functions

## 💬 Context for AI
User wants this as portfolio project for hiring managers. Emphasize:
- Real-world problem solving (scraper → pipeline → viz)
- Modern architecture without framework bloat
- Production quality code
- Clean, maintainable patterns
- Dynamic data handling (any # splits, any teams)

**User prefers:** Drop-in patches with Cmd+F anchors over full file regeneration.

## 📦 File Locations in Project
```
/
├── index.html (updated, has lazy-load button)
├── main.js (loads CSS + modules, exposes loadEventFolder)
├── app.js (updated with all patches)
├── charts.js (updated, all 6 charts working)
├── styles.css (updated, has btn-primary)
├── tw.css (unused Tailwind directives)
├── data/
│   └── 2149044/
│       ├── split_report.json
│       └── team_colors.json
└── [node_modules, package.json, vite.config, etc]
```

## 🔗 Key Exports
```javascript
window.__raceData          // Normalized race data
window.raceDataAPI         // Legacy shim for old functions
window.chartFunctions      // {createPacingChart, createPositionChart, ...}
window.loadEvent           // Main entry point from app.js
window.loadEventFolder     // Fetches JSON files from /data/<id>/
window.populateTeamSelectors // Fills dropdowns after data load
```

## ⚡ Quick Commands
```bash
npm run dev        # Start Vite dev server
# Open http://localhost:5173
# Console: window.__raceData to inspect loaded data
```

---
**Snapshot created:** Nov 4, 2025 | **Status:** ✅ Working, needs polish & decisions