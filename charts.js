/**
 * charts.js
 * Version: v2.0-dynamic-splits
 * Summary: Dynamic split detection/sorting (K and mile), Chart.js renderers,
 *          and small UX tweaks. Backward compatible exports.
 *
 * VCS Notes:
 * - Added [PATCH-DYNAMIC-SPLITS-HELPERS] with parseDistanceToMeters() and getSplitKeys().
 * - Rewrote createPacingChart to use dynamic split keys and pace formatting.
 * - Exported getSplitKeys so app.js can render dynamic table headers.
 * - Left position/spread/scoring compatible with existing data APIs.
 * - Safe to drop-in replace prior charts.js.
 */

/* =========================
   CHART INSTANCES & COLORS
   ========================= */
   import Chart from "chart.js/auto";

   let charts = {
    pacing: null,
    position: null,
    spread: null,
    scoring: null
  };
  
  // Default palette; can be overridden at runtime via applyTeamColors()
const TEAM_COLORS_DEFAULT = {
    'Coastal Carolina': '#006F71',
    'App State': '#222222',
    'Southern Miss.': '#FFCC00',
    'Texas State': '#6D1E2E',
    'Louisiana': '#CE1126',
    'Arkansas State': '#CC0000',
    'James Madison': '#450084'
  };
  const TEAM_COLORS_RUNTIME = {};
  
  export function applyTeamColors(map = {}) {
    Object.assign(TEAM_COLORS_RUNTIME, map || {});
    window.__raceColors = { ...TEAM_COLORS_DEFAULT, ...TEAM_COLORS_RUNTIME };
  }
  
  function colorFor(team, alpha = 0.85) {
    const hex = (TEAM_COLORS_RUNTIME[team] || TEAM_COLORS_DEFAULT[team]);
    if (!hex) {
      const hash = Array.from(team || 'x').reduce((h, c) => (h * 33) ^ c.charCodeAt(0), 5381) >>> 0;
      const r = (hash & 0xFF0000) >> 16;
      const g = (hash & 0x00FF00) >> 8;
      const b = (hash & 0x0000FF);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const v = hex.replace('#','');
    const r = parseInt(v.slice(0,2),16);
    const g = parseInt(v.slice(2,4),16);
    const b = parseInt(v.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  
  
  /* ===================================
     [PATCH-DYNAMIC-SPLITS-HELPERS]
     =================================== */
  
  // Convert a split label to meters for sorting (supports 4.1K, 1k, 1 mile, Mile 1, mi 1, Split_2K)
  function parseDistanceToMeters(label) {
    const s = String(label || '')
      .trim()
      .toLowerCase()
      .replace(/^split[_\s:.-]*/,'')
      .replace(/^km\b/,'k'); // normalize "km" -> "k"
  
    const m = s.match(/(\d+(?:\.\d+)?)/);
    if (!m) return Number.POSITIVE_INFINITY;
  
    const n = parseFloat(m[1]);
    if (/\bmi|mile/.test(s)) return n * 1609.344;
    // treat as kilometers by default
    return n * 1000;
  }
  
  // Gather and sort split columns from raceData.splits
  function getSplitKeys() {
    const splits = window.raceDataAPI?.raceData?.splits || [];
    if (!splits.length) return [];
    const set = new Set();
    for (const row of splits) {
      for (const k of Object.keys(row)) {
        if (k !== 'athlete_id' && k !== '' && row[k] !== undefined) set.add(k);
      }
    }
    return Array.from(set).sort((a,b) => parseDistanceToMeters(a) - parseDistanceToMeters(b));
  }
  
  /* =========================
     SMALL STATS HELPERS
     ========================= */
  function avg(nums) {
    if (!nums.length) return null;
    return nums.reduce((s,x)=>s+x,0) / nums.length;
  }
  // Utilities
const __charts = window.__charts || (window.__charts = {});
function secondsToPaceLabel(s) {
  if (!isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function getSplitLabels(data) {
  if (data?.race?.splits?.length) return data.race.splits.map(s => s.label);
  // fallback
  const n = (data?.athletes?.[0]?.splits?.length) || 5;
  return Array.from({length: n}, (_, i) => `${i+1}K`);
}
function athletePaceSeries(ath) {
  // lap_s is already per-km pace from the parser. If absent, compute from elapsed_s.
  const out = [];
  let prev = 0;
  (ath.splits || []).forEach((sp, i) => {
    const lap = (sp.lap_s != null) ? sp.lap_s : (sp.elapsed_s - prev);
    out.push(lap);
    prev = sp.elapsed_s;
  });
  return out;
}
function teamAthletes(data, teamName) {
  return (data.athletes || []).filter(a => a.team === teamName);
}
function computeTeamAveragePace(athletes) {
  if (!athletes.length) return [];
  const len = athletes[0].splits?.length || 0;
  const sum = Array(len).fill(0);
  let count = 0;
  for (const a of athletes) {
    const p = athletePaceSeries(a);
    if (p.length !== len) continue;
    for (let i = 0; i < len; i++) sum[i] += p[i];
    count++;
  }
  return count ? sum.map(v => v / count) : [];
}
function destroyChart(key) {
  if (__charts[key]) { __charts[key].destroy(); __charts[key] = null; }
}

// Renderer: Team Pace Lines
window.renderTeamPaceChart = function renderTeamPaceChart(data, teamName, showAvg=true, bTeamName=null, showBRunners=false, viewMode='pace') {
    const ctx = document.getElementById('teamPaceChart');
    if (!ctx) return;
    destroyChart('teamPaceChart');
  
    const labels = getSplitLabels(data);
    const athletesA = teamAthletes(data, teamName);
    const athletesB = bTeamName ? teamAthletes(data, bTeamName) : [];
  
    const teamColorA = colorFor(teamName, 0.9);
    const teamColorB = bTeamName ? colorFor(bTeamName, 0.9) : null;
  
    const datasets = [];
  
    // Helper to get series data based on view mode
    function getSeriesData(ath) {
      if (viewMode === 'position') {
        return (ath.splits || []).map(sp => sp.place_at_split);
      }
      return athletePaceSeries(ath);
    }
  
    function computeTeamAverageForView(athletes) {
      if (!athletes.length) return [];
      const len = athletes[0].splits?.length || 0;
      const sum = Array(len).fill(0);
      let count = 0;
      
      for (const a of athletes) {
        const series = getSeriesData(a);
        if (series.length !== len) continue;
        for (let i = 0; i < len; i++) {
          if (series[i] != null) sum[i] += series[i];
        }
        count++;
      }
      return count ? sum.map(v => v / count) : [];
    }
  
    // Team A average (always show if requested)
    if (showAvg && athletesA.length) {
      const avgData = computeTeamAverageForView(athletesA);
      datasets.push({
        label: `${teamName} (avg)`,
        data: avgData,
        borderColor: teamColorA,
        backgroundColor: colorFor(teamName, 0.2),
        borderWidth: 4,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true
      });
    }
  
    // Team A individual runners (cap to 15 for readability)
    const maxLines = 15;
    athletesA.slice(0, maxLines).forEach((a, idx) => {
      const athleteAlpha = 0.25 + (idx * 0.04);
      datasets.push({
        label: a.name,
        data: getSeriesData(a),
        borderColor: colorFor(teamName, athleteAlpha),
        backgroundColor: colorFor(teamName, athleteAlpha * 0.3),
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        spanGaps: true
      });
    });
  
    // Team B average (if B team selected)
    if (bTeamName && athletesB.length) {
      const avgDataB = computeTeamAverageForView(athletesB);
      datasets.push({
        label: `${bTeamName} (avg)`,
        data: avgDataB,
        borderColor: teamColorB,
        backgroundColor: colorFor(bTeamName, 0.2),
        borderWidth: 4,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
        borderDash: [5, 5]
      });
  
      // Team B individual runners (if checkbox enabled)
      if (showBRunners) {
        athletesB.slice(0, maxLines).forEach((a, idx) => {
          const athleteAlpha = 0.25 + (idx * 0.04);
          datasets.push({
            label: `${a.name} (B)`,
            data: getSeriesData(a),
            borderColor: colorFor(bTeamName, athleteAlpha),
            backgroundColor: colorFor(bTeamName, athleteAlpha * 0.3),
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            spanGaps: true,
            borderDash: [3, 3]
          });
        });
      }
    }
  
    const yAxisConfig = viewMode === 'position' ? {
      title: { 
        display: true, 
        text: 'Position (place)',
        font: { size: 12, weight: 'bold' }
      },
      reverse: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
        callback: (v) => Math.round(v)
      }
    } : {
      title: { 
        display: true, 
        text: 'Pace (mm:ss/km)',
        font: { size: 12, weight: 'bold' }
      },
      reverse: false,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
        callback: (v) => secondsToPaceLabel(v)
      }
    };
  
    const tooltipCallback = viewMode === 'position' ? 
      (ctx) => `${ctx.dataset.label}: Place ${Math.round(ctx.parsed.y)}` :
      (ctx) => `${ctx.dataset.label}: ${secondsToPaceLabel(ctx.parsed.y)} /km`;
  
    __charts.teamPaceChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { 
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 15,
              font: { size: 11 }
            },
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              const meta = ci.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
              ci.update();
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 },
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              label: tooltipCallback
            }
          },
          title: { display: false }
        },
        scales: {
          y: yAxisConfig,
          x: { 
            title: { 
              display: true, 
              text: 'Split Marker',
              font: { size: 12, weight: 'bold' }
            },
            grid: {
              display: false
            }
          }
        },
        animation: {
          duration: 750,
          easing: 'easeInOutQuart'
        }
      }
    });
  };
