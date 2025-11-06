## SCRAPER HOWTO
(IN MACOS TERMINAL)
python3 -m venv .venv
source .venv/bin/activate
pip install playwright bs4 lxml requests
python -m playwright install chromium
python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --headful

AFTER IT FINISHES YOU SHOULD HAVE
data/2149044/
  split_report.json
  ind_res_list.json
  team_colors.json



Re-run headless using cache:
python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044"
Force a fresh capture:
python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --force
Change output folder:
python splits_scraper.py --url "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --outdir "./race_cache"
Why this works (quick notes)
Playwright launches Chromium, listens for network responses that contain split_report and ind_res_list payloads, and your script saves them under data/<event_id>/.
First run headful helps ensure the Splits tab and long lists actually load; the script auto-clicks “Splits” and scrolls to trigger the JSON requests.
If ind_res_list.json doesn’t appear on a run, try headful again and slowly scroll the page; you can also use --force to rebuild the cache.