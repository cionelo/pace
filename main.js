// Tailwind + site styles
import "./tw.css";
import "./styles.css";

// ESM Chart.js
import "chart.js/auto";

// Your chart renderers and helpers (side effects OK)
import * as Charts from "./charts.js";

// Your app orchestration (now exports loadEvent)
import * as App from "./app.js";

/* ===== public helpers for console/tests ===== */

// Match your real folder layout: ./data/<event_id>/{split_report.json,team_colors.json}
async function loadEventFolder(eventId) {
  const base = `./data/${encodeURIComponent(eventId)}`;
  const [reportRes, colorsRes] = await Promise.all([
    fetch(`${base}/split_report.json`),
    fetch(`${base}/team_colors.json`).catch(() => null)
  ]);

  if (!reportRes.ok) {
    throw new Error(`Missing split_report.json for ${eventId} (${reportRes.status})`);
  }

  const split_report = await reportRes.json();
  const team_colors = colorsRes && colorsRes.ok ? await colorsRes.json() : {};
  return { event_id: String(eventId), split_report, team_colors };
}

async function demoLoad(eventId = "2149044") {
  try {
    const data = await loadEventFolder(eventId);
    console.log("[demoLoad]", data);
    return data;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Expose for console
window.loadEventFolder = loadEventFolder;
window.demoLoad = demoLoad;

// Also expose app entry if present
if (typeof App.loadEvent === "function") {
  window.loadEvent = App.loadEvent;
}

// Ensure chartFunctions is available globally (charts.js already sets window.chartFunctions)
// But we need to make sure the Charts module is loaded
console.log("[main.js] Charts module loaded:", !!window.chartFunctions);