Check URL Support 

the simplest approach is just calling detect_provider() directly:


cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"
python3 -c "
from py.pace_scraper import detect_provider
urls = [
    'https://live.example.com/meets/12345',
    'https://another-site.com/meet/678',
]
for u in urls:
    print(detect_provider(u), u)
"
Returns one of: legacy_spa, trackscoreboard, trackscoreboard_html, leone_xc, rtspt_html, pttiming, milesplit_live, or unknown.

Anything except unknown = supported
unknown = unsupported domain (you'd need to add it to detect_provider() before ingesting)
If you want to go one step further and check whether discover can actually find events (not just detect the provider), run:


python3 py/pace_discover.py --url "https://live.example.com/meets/12345" --distance-only
That launches Playwright and will either return a list of events or fail with a scraper error, confirming whether the full pipeline works end-to-end.