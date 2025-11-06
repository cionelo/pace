/*
  app.js v3.0 — Vite + vanilla ESM + Tailwind + Chart.js
  Role: load ./data/<event_id>/split_report.json (+team_colors.json),
        normalize data, render results table, and trigger charts.js renderers.
  Notes: no Pyodide, no legacy CSV/PDF routing in this build. 
  -May need to reintegrate the old look i like.
*/

/* ---------- lightweight loading overlay (kept) ---------- */
let __inFlight = 0;
function showLoading(msg = "Loading race data...") {
  const el = document.getElementById("loadingOverlay");
  if (!el) return;
  __inFlight++;
  el.style.display = "flex";
  const p = el.querySelector("p");
  if (p) p.textContent = msg;
}
function hideLoading(force = false) {
  const el = document.getElementById("loadingOverlay");
  if (!el) return;
  __inFlight = force ? 0 : Math.max(0, __inFlight - 1);
  if (__inFlight === 0) el.style.display = "none";
}
window.addEventListener("DOMContentLoaded", () => hideLoading(true));
window.addEventListener("error", () => hideLoading(true));
window.addEventListener("unhandledrejection", () => hideLoading(true));

/* ---------- tiny utils ---------- */
function timeToSeconds(str) {
  if (str == null || str === "") return NaN;
  // supports mm:ss(.d) and h:mm:ss(.d)
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some(n => Number.isNaN(n))) return NaN;
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  return Number(str);
}
function secondsToPace(sec) {
  if (!Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- normalize split_report into a common shape ---------- */
// <PATCH-NORMALIZE-SPLITREPORT-TRACKMEET-JSON-20251104>
function normalizeSplitReport(split_report_raw) {
    // Accept either {_source:{...}} or the inner object directly
    const src = split_report_raw && split_report_raw._source ? split_report_raw._source : split_report_raw || {};
  
    // 1) Split labels from spd (ordered)
    //    Example: [{ n: "1K", nu: 0 }, ...]
    const splitLabels = Array.isArray(src.spd)
      ? src.spd
          .slice()
          .sort((a, b) => (a.nu ?? 0) - (b.nu ?? 0))
          .map(s => ({ label: String(s.n || "").trim() }))
      : [];
  
    // 2) Athletes from spr
    //    Each item: { r: { a:{ n, t:{ n team }, ... }, m final }, sp:[ { sp:{ cs cumulative, sp lap }, p place } ... ] }
    const athletes = Array.isArray(src.spr)
      ? src.spr.map(item => {
          const r = item.r || {};
          const a = r.a || {};
          const t = a.t || {};
          const placeNum = Number(r.p);
          const splits = Array.isArray(item.sp)
            ? item.sp.map((s, i) => {
                const label = splitLabels[i]?.label || `S${i + 1}`;
                const elapsed = s?.sp?.cs || ""; // cumulative time string
                const lap = s?.sp?.sp || "";     // lap/segment time string
                // precompute seconds for charts that want numbers
                const elapsed_s = timeToSeconds(elapsed);
                const lap_s     = timeToSeconds(lap);
                return { label, elapsed, elapsed_s, lap_s, place_at_split: s?.p ?? null };
              })
            : [];
          return {
            athlete_id: String(a.i ?? r.i ?? Math.random()).trim(),
            name: String(a.n || `${a.fn || ""} ${a.l || ""}`.trim()),
            team: String(t.n || t.f || "").trim(),
            place: Number.isFinite(placeNum) ? placeNum : undefined,
            final_time: r.m || (splits.at(-1)?.elapsed || ""),
            splits
          };
        })
      : [];
  
    // 3) Race meta
    const race = {
      name: src.n || "",
      splits: splitLabels
    };
  
    return { race, athletes };
  }
  // </PATCH-NORMALIZE-SPLITREPORT-TRACKMEET-JSON-20251104>
  
  
  

/* ---------- table rendering (simple, resilient) ---------- */
function setResultsHeader(labels, athletes) {
  const tr = document.querySelector("#resultsTable thead tr");
  if (!tr) return;
  const fixed = ["Place", "Name", "Team", "Time", "Points"]
    .map(t => `<th>${t}</th>`)
    .join("");

  let L = labels?.length || 0;
  if (!L) {
    L = Math.max(0, ...((athletes || []).map(a => (a.splits || []).length)));
    labels = Array.from({ length: L }, (_, i) => ({ label: `S${i + 1}` }));
  }
  tr.innerHTML = fixed + labels.map(l => `<th>${l.label || ""}</th>`).join("");
}

function renderResultsTable(data) {
  const tbody = document.getElementById("resultsBody");
  const teamFilter = document.getElementById("filterTeam");
  if (!tbody) return;

  const athletes = (data.athletes || [])
    .slice()
    .sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9));
  const labels = data?.race?.splits || [];

  setResultsHeader(labels, athletes);

  const teams = [...new Set(athletes.map(a => a.team).filter(Boolean))].sort();
  if (teamFilter && teamFilter.options.length <= 1) {
    teams.forEach(t => {
      const o = document.createElement("option");
      o.value = o.textContent = t;
      teamFilter.appendChild(o);
    });
  }

  const sel = (teamFilter && teamFilter.value) || "";
  const N =
    (labels && labels.length) ||
    Math.max(0, ...athletes.map(a => (a.splits || []).length));

  tbody.innerHTML = athletes
    .filter(a => !sel || a.team === sel)
    .map(a => {
      const cells = [
        a.place ?? "",
        a.name ?? "",
        a.team ?? "",
        a.final_time ?? "",
        a.place ?? ""
      ];
      for (let i = 0; i < N; i++) {
        const sp = a.splits?.[i];
        cells.push(sp?.elapsed ?? "");
      }
      return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
}
window.renderResultsTable = renderResultsTable;

/* ---------- raceDataAPI shim for charts.js (only what's needed) ---------- */
window.raceDataAPI = {
  raceData: null, // set later for getSplitKeys() compatibility if needed
  timeToSeconds,
  secondsToPace,
  getTeamAthletes(team) {
    return (window.__raceData?.athletes || []).filter(a => a.team === team);
  },
  getTeam(teamName) {
    const ath = (window.__raceData?.athletes || []).filter(a => a.team === teamName);
    // naive rollup
    const score = ath
      .map(a => a.place)
      .filter(n => Number.isFinite(n))
      .slice(0, 5)
      .reduce((s, x) => s + x, 0);
    const final_placement = Number.isFinite(score) ? score : null;
    return { score, final_placement };
  },
  getTeamSpread(teamName) {
    const ath = this.getTeamAthletes(teamName);
    const secs = ath.map(a => timeToSeconds(a.final_time)).filter(Number.isFinite);
    if (!secs.length) return NaN;
    return Math.max(...secs) - Math.min(...secs);
  },
  getAthleteSplits(athlete_id) {
    const a = (window.__raceData?.athletes || []).find(x => x.athlete_id === athlete_id);
    if (!a) return {};
    const out = {};
    (a.splits || []).forEach(sp => {
      out[sp.label] = sp.elapsed || secondsToPace(sp.elapsed_s);
    });
    return out;
  }
};

/* ---------- load + render orchestration ---------- */
// <PATCH-LOADEVENT-WIRE-20251104>
export async function loadEvent(eventId) {
    if (typeof window.loadEventFolder !== "function") {
      throw new Error("main.js is not loaded yet (no loadEventFolder)");
    }
    showLoading(`Loading ${eventId}...`);
    try {
      const { split_report: rawReport, team_colors: rawColors } = await window.loadEventFolder(eventId);
      const team_colors = rawColors || {};
  
      // Build color map from team_colors.json
      // Handle both team name keys and SVG filename keys
      if (window.chartFunctions?.applyTeamColors) {
        const colorMap = {};
        
        for (const [key, colorData] of Object.entries(team_colors)) {
          if (!colorData || !colorData.primary_hex) continue;
          
          // Use the key directly if it's a team name (has spaces or capital letters)
          if (/[A-Z]/.test(key) || /\s/.test(key)) {
            colorMap[key] = colorData.primary_hex;
          }
          
          // Also try to extract team name from logo_url if present
          if (colorData.logo_url) {
            const urlMatch = colorData.logo_url.match(/team-images\/([^.]+)/);
            if (urlMatch) {
              const filename = urlMatch[1];
              // Try to convert filename to team name format
              // e.g., "coastal-caro" -> could match "Coastal Carolina"
              // But we already have proper team names in the JSON, so this is backup
            }
          }
        }
        
        console.log('Applying team colors:', colorMap);
        window.chartFunctions.applyTeamColors(colorMap);
      }
  
      const normalized = normalizeSplitReport(rawReport);
      window.__raceData = normalized;
      // Build splits array for legacy getSplitKeys() function
      window.raceDataAPI.raceData = { 
        splits: (normalized.athletes || []).map(ath => {
          const row = { athlete_id: ath.athlete_id };
          (ath.splits || []).forEach(sp => {
            row[sp.label] = sp.elapsed || '';
          });
          return row;
        })
      };
  
      renderResultsTable(normalized);

      // Update header with race metadata
      const raceTitleEl = document.getElementById('raceTitle');
      const raceDateEl = document.getElementById('raceDate');
      const numAthletesEl = document.getElementById('numAthletes');
      const numTeamsEl = document.getElementById('numTeams');
      
      if (raceTitleEl) raceTitleEl.textContent = normalized.race.name || 'RACE_TITLE';
      if (raceDateEl) raceDateEl.textContent = '📍 RACE_DATE'; // Update when date is in JSON
      if (numAthletesEl) numAthletesEl.textContent = `👥 ${normalized.athletes.length} Athletes`;
      if (numTeamsEl) {
        const teamCount = new Set(normalized.athletes.map(a => a.team)).size;
        numTeamsEl.textContent = `🏫 ${teamCount} Teams`;
      }
  
      // Populate team selectors in top controls
      if (typeof window.populateTeamSelectors === "function") {
        window.populateTeamSelectors();
      }

      // Render Team Pace and Runner Compare charts
      if (typeof window.renderPaceViews === "function") {
        window.renderPaceViews();
      }

      // Render the 4 main charts with initial team selection
      const teams = [...new Set((normalized.athletes || []).map(a => a.team))].slice(0, 4);
      const C = window.chartFunctions || {};
      C.createPacingChart?.(teams);
      C.createPositionChart?.(teams);
      C.createSpreadChart?.(teams);
      C.createScoringChart?.(teams);
      C.renderInsights?.(teams);
  
      return { ok: true, eventId, athletes: normalized.athletes.length, splits: normalized.race.splits.length };
    } finally {
      hideLoading();
    }
  }
  // </PATCH-LOADEVENT-WIRE-20251104>
  


/* ---------- minimal UI wiring ---------- */
function currentEventFromQuery() {
  const u = new URL(window.location.href);
  return u.searchParams.get("event") || "2149044";
}
function wireControls() {
    const teamSel = document.getElementById("teamSelectPace");
    const teamSelB = document.getElementById("teamSelectPaceB");
    const avgChk = document.getElementById("teamPaceShowAvg");
    const showBTeam = document.getElementById("showBTeamRunners");
    const teamPaceViewToggle = document.getElementById("teamPaceViewToggle");
    const aSel = document.getElementById("runnerASelect");
    const bSel = document.getElementById("runnerBSelect");
    const filterTeam = document.getElementById("filterTeam");
    const eventInput = document.getElementById("eventId");
    const loadBtn = document.getElementById("loadBtn");
    const loadResultsBtn = document.getElementById("loadResultsBtn");
  
    // Collapsible sections
    const teamPaceToggle = document.getElementById("teamPaceToggle");
    const teamPaceContent = document.getElementById("teamPaceContent");
    const runnerCompareToggle = document.getElementById("runnerCompareToggle");
    const runnerCompareContent = document.getElementById("runnerCompareContent");
  
    if (teamPaceToggle && teamPaceContent) {
      teamPaceToggle.addEventListener("click", () => {
        const icon = teamPaceToggle.querySelector(".toggle-icon");
        const isHidden = teamPaceContent.style.display === "none";
        teamPaceContent.style.display = isHidden ? "block" : "none";
        icon.classList.toggle("expanded", isHidden);
      });
    }
  
    if (runnerCompareToggle && runnerCompareContent) {
      runnerCompareToggle.addEventListener("click", () => {
        const icon = runnerCompareToggle.querySelector(".toggle-icon");
        const isHidden = runnerCompareContent.style.display === "none";
        runnerCompareContent.style.display = isHidden ? "block" : "none";
        icon.classList.toggle("expanded", isHidden);
      });
    }
  
    // Team Pace chart controls
    if (teamSel) {
      teamSel.addEventListener("change", () => {
        if (window.renderTeamPaceChart) {
          window.renderTeamPaceChart(
            window.__raceData, 
            teamSel.value, 
            avgChk?.checked ?? true,
            teamSelB?.value || null,
            showBTeam?.checked ?? false
          );
        }
      });
    }
  
    if (teamSelB) {
      teamSelB.addEventListener("change", () => {
        if (window.renderTeamPaceChart && teamSel) {
          window.renderTeamPaceChart(
            window.__raceData,
            teamSel.value,
            avgChk?.checked ?? true,
            teamSelB.value || null,
            showBTeam?.checked ?? false
          );
        }
      });
    }
  
    if (avgChk) {
      avgChk.addEventListener("change", () => {
        if (window.renderTeamPaceChart && teamSel) {
          window.renderTeamPaceChart(
            window.__raceData, 
            teamSel.value, 
            avgChk.checked,
            teamSelB?.value || null,
            showBTeam?.checked ?? false
          );
        }
      });
    }
  
    if (showBTeam) {
      showBTeam.addEventListener("change", () => {
        if (window.renderTeamPaceChart && teamSel) {
          window.renderTeamPaceChart(
            window.__raceData,
            teamSel.value,
            avgChk?.checked ?? true,
            teamSelB?.value || null,
            showBTeam.checked
          );
        }
      });
    }
  
    if (teamPaceViewToggle) {
      teamPaceViewToggle.addEventListener("click", () => {
        const currentView = teamPaceViewToggle.dataset.view || "pace";
        const newView = currentView === "pace" ? "position" : "pace";
        teamPaceViewToggle.dataset.view = newView;
        teamPaceViewToggle.textContent = newView === "pace" ? "Switch to Position" : "Switch to Pace";
        
        if (window.renderTeamPaceChart && teamSel) {
          window.renderTeamPaceChart(
            window.__raceData,
            teamSel.value,
            avgChk?.checked ?? true,
            teamSelB?.value || null,
            showBTeam?.checked ?? false,
            newView
          );
        }
      });
    }
    // Wire up runner compare view toggle
    const runnerCompareViewToggle = document.getElementById('runnerCompareViewToggle');
    if (runnerCompareViewToggle) {
        runnerCompareViewToggle.addEventListener('click', () => {
            const currentView = runnerCompareViewToggle.dataset.view || 'pace';
            const newView = currentView === 'pace' ? 'position' : 'pace';
            runnerCompareViewToggle.dataset.view = newView;
            runnerCompareViewToggle.textContent = newView === 'pace' ? 'Switch to Position' : 'Switch to Pace';

            if (window.renderRunnerCompareChart && aSel && bSel) {
                window.renderRunnerCompareChart(window.__raceData, aSel.value, bSel.value, newView);
            }
        });
    }
    if (aSel) aSel.addEventListener("change", () => {
        if (window.renderRunnerCompareChart && aSel.value && bSel?.value) {
          const viewMode = runnerCompareViewToggle?.dataset.view || 'pace';
          window.renderRunnerCompareChart(window.__raceData, aSel.value, bSel.value, viewMode);
        }
      });
    if (bSel) bSel.addEventListener("change", () => {
        if (window.renderRunnerCompareChart && aSel?.value && bSel.value) {
            const viewMode = runnerCompareViewToggle?.dataset.view || 'pace';
            window.renderRunnerCompareChart(window.__raceData, aSel.value, bSel.value, viewMode);
        }
    });
    if (filterTeam) {
      filterTeam.addEventListener("change", () => renderResultsTable(window.__raceData));
    }
  
    // Wire up pacing chart view toggle
    const pacingViewToggle = document.getElementById('pacingViewToggle');
    if (pacingViewToggle) {
      pacingViewToggle.addEventListener('click', () => {
        const currentView = pacingViewToggle.dataset.view || 'pace';
        const newView = currentView === 'pace' ? 'position' : 'pace';
        pacingViewToggle.dataset.view = newView;
        pacingViewToggle.textContent = newView === 'pace' ? 'Switch to Position' : 'Switch to Pace';
        
        // Re-render with current teams
        const data = window.__raceData;
        if (!data) return;
        const teamSelect = document.getElementById('teamSelect');
        const compareTeams = document.getElementById('compareTeams');
        let teams = [];
        if (teamSelect?.value) teams.push(teamSelect.value);
        if (compareTeams) {
          teams.push(...Array.from(compareTeams.selectedOptions).map(o => o.value));
        }
        if (!teams.length) {
          teams = [...new Set((data.athletes || []).map(a => a.team))].slice(0, 4);
        }
        teams = [...new Set(teams)];
        
        if (window.chartFunctions?.createPacingChart) {
          window.chartFunctions.createPacingChart(teams, newView);
        }
      });
    }
  
    // Wire up top panel team selectors to refresh all 4 main charts
    const teamSelect = document.getElementById('teamSelect');
    const compareTeams = document.getElementById('compareTeams');
    const showDisplacers = document.getElementById('showDisplacers');
    const resetBtn = document.getElementById('resetBtn');
  
    function refreshMainCharts() {
      const data = window.__raceData;
      if (!data) return;
  
      let teams = [];
      if (teamSelect && teamSelect.value) {
        teams.push(teamSelect.value);
      }
      if (compareTeams) {
        const selected = Array.from(compareTeams.selectedOptions).map(o => o.value);
        teams.push(...selected);
      }
  
      if (!teams.length) {
        teams = [...new Set((data.athletes || []).map(a => a.team))].slice(0, 4);
      }
  
      teams = [...new Set(teams)];
  
      const C = window.chartFunctions || {};
      const pacingView = document.getElementById('pacingViewToggle')?.dataset.view || 'pace';
      C.createPacingChart?.(teams, pacingView);
      C.createPositionChart?.(teams);
      C.createSpreadChart?.(teams);
      C.createScoringChart?.(teams);
      C.renderInsights?.(teams);
    }
  
    if (teamSelect) {
      teamSelect.addEventListener('change', refreshMainCharts);
    }
    if (compareTeams) {
      compareTeams.addEventListener('change', refreshMainCharts);
    }
    if (showDisplacers) {
      showDisplacers.addEventListener('change', refreshMainCharts);
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (teamSelect) teamSelect.selectedIndex = 0;
        if (compareTeams) compareTeams.selectedIndex = -1;
        if (showDisplacers) showDisplacers.checked = false;
        refreshMainCharts();
      });
    }
    if (eventInput && loadBtn) {
      loadBtn.addEventListener("click", () => {
        const id = eventInput.value.trim() || currentEventFromQuery();
        loadEvent(id);
      });
    }
    if (loadResultsBtn) {
      loadResultsBtn.addEventListener("click", () => {
        const wrapper = document.getElementById("resultsTableWrapper");
        if (wrapper) {
          wrapper.style.display = "block";
          loadResultsBtn.style.display = "none";
        }
      });
    }
  
    // Populate top panel team selectors when data loads
    window.populateTeamSelectors = function() {
      const data = window.__raceData;
      if (!data) return;
  
      const teams = [...new Set((data.athletes || []).map(a => a.team))].sort();
      
      // Populate single team select
      if (teamSelect && teamSelect.options.length <= 1) {
        const placeholder = teamSelect.querySelector('option');
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value = opt.textContent = t;
          teamSelect.appendChild(opt);
        });
        if (teams.length && placeholder) {
          teamSelect.selectedIndex = 1;
        }
      }
  
      // Populate multi-select compare teams
      if (compareTeams && !compareTeams.options.length) {
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value = opt.textContent = t;
          compareTeams.appendChild(opt);
        });
      }
  
      // Populate team pace selectors (A and B)
      if (teamSel && teamSel.options.length === 0) {
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value = opt.textContent = t;
          teamSel.appendChild(opt);
        });
      }
  
      if (teamSelB && teamSelB.options.length <= 1) {
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value = opt.textContent = t;
          teamSelB.appendChild(opt);
        });
      }
  
      // Populate runner selectors
      const athletes = (data.athletes || []).sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
      [aSel, bSel].forEach(sel => {
        if (sel && sel.options.length === 0) {
          athletes.forEach(ath => {
            const opt = document.createElement('option');
            opt.value = ath.athlete_id;
            opt.textContent = `${ath.name} (${ath.team})`;
            sel.appendChild(opt);
          });
        }
      });
    };
  // Wire scraper form
  const scrapeBtn = document.getElementById('scrapeBtn');
  const xpressUrl = document.getElementById('xpressUrl');
  const githubToken = document.getElementById('githubToken');
  const scrapeStatus = document.getElementById('scrapeStatus');
  const showTokenInstructions = document.getElementById('showTokenInstructions');

  if (showTokenInstructions) {
    showTokenInstructions.addEventListener('click', (e) => {
      e.preventDefault();
      alert(`GitHub Token Setup Instructions:

1. Go to GitHub.com → Settings (your profile)
2. Scroll to "Developer settings" (bottom left)
3. Click "Personal access tokens" → "Tokens (classic)"
4. Click "Generate new token (classic)"
5. Name it "Race Scraper"
6. Check these permissions:
   ✅ repo (full control)
   ✅ workflow
7. Click "Generate token"
8. COPY IT IMMEDIATELY (you can't see it again!)
9. Paste it in the "GitHub Token" field above

Keep it secret! Don't share it or commit it to code.`);
    });
  }

  if (scrapeBtn && xpressUrl && githubToken && scrapeStatus) {
    // Load token from localStorage if exists
    const savedToken = localStorage.getItem('githubToken');
    if (savedToken) {
      githubToken.value = savedToken;
    }

    scrapeBtn.addEventListener('click', async () => {
      const url = xpressUrl.value.trim();
      const token = githubToken.value.trim();

      if (!url) {
        alert('Please enter an XpressTiming URL');
        return;
      }

      // Save token to localStorage
      if (token) {
        localStorage.setItem('githubToken', token);
      }

      // Show loading state
      scrapeBtn.disabled = true;
      scrapeBtn.textContent = 'Scraping...';
      scrapeStatus.className = 'scrape-status loading';
      scrapeStatus.style.display = 'block';
      scrapeStatus.textContent = '🔄 Triggering scraper... This may take 60-90 seconds.';

      try {
        const result = await window.handleScrapeSubmit(url, token);

        if (result.success) {
          if (result.cached) {
            scrapeStatus.className = 'scrape-status success';
            scrapeStatus.textContent = '✅ Event data already cached! Loading now...';
          } else {
            scrapeStatus.className = 'scrape-status success';
            scrapeStatus.textContent = '✅ Scraping complete! Loading event data...';
          }

          // Load the event
          setTimeout(() => {
            loadEvent(result.eventId);
            xpressUrl.value = '';
          }, 1500);
        } else {
          scrapeStatus.className = 'scrape-status error';
          scrapeStatus.textContent = `❌ Error: ${result.error || 'Scraping failed'}`;
        }
      } catch (error) {
        scrapeStatus.className = 'scrape-status error';
        scrapeStatus.textContent = `❌ Error: ${error.message}`;
      } finally {
        scrapeBtn.disabled = false;
        scrapeBtn.textContent = 'Scrape & Load';
      }
    });
  }
}

/* ---------- boot ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  wireControls();
  const eventId = currentEventFromQuery();
  const input = document.getElementById("eventId");
  if (input && !input.value) input.value = eventId;
  await loadEvent(eventId);
});

// Handy global for console/manual reloads
window.loadEvent = loadEvent;