// Renderer: Runner Split Compare (A vs B, any teams) patched 11/04 3p
window.renderRunnerCompareChart = function renderRunnerCompareChart(data, athleteIdA, athleteIdB, viewMode='pace') {
    const ctx = document.getElementById('runnerCompareChart');
    if (!ctx) return;
    destroyChart('runnerCompareChart');
  
    const labels = getSplitLabels(data);
    const byId = new Map((data.athletes || []).map(a => [a.athlete_id, a]));
    const A = byId.get(athleteIdA);
    const B = byId.get(athleteIdB);
    const datasets = [];
  
    function getRunnerData(athlete) {
      if (viewMode === 'position') {
        return (athlete.splits || []).map(sp => sp.place_at_split);
      }
      return athletePaceSeries(athlete);
    }
  
    if (A) {
      datasets.push({ 
        label: `${A.name} (${A.team})`, 
        data: getRunnerData(A), 
        borderColor: colorFor(A.team, 0.9),
        backgroundColor: colorFor(A.team, 0.2),
        borderWidth: 3, 
        pointRadius: 4, 
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true
      });
    }
    if (B) {
      datasets.push({ 
        label: `${B.name} (${B.team})`, 
        data: getRunnerData(B), 
        borderColor: colorFor(B.team, 0.9),
        backgroundColor: colorFor(B.team, 0.2),
        borderWidth: 3, 
        pointRadius: 4, 
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true
      });
    }
  
    const yAxisConfig = viewMode === 'position' ? {
      title: { 
        display: true, 
        text: 'Position (place)',
        font: { size: 12, weight: 'bold' }
      },
      reverse: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
        callback: (v) => Math.round(v)
      }
    } : {
      title: { 
        display: true, 
        text: 'Pace (mm:ss/km)',
        font: { size: 12, weight: 'bold' }
      },
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
        callback: (v) => secondsToPaceLabel(v)
      }
    };
  
    const tooltipCallback = viewMode === 'position' ?
      (c) => `${c.dataset.label}: Place ${Math.round(c.parsed.y)}` :
      (c) => `${c.dataset.label}: ${secondsToPaceLabel(c.parsed.y)} /km`;
  
    __charts.runnerCompareChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { 
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 15,
              font: { size: 12 }
            },
            onClick: function(e, legendItem, legend) {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              const meta = ci.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
              ci.update();
            }
          },
          tooltip: { 
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 },
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: { 
              label: tooltipCallback
            } 
          }
        },
        scales: {
          y: yAxisConfig,
          x: { 
            title: { 
              display: true, 
              text: 'Split Marker',
              font: { size: 12, weight: 'bold' }
            },
            grid: {
              display: false
            }
          }
        },
        animation: {
          duration: 750,
          easing: 'easeInOutQuart'
        }
      }
    });
  };

