// Modern vanilla JS frontend for Baseball Simulator
import { parseTables } from './utils/parseTables.js';
import { parseStatTable } from './utils/statParser.js';
import { normalizeBattingStats, normalizePitchingStats } from './utils/statNormalizer.js';

// --- DOM Elements ---
const homeSelect = document.getElementById('home-team-select');
const awaySelect = document.getElementById('away-team-select');
const loadTeamsBtn = document.getElementById('load-teams-btn');
const statusDiv = document.getElementById('status');
const lineupsContainer = document.getElementById('lineups-container');

// --- Utility: Hardcoded list of available teams ---
async function fetchAvailableTeams() {
  // Add or update this list as needed
  return [
    "CHC-2025.html",
    "MIL-2025.html"
    // Add more team files here
  ];
}

/**
 * @param {string} filename
 */
async function loadTeamFile(filename) {
  const res = await fetch(`./data/${filename}`);
  const html = await res.text();
  const { batting, pitching } = parseTables(html);
  const battersRaw = batting ? parseStatTable(batting) : [];
  const pitchersRaw = pitching ? parseStatTable(pitching) : [];
  const batters = normalizeBattingStats(/** @type {any[]} */(battersRaw));
  const pitchers = normalizePitchingStats(/** @type {any[]} */(pitchersRaw));
  return { batters, pitchers };
}

/**
 * @param {{ batters: any[], pitchers: any[] } | null | undefined} home
 * @param {{ batters: any[], pitchers: any[] } | null | undefined} away
 */
function renderLineups(home, away) {
  if (!lineupsContainer) return;
  lineupsContainer.innerHTML = '';
  /**
   * @param {{ batters: any[], pitchers: any[] } | null | undefined} team
   * @param {string} label
   */
  const makeTable = (team, label) => {
    if (!team) return `<div><strong>${label}:</strong> Not loaded</div>`;
    const pitcher = (team.pitchers && team.pitchers[0]) || { name: 'N/A' };
    return `
      <div style="margin-bottom:1.5em;">
        <strong>${label} Lineup</strong>
        <table class="lineup-table">
          <thead><tr><th>#</th><th>Name</th><th>PA</th></tr></thead>
          <tbody>
            ${(team.batters || []).slice(0, 9).map((b, i) => `<tr><td>${i+1}</td><td>${b.name || ''}</td><td>${b.PA || ''}</td></tr>`).join('')}
          </tbody>
        </table>
        <div><strong>Pitcher:</strong> ${pitcher.name}</div>
      </div>
    `;
  };
  lineupsContainer.innerHTML = `
    <div style="display:flex;gap:2em;flex-wrap:wrap;">
      <div style="flex:1;min-width:250px;">${makeTable(home, 'Home')}</div>
      <div style="flex:1;min-width:250px;">${makeTable(away, 'Away')}</div>
    </div>
  `;
}

// --- Load and display lineups when both teams are selected ---
async function loadAndDisplayLineups() {
  if (!homeSelect || !awaySelect || !statusDiv) return;
  const homeFile = /** @type {HTMLSelectElement} */(homeSelect).value;
  const awayFile = /** @type {HTMLSelectElement} */(awaySelect).value;
  if (!homeFile || !awayFile) return;
  statusDiv.textContent = 'Loading lineups...';
  try {
    const [home, away] = await Promise.all([
      loadTeamFile(homeFile),
      loadTeamFile(awayFile)
    ]);
    renderLineups(home, away);
    statusDiv.textContent = 'Lineups loaded. Ready to simulate!';
  } catch (err) {
    statusDiv.textContent = 'Failed to load lineups.';
  }
}

// --- Populate team dropdowns ---
async function populateTeamDropdowns() {
  if (!statusDiv) return;
  statusDiv.textContent = 'Loading teams...';
  const teams = await fetchAvailableTeams();
  if (!teams.length) {
    statusDiv.textContent = 'No teams found in data folder.';
    return;
  }
  for (const select of [homeSelect, awaySelect]) {
    if (!select) continue;
    select.innerHTML = '';
    for (const teamFile of teams) {
      const option = document.createElement('option');
      option.value = teamFile;
      option.textContent = teamFile.replace('.html', '');
      select.appendChild(option);
    }
  }
  statusDiv.textContent = 'Select home and away teams.';
  if (homeSelect && awaySelect) {
    loadAndDisplayLineups();
  }
}

// --- Event listeners ---
if (loadTeamsBtn) {
  loadTeamsBtn.addEventListener('click', populateTeamDropdowns);
}
if (homeSelect) homeSelect.addEventListener('change', loadAndDisplayLineups);
if (awaySelect) awaySelect.addEventListener('change', loadAndDisplayLineups);

// Auto-load on page load
window.addEventListener('DOMContentLoaded', () => {
  populateTeamDropdowns();
});
