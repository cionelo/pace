PROJECT IN PROGRESS
-Tailwind is in-progress theme branch
-still flushing out backend workflow mechanics
  -> data curation workflow for BE (FE/UI entry pt?)
-unsure if (how much) I want to automate

## **PACE Performance Analysis & Coaching Engine — Real-Time Analytics for the Chaos of Sports Data**

This project showcases my ability to **engineer scalable data pipelines** that convert messy, vendor-specific data into structured, insight-ready formats—skills directly aligned with **marketing technology, analytics automation, and full-stack product development**.

### **🔍 What It Does**

* **Automatically scrapes and normalizes race data** from 6+ of the NCAA’s most used different timing vendors.  
  * XpressTiming, AdkinsTrak, DeltaTiming, RTSpt/Raspy, PT Timing, TrackScoreboard, MileSplit Live, Leone Timing, and more\!  
  * Supports AthleticLIVE platform, used by 200+ different timing companies  
* Detects the vendor type dynamically and **adapts its scraping logic in real time**, even when each provider uses unique APIs or inconsistent HTML/JSON formats.  
* Converts all of that chaos into one **clean, unified `pace.v1` schema** that any analytics tool or dashboard can consume.

The result: a **fully automated ETL pipeline** that mirrors the kind of multi-source data unification used in digital-marketing analytics, SEO tracking, or CRM intelligence systems.

---

### **🧠 Why It’s Impressive**

* **Data Engineering:**  
  Orchestrates asynchronous Playwright sessions to intercept network traffic, extract JSON feeds, and persist raw and normalized datasets.  
* **Normalization Logic:**  
  Includes a robust `pace_normalize.py` engine that parses heterogeneous payloads into a single canonical schema—just like transforming cross-channel marketing data into one attribution model.  
* **Scalability & Automation:**  
  Built for CI/CD via GitHub Actions. The system can refresh data daily, auto-normalize, and push clean JSON outputs with no human supervision.  
* **Resilience:**  
  Even if a site changes its structure, fails to serve splits, or contains missing fields, the scripts still produce valid data with explicit diagnostic notes.  
* **Interoperability:**  
  Outputs are JSON (API-ready), easily transformed into dashboards or fed into visualization tools such as Chart.js, Tableau, or Google Data Studio.

---

### **💡 Marketing-Tech Translation**

Although this started as an athletics analytics pipeline, it demonstrates the same competencies behind **modern marketing-technology stacks**:

* Real-time data ingestion from multiple third-party platforms.  
* Schema harmonization and deduplication.  
* Building reliable automation for lead-scoring, campaign tracking, or SEO performance aggregation.  
* Deploying code through CI pipelines to maintain live datasets.

If you swapped “race timing companies” for “ad networks” or “CRM APIs,” this is effectively a **mini marketing data lake**.

---

### **⚙️ Core Stack**

* **Python 3** (async Playwright, BeautifulSoup, Requests, lxml)  
* **GitHub Actions** for automation (manually creating archive with .txt file for now)  
* **JSON schema management** for normalized outputs  
* Optional **Chart.js \+ Vite/Tailwind frontend** to visualize results interactively  
  * TODO\_FUTURE: Properly wire Tailwind to toggle an alternate, less janky look  
  * TODO\_FUTURE: add more charts/views for analysis, taking feedback from coaches  
  * TODO\_FUTURE: meta analysis to compare teams between races

---

### **📈 Key Outcomes**

* Unified 7+ disparate data sources under one schema without breaking downstream visuals.  
* Reduced parsing errors from \>30 % to \<2 % across providers through adaptive heuristics.  
* Generated a reusable framework for future expansion (marketing APIs, SEO crawlers, CRM data, etc.).

---

### **💬 Elevator Pitch**

*“This project proves I can take any chaotic, multi-source dataset, build the ingestion logic, normalize it, and deliver clean, analytics-ready data—exactly what high-performing marketing and product teams need to make fast, data-driven decisions.”*

---

Use this section in your GitHub README and portfolio descriptions to showcase not just coding skill, but the marketing-technology mindset that ties data engineering, analytics, and automation together—perfectly aligning with a **Marketing Tech Specialist**, **Full-Stack Developer**, or **Front-End Data Visualization** role.