// Tiny orchestrator called by app.js after data load
window.renderPaceViews = function renderPaceViews() {
  const data = window.__raceData;
  if (!data) return;

  // Populate team select
  const teamSel = document.getElementById('teamSelectPace');
  if (teamSel && !teamSel.options.length) {
    const teams = Array.from(new Set((data.athletes||[]).map(a => a.team))).sort();
    for (const t of teams) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = t;
      teamSel.appendChild(opt);
    }
  }

  // Populate runner lists for A/B
  const aSel = document.getElementById('runnerASelect');
  const bSel = document.getElementById('runnerBSelect');
  function fillRunner(sel) {
    if (!sel || sel.options.length) return;
    for (const a of (data.athletes||[])) {
      const opt = document.createElement('option');
      opt.value = a.athlete_id;
      opt.textContent = `${a.name} — ${a.team}`;
      sel.appendChild(opt);
    }
  }
  fillRunner(aSel); fillRunner(bSel);

  // Initial renders (defaults)
  const defaultTeam = teamSel?.value || (data.athletes?.[0]?.team) || '';
  const showAvg = document.getElementById('teamPaceShowAvg')?.checked ?? true;
  if (defaultTeam) window.renderTeamPaceChart(data, defaultTeam, showAvg);
  if (aSel?.value && bSel?.value) window.renderRunnerCompareChart(data, aSel.value, bSel.value);
};

