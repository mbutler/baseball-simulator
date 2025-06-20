// Modern vanilla JS frontend for Baseball Simulator
import { parseTables } from './utils/parseTables.js';
import { parseStatTable } from './utils/statParser.js';
import { normalizeBattingStats, normalizePitchingStats } from './utils/statNormalizer.js';
import { buildRoster } from './core/rosterBuilder.js';
import { prepareMatchups } from './core/matchupPreparer.js';
import { initGameState, simulateAtBat } from './core/gameEngine.js';

// --- DOM Elements ---
const homeSelect = document.getElementById('home-team-select');
const awaySelect = document.getElementById('away-team-select');
const loadTeamsBtn = document.getElementById('load-teams-btn');
const statusDiv = document.getElementById('status');
const lineupsContainer = document.getElementById('lineups-container');
const gameStateContainer = document.getElementById('game-state-container');
const nextAtBatBtn = document.getElementById('next-atbat-btn');
const atbatResultContainer = document.getElementById('atbat-result-container');

// --- Game State ---
let loadedHome = null;
let loadedAway = null;
/** @type {{ lineup: any[]; pitcher: any; } | null} */
let homeRoster = null;
/** @type {{ lineup: any[]; pitcher: any; } | null} */
let awayRoster = null;
/** @type {any[] | null} */
let homeMatchups = null;
/** @type {any[] | null} */
let awayMatchups = null;
/** @type {import('./core/gameEngine.js').GameState | null} */
let gameState = null;
let lastRenderedInning = 1;

// --- Utility: Hardcoded list of available teams ---
async function fetchAvailableTeams() {
  // Add or update this list as needed
  return [
    "CHC-2025.html",
    "MIL-2025.html",
    "PIT-2025.html"
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

// --- Render game state and current batter ---
function renderGameState() {
  if (!gameStateContainer) return;
  if (!gameState || !homeRoster || !awayRoster) {
    gameStateContainer.innerHTML = '<em>Game not started.</em>';
    if (nextAtBatBtn) nextAtBatBtn.style.display = 'none';
    return;
  }
  const state = gameState; // safe after null check
  const { inning, top, outs, bases, score, lineupIndices } = state;
  const teamIndex = top ? 0 : 1;
  const matchups = teamIndex === 0 ? awayMatchups : homeMatchups;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  if (!roster) {
    gameStateContainer.innerHTML = '<em>Roster not loaded.</em>';
    if (nextAtBatBtn) nextAtBatBtn.style.display = 'none';
    return;
  }
  const batterIdx = lineupIndices[teamIndex] % (roster.lineup.length);
  const batter = roster.lineup[batterIdx];
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const basesStr = ['1B','2B','3B'].map((b,i) => state.bases[i] ? b : '').filter(Boolean).join(', ') || 'Empty';
  gameStateContainer.innerHTML = `
    <div><strong>Inning:</strong> ${inning} (${top ? 'Top' : 'Bottom'})</div>
    <div><strong>Outs:</strong> ${outs}</div>
    <div><strong>Bases:</strong> ${basesStr}</div>
    <div><strong>Score:</strong> Away ${score[0]} &ndash; Home ${score[1]}</div>
    <div style="margin-top:1em;"><strong>At Bat:</strong> ${batter.name} (vs ${pitcher.name})</div>
  `;
  if (nextAtBatBtn) nextAtBatBtn.style.display = '';
}

/**
 * @param {{ batterName: string, outcome: string } | null} result
 * @param {boolean} clearList
 */
function renderAtBatResult(result, clearList = false) {
  if (!atbatResultContainer) return;
  if (clearList || !result) {
    atbatResultContainer.innerHTML = '';
    return;
  }
  // Append new result as a div
  const div = document.createElement('div');
  div.innerHTML = `<strong>Batter:</strong> ${result.batterName}<br><strong>Result:</strong> ${result.outcome}`;
  atbatResultContainer.appendChild(div);
}

// --- Start a new game ---
function startGame() {
  if (!homeRoster || !awayRoster) return;
  homeMatchups = prepareMatchups(homeRoster);
  awayMatchups = prepareMatchups(awayRoster);
  gameState = initGameState();
  renderGameState();
  renderAtBatResult(null);
}

// --- Simulate next at-bat ---
function handleNextAtBat() {
  if (!gameState || !homeMatchups || !awayMatchups) return;
  const state = gameState; // safe after null check
  const teamIndex = state.top ? 0 : 1;
  const matchups = teamIndex === 0 ? awayMatchups : homeMatchups;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  if (!roster) return;
  const batterIdx = state.lineupIndices[teamIndex] % (roster.lineup.length);
  const batter = roster.lineup[batterIdx];
  const result = simulateAtBat(awayMatchups, homeMatchups, state);

  let transitionMsg = '';
  let clearResults = false;
  // Handle inning/half-inning transitions
  if (state.outs >= 3) {
    state.outs = 0;
    state.bases = [0, 0, 0];
    if (state.top) {
      state.top = false; // Switch to bottom
      transitionMsg = 'End of top half. Switching to bottom of inning.';
    } else {
      state.top = true; // Switch to top of next inning
      state.inning++;
      transitionMsg = 'End of inning. Advancing to next inning.';
      clearResults = true;
    }
  }

  if (clearResults || state.inning !== lastRenderedInning) {
    renderAtBatResult(null, true);
    lastRenderedInning = state.inning;
  }
  renderAtBatResult({
    batterName: batter.name,
    outcome: result.outcome + (transitionMsg ? `<br><em>${transitionMsg}</em>` : '')
  });
  renderGameState();
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
    loadedHome = home;
    loadedAway = away;
    // Default: first 9 batters, first pitcher
    homeRoster = home && home.batters && home.pitchers ? buildRoster((home.batters.slice(0,9).map(b=>b.player_id)), home.pitchers[0].player_id, /** @type {any[]} */(home.batters), /** @type {any[]} */(home.pitchers)) : null;
    awayRoster = away && away.batters && away.pitchers ? buildRoster((away.batters.slice(0,9).map(b=>b.player_id)), away.pitchers[0].player_id, /** @type {any[]} */(away.batters), /** @type {any[]} */(away.pitchers)) : null;
    renderLineups(home, away);
    statusDiv.textContent = 'Lineups loaded. Ready to simulate!';
    startGame();
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
  // Set default selections: CHC home, MIL away
  if (homeSelect) /** @type {HTMLSelectElement} */ (homeSelect).value = 'CHC-2025.html';
  if (awaySelect) /** @type {HTMLSelectElement} */ (awaySelect).value = 'MIL-2025.html';
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
if (nextAtBatBtn) nextAtBatBtn.addEventListener('click', handleNextAtBat);

// Auto-load on page load
window.addEventListener('DOMContentLoaded', () => {
  populateTeamDropdowns();
});
