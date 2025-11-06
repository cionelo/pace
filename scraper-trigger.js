/**
 * scraper-trigger.js
 * Handles triggering GitHub Actions workflow to scrape XpressTiming events
 */

const GITHUB_OWNER = 'cionelo';
const GITHUB_REPO = 'pace';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;

// Extract event ID from XpressTiming URL
function extractEventId(url) {
  const match = url.match(/\/events\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

// Validate XpressTiming URL
function isValidXpressUrl(url) {
  return url.includes('live.xpresstiming.com') && url.includes('/events/');
}

// Trigger GitHub Action workflow
async function triggerScraper(url, token) {
  const response = await fetch(GITHUB_API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'scrape-event',
      client_payload: {
        url: url
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response;
}

// Poll for scrape completion
async function pollForCompletion(eventId, maxAttempts = 30, intervalMs = 3000) {
  const statusUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/${eventId}/scrape_status.json`;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Add cache-busting query param
      const response = await fetch(`${statusUrl}?t=${Date.now()}`);
      if (response.ok) {
        const status = await response.json();
        if (status.status === 'success') {
          return { success: true, eventId };
        } else if (status.status === 'failed') {
          return { success: false, error: status.error || 'Scraping failed' };
        }
      }
    } catch (e) {
      // Status file doesn't exist yet, keep polling
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  return { success: false, error: 'Timeout waiting for scraper to complete' };
}

// Check if event data already exists
async function checkEventExists(eventId) {
  const splitReportUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/${eventId}/split_report.json`;
  try {
    const response = await fetch(splitReportUrl);
    return response.ok;
  } catch {
    return false;
  }
}

// Main handler
window.handleScrapeSubmit = async function(url, token) {
  // Validate URL
  if (!isValidXpressUrl(url)) {
    throw new Error('Invalid XpressTiming URL. Must be from live.xpresstiming.com/meets/.../events/...');
  }

  const eventId = extractEventId(url);
  if (!eventId) {
    throw new Error('Could not extract event ID from URL');
  }

  // Check if already cached
  const exists = await checkEventExists(eventId);
  if (exists) {
    // Data already exists, just load it
    return { success: true, eventId, cached: true };
  }

  // Validate token
  if (!token || !token.trim()) {
    throw new Error('GitHub token is required. Please set it up first (see instructions below).');
  }

  // Trigger scraper
  await triggerScraper(url, token.trim());
  
  // Poll for completion
  const result = await pollForCompletion(eventId);
  
  return { ...result, eventId, cached: false };
};