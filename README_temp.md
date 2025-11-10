# **PACE — Performance Analysis & Coaching Engine**

### **Real-Time Race Data Intelligence for Cross Country & Track**

**Status:** Actively in development (Began 10-31-25), data pipeline complete, modern frontend rebuild underway (`wizard-v1` branch).  
**Demo:** [https://itsnemo.dev/pace](https://itsnemo.dev/pace) 

*Stable but prob static*  
---

## **🧭 Project Summary**

**PACE** (Performance Analysis & Coaching Engine) transforms messy, vendor-specific race data into unified, insight-ready analytics — mirroring the same **ETL, normalization, and visualization** techniques used in **marketing technology, SEO tracking, and CRM data systems**.

This project showcases full-stack data engineering and front-end analytics design:  
from **scraping 8+ NCAA race timing systems** to building an interactive, coach-ready dashboard powered by **Vite, Tailwind, and Chart.js**.

---

## **🧠 What It Does**

* **Automatically scrapes and normalizes race data** from **8+ of the NCAA’s most-used timing vendors:**  
  * **XpressTiming**  
  * **AdkinsTrak**  
  * **DeltaTiming**  
  * **RTSpt / Raspy Timing**  
  * **PT Timing**  
  * **TrackScoreboard**  
  * **MileSplit Live**  
  * **Leone Timing**  
  * *(and more via shared AthleticLIVE architecture — used by 200+ timing companies)*  
* **Dynamic Vendor Detection:** identifies timing system type in real time and applies the right scraping logic automatically.  
* **Provider-Agnostic ETL Pipeline:** unifies inconsistent JSON, HTML, or API structures into one consistent schema: **`pace.v1`**.  
* **Coach-Facing Frontend:** delivers real-time pace, spread, scoring, and runner progression visualizations — all static, no backend required.  
* **Marketing-Tech Analogy:** identical data pipeline logic to what powers cross-platform analytics dashboards, ad attribution models, and CRM integrations.

---

## **🧩 Architecture Overview**

| Layer | Description |
| ----- | ----- |
| **Data Extraction** | `pace_scraper.py` automatically captures race JSON feeds and logos from multiple timing vendors using **Playwright \+ BeautifulSoup**. |
| **Normalization** | `pace_normalize.py` aligns all vendor data to the **`pace.v1` schema**, with standardized athlete, split, and team structures. |
| **Visualization** | `Vite + Vanilla JS + Chart.js` frontend consumes normalized JSON and renders split-by-split analytics with dynamic team and runner comparisons. |
| **Deployment** | Fully static — runs on **GitHub Pages** or any CDN. Future automation will redeploy when new races are added. |

---

## **🧱 Schema Example (pace.v1)**

`{`  
  `"schema": "pace.v1",`  
  `"event": {`  
    `"id": "20251108-coastal-xc",`  
    `"provider": "xpresstiming",`  
    `"name": "Coastal Carolina XC Invitational",`  
    `"splits": ["1K", "2K", "3K", "4K", "5K"]`  
  `},`  
  `"athletes": [`  
    `{`  
      `"id": "12-John Doe-Coastal Carolina",`  
      `"bib": "12",`  
      `"name": "John Doe",`  
      `"team": "Coastal Carolina",`  
      `"place": 1,`  
      `"time_s": 1042.4,`  
      `"splits": [`  
        `{ "label": "1K", "elapsed_s": 205.0, "lap_s": 205.0, "place": 3 }`  
      `],`  
      `"flags": { "pr": true, "sb": false }`  
    `}`  
  `]`  
`}`

---

## **📁 Repository Structure (wizard-v1 branch)**

`pace/`  
`│`  
`├── src/`  
`│   ├── main.js           # Vite entry`  
`│   ├── app.js            # Core frontend logic`  
`│   ├── charts.js         # Chart.js renderers (pace.v1 aware)`  
`│   ├── utils/loader.js   # Fetch utilities`  
`│   └── styles.css        # UI styles (Tailwind-ready)`  
`│`  
`├── py/`  
`│   ├── pace_scraper.py   # Multi-vendor scraper`  
`│   └── pace_normalize.py # Normalizer (pace.v1)`  
`│`  
`├── public/data/`  
`│   ├── events.json       # Published races`  
`│   └── *.pace.v1.json    # Normalized event data`  
`│`  
`├── docs/                 # Developer and schema documentation`  
`└── dist/                 # Vite build output`

---

## **⚙️ Example Workflow**

**Scrape**  
`python py/pace_scraper.py --url "https://live.xpresstiming.com/meets/2149044/events/1"`

1. → Produces `/data_raw/2149044/{split_report.json, ind_res_list.json, team_colors.json}`

**Normalize**  
`python py/pace_normalize.py --root data_raw --event-id 2149044`

2. → Produces `/public/data/2149044.pace.v1.json`

**Visualize**  
`npm run dev`

3. → Opens the dashboard with team pacing, spread, and scoring charts.

---

## **🛣️ Roadmap**

| Phase | Description | Status |
| ----- | ----- | ----- |
| 1\. Multi-Provider Scraping | Robust vendor-agnostic extraction via Playwright. | ✅ Done |
| 2\. Unified Schema (pace.v1) | Cross-provider data normalization engine. | ✅ Done |
| 3\. Vite Frontend (wizard-v1) | Modern JS frontend powered by pace.v1. | 🛠 In progress |
| 4\. Race Wizard | Client-side race loader with instant normalization (no upload). | 🧩 Planned |
| 5\. CI/CD Automation | GitHub Actions auto-scrape \+ normalize \+ commit nightly. | 🗓 Planned |
| 6\. Advanced Analytics | Team pack modeling, PR/SB tracking, and predictive pacing. | 🚧 Concept |

---

## **💡 Why This Matters**

**For Recruiters / Employers:**

* Demonstrates **end-to-end technical range**: data scraping → schema design → CI/CD → visualization.  
* Replicates **marketing analytics pipelines** (multi-source, normalized, visualization-ready).  
* Proves capability in **data automation, full-stack delivery, and UX design**.  
* Built for **real users (coaches)** with immediate business logic — not a toy demo.

**Core Technologies:**  
`Python` • `Playwright` • `BeautifulSoup` • `Vite` • `Chart.js` • `Tailwind` • `JSON Schema Design` • `ETL Pipelines` • `Automation` • `Static Deployment`

---

## **🚀 Vision**

PACE aims to become the **open-source benchmark for race analytics**, showing how messy real-world sports data can be transformed into clean, automated insights — the same way marketing platforms turn raw campaign data into dashboards.

---

## **👤 Author**

**Nehemiah “Nemo” Cionelo**  
Full-Stack Developer • Marketing Technologist  
📍 Relocating to Colorado (Jan 2026\)  
🌐 [itsnemo.dev](https://itsnemo.dev/)  
📧 nemocionelo@gmail.com | [GitHub: cionelo](https://github.com/cionelo)