/* =========================
     SPLIT PACE PROGRESSION
     Uses dynamic split keys, loops through normalized data,
     calculates lap pace per split.
     ========================= */
     function createPacingChart(teamsToVisualize = [], viewMode = 'pace') {
        const ctx = document.getElementById('pacingChart');
        if (!ctx) return;
      
        const data = window.__raceData;
        if (!data || !data.athletes) return;
      
        const labels = data.race?.splits?.map(s => s.label) || ['1K', '2K', '3K', '4K', '5K'];
      
        // Build datasets
        const datasets = teamsToVisualize.map(teamName => {
          const teamAthletes = data.athletes.filter(a => a.team === teamName);
          
          // Get top 5 scorers
          const scorers = teamAthletes
            .filter(a => Number.isFinite(a.place))
            .sort((a, b) => a.place - b.place)
            .slice(0, 5);
      
          if (viewMode === 'position') {
            // Average position at each split
            const avgPositions = labels.map((label, idx) => {
              const positions = scorers
                .map(ath => ath.splits?.[idx]?.place_at_split)
                .filter(p => Number.isFinite(p));
              
              if (positions.length === 0) return null;
              return positions.reduce((sum, p) => sum + p, 0) / positions.length;
            });
      
            return {
              label: teamName,
              data: avgPositions,
              borderColor: colorFor(teamName, 0.9),
              backgroundColor: colorFor(teamName, 0.2),
              borderWidth: 3,
              tension: 0.3,
              pointRadius: 4,
              pointHoverRadius: 6,
              spanGaps: true,
              fill: true
            };
          } else {
            // Average pace at each split (existing logic)
            const avgPaces = labels.map((label, idx) => {
              const paces = scorers
                .map(ath => {
                  const sp = ath.splits?.[idx];
                  if (!sp) return null;
                  // Use lap_s if available, otherwise compute from elapsed
                  if (sp.lap_s != null && Number.isFinite(sp.lap_s)) return sp.lap_s;
                  if (idx === 0) return sp.elapsed_s;
                  const prevSp = ath.splits?.[idx - 1];
                  if (!prevSp || !Number.isFinite(prevSp.elapsed_s)) return null;
                  return sp.elapsed_s - prevSp.elapsed_s;
                })
                .filter(p => Number.isFinite(p));
              
              if (paces.length === 0) return null;
              return paces.reduce((sum, p) => sum + p, 0) / paces.length;
            });
      
            return {
              label: teamName,
              data: avgPaces,
              borderColor: colorFor(teamName, 0.9),
              backgroundColor: colorFor(teamName, 0.2),
              borderWidth: 3,
              tension: 0.3,
              pointRadius: 4,
              pointHoverRadius: 6,
              spanGaps: true,
              fill: true
            };
          }
        });
      
        charts.pacing?.destroy();
        charts.pacing = new Chart(ctx, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  usePointStyle: true,
                  padding: 15,
                  font: { size: 12 }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                callbacks: {
                  label: viewMode === 'position' 
                    ? (ctx) => `${ctx.dataset.label}: Place ${ctx.parsed.y.toFixed(1)}`
                    : (ctx) => `${ctx.dataset.label}: ${secondsToPaceLabel(ctx.parsed.y)} /km`
                }
              }
            },
            scales: {
              y: viewMode === 'position' ? {
                title: {
                  display: true,
                  text: 'Average Position (lower is better)',
                  font: { size: 12, weight: 'bold' }
                },
                reverse: true,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                },
                ticks: {
                  callback: (v) => Math.round(v)
                }
              } : {
                title: {
                  display: true,
                  text: 'Pace (mm:ss per km)',
                  font: { size: 12, weight: 'bold' }
                },
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                },
                ticks: {
                  callback: (value) => secondsToPaceLabel(value)
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Split Marker',
                  font: { size: 12, weight: 'bold' }
                },
                grid: { display: false }
              }
            },
            animation: {
              duration: 750,
              easing: 'easeInOutQuart'
            }
          }
        });
      }
  /* =========================
     PACING CHART (dynamic)
     ========================= */
     function createPositionChart(teamsToVisualize = []) {
        const ctx = document.getElementById('positionChart');
        if (!ctx) return;
      
        const data = window.__raceData;
        if (!data || !data.athletes) return;
      
        const labels = data.race?.splits?.map(s => s.label) || ['1K', '2K', '3K', '4K', '5K'];
      
        // Build datasets - average position for each team at each split
        const datasets = teamsToVisualize.map(teamName => {
          const teamAthletes = data.athletes.filter(a => a.team === teamName);
          
          // Get top 5 scorers only
          const scorers = teamAthletes
            .filter(a => Number.isFinite(a.place))
            .sort((a, b) => a.place - b.place)
            .slice(0, 5);
      
          // Calculate average position at each split
          const avgPositions = labels.map((label, idx) => {
            const positions = scorers
              .map(ath => ath.splits?.[idx]?.place_at_split)
              .filter(p => Number.isFinite(p));
            
            if (!positions.length) return null;
            return positions.reduce((sum, p) => sum + p, 0) / positions.length;
          });
      
          return {
            label: teamName,
            data: avgPositions,
            borderColor: colorFor(teamName, 0.9),
            backgroundColor: colorFor(teamName, 0.2),
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true
          };
        });
      
        charts.position?.destroy();
        charts.position = new Chart(ctx, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  usePointStyle: true,
                  padding: 15,
                  font: { size: 12 }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} place`
                }
              }
            },
            scales: {
              y: {
                title: {
                  display: true,
                  text: 'Average Position (lower is better)',
                  font: { size: 12, weight: 'bold' }
                },
                reverse: true,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Split Marker',
                  font: { size: 12, weight: 'bold' }
                },
                grid: { display: false }
              }
            },
            animation: {
              duration: 750,
              easing: 'easeInOutQuart'
            }
          }
        });
      }
  
  /* =========================
     TEAM SPREAD CHART
     Uses existing API getTeamSpread(team) which should
     return seconds spread; if not available, compute simple IQR.
     ========================= */
     function createSpreadChart(teamsToVisualize = []) {
        const ctx = document.getElementById('spreadChart');
        if (!ctx) return;
      
        const data = window.__raceData;
        if (!data || !data.athletes) return;
      
        const labels = data.race?.splits?.map(s => s.label) || ['1K', '2K', '3K', '4K', '5K'];
      
        // Build datasets - spread between 1st and 5th scorer at each split
        const datasets = teamsToVisualize.map(teamName => {
          const teamAthletes = data.athletes.filter(a => a.team === teamName);
          
          // Get top 5 scorers
          const scorers = teamAthletes
            .filter(a => Number.isFinite(a.place))
            .sort((a, b) => a.place - b.place)
            .slice(0, 5);
      
          // Calculate spread at each split (5th - 1st time)
          const spreads = labels.map((label, idx) => {
            const times = scorers
              .map(ath => ath.splits?.[idx]?.elapsed_s)
              .filter(t => Number.isFinite(t))
              .sort((a, b) => a - b);
            
            if (times.length < 2) return null;
            return times[times.length - 1] - times[0]; // max - min
          });
      
          return {
            label: teamName,
            data: spreads,
            backgroundColor: colorFor(teamName, 0.6),
            borderColor: colorFor(teamName, 0.9),
            borderWidth: 2
          };
        });
      
        charts.spread?.destroy();
        charts.spread = new Chart(ctx, {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  usePointStyle: true,
                  padding: 15,
                  font: { size: 12 }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}s spread`
                }
              }
            },
            scales: {
              y: {
                title: {
                  display: true,
                  text: 'Time Spread (seconds)',
                  font: { size: 12, weight: 'bold' }
                },
                beginAtZero: true,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Split Marker',
                  font: { size: 12, weight: 'bold' }
                },
                grid: { display: false }
              }
            },
            animation: {
              duration: 750,
              easing: 'easeInOutQuart'
            }
          }
        });
      }
  
  /* =========================
     TEAM SCORING CHART
     Bar chart of team score or final placement.
     ========================= */
     function createScoringChart(teamsToVisualize = []) {
        const ctx = document.getElementById('scoringChart');
        if (!ctx) return;
      
        const data = window.__raceData;
        if (!data || !data.athletes) return;
      
        const labels = data.race?.splits?.map(s => s.label) || ['1K', '2K', '3K', '4K', '5K'];
      
        // Build datasets - cumulative score at each split
        const datasets = teamsToVisualize.map(teamName => {
          const teamAthletes = data.athletes.filter(a => a.team === teamName);
          
          // Get top 5 scorers
          const scorers = teamAthletes
            .filter(a => Number.isFinite(a.place))
            .sort((a, b) => a.place - b.place)
            .slice(0, 5);
      
          // Calculate cumulative score at each split (sum of top 5 positions)
          const scores = labels.map((label, idx) => {
            const positions = scorers
              .map(ath => ath.splits?.[idx]?.place_at_split)
              .filter(p => Number.isFinite(p))
              .sort((a, b) => a - b)
              .slice(0, 5);
            
            if (positions.length === 0) return null;
            return positions.reduce((sum, p) => sum + p, 0);
          });
      
          return {
            label: teamName,
            data: scores,
            borderColor: colorFor(teamName, 0.9),
            backgroundColor: colorFor(teamName, 0.2),
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true,
            fill: true
          };
        });
      
        charts.scoring?.destroy();
        charts.scoring = new Chart(ctx, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  usePointStyle: true,
                  padding: 15,
                  font: { size: 12 }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} points`
                }
              }
            },
            scales: {
              y: {
                title: {
                  display: true,
                  text: 'Cumulative Score (lower is better)',
                  font: { size: 12, weight: 'bold' }
                },
                beginAtZero: true,
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  drawBorder: false
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Race Progression',
                  font: { size: 12, weight: 'bold' }
                },
                grid: { display: false }
              }
            },
            animation: {
              duration: 750,
              easing: 'easeInOutQuart'
            }
          }
        });
      }
  /* =========================
     INSIGHTS (optional)
     ========================= */
  function renderInsights(teamsToVisualize = []) {
    const div = document.getElementById('insightsPanel');
    if (!div) return;
    let html = '';
    teamsToVisualize.forEach(t => {
      try {
        const spread = window.raceDataAPI.getTeamSpread(t);
        if (Number.isFinite(spread) && spread > 90) {
          html += `⚠️ ${t}: wide spread (${spread.toFixed(0)}s)<br>`;
        }
      } catch {}
    });
    div.innerHTML = html;
  }
  
  /* =========================
     EXPORTS
     ========================= */
  window.chartFunctions = {
    createPacingChart,
    createPositionChart,
    createSpreadChart,
    createScoringChart,
    renderInsights,
    applyTeamColors, // Export for app.js to call
    getSplitKeys // for app.js to build dynamic tables
  };
  
  export {
    getSplitKeys,
    createPacingChart,
    createPositionChart,
    createSpreadChart,
    createScoringChart
  };