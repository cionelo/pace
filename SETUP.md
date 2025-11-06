# Race Visualizer Scraper Setup

## Step 1: Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `Race Scraper Token`
4. Set expiration: `No expiration` (or your preference)
5. Select these scopes:
   - ✅ **repo** (Full control of private repositories)
   - ✅ **workflow** (Update GitHub Action workflows)
6. Click **"Generate token"**
7. **COPY THE TOKEN IMMEDIATELY** - you can't see it again!
   - It will look like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Add Token to Repository Secrets

1. Go to your repo: https://github.com/cionelo/pace
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **"New repository secret"**
5. Name: `SCRAPER_TOKEN`
6. Value: Paste your token from Step 1
7. Click **"Add secret"**

## Step 3: Test the Scraper

1. Open your deployed site
2. Paste an XpressTiming URL in the header form
3. Paste your token in the token field (it will be saved in browser)
4. Click "Scrape & Load"
5. Wait 60-90 seconds
6. Event data should load automatically!

## How It Works

- Frontend triggers GitHub Action via API
- Action runs `splits_scraper.py` in cloud
- Scraper saves JSONs to `/data/<event_id>/`
- Action commits files back to repo
- Frontend detects completion and loads data

## Troubleshooting

**"GitHub API error: 401"**
- Token is invalid or expired
- Generate a new token

**"GitHub API error: 404"**
- Token doesn't have `workflow` permission
- Regenerate token with correct scopes

**Scraper times out:**
- GitHub Actions may be slow to start
- Check Actions tab in repo to see if workflow ran
- Data will be in repo even if frontend times out