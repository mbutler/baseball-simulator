// Modern vanilla JS frontend for Baseball Simulator
import { parseTables } from './utils/parseTables.js';
import { parseStatTable } from './utils/statParser.js';
import { normalizeBattingStats, normalizePitchingStats } from './utils/statNormalizer.js';
import { buildRoster } from './core/rosterBuilder.js';
import { prepareMatchups } from './core/matchupPreparer.js';
import { initGameState, simulateAtBat, attemptSteal, attemptPickoff } from './core/gameEngine.js';

// --- DOM Elements ---
const homeSelect = document.getElementById('home-team-select');
const awaySelect = document.getElementById('away-team-select');
const loadTeamsBtn = document.getElementById('load-teams-btn');
const statusDiv = document.getElementById('status');
const lineupsContainer = document.getElementById('lineups-container');
const gameStateContainer = document.getElementById('game-state-container');
const nextAtBatBtn = document.getElementById('next-atbat-btn');
const atbatResultContainer = document.getElementById('atbat-result-container');
const customizeHomeBtn = document.getElementById('customize-home-lineup-btn');
const customizeAwayBtn = document.getElementById('customize-away-lineup-btn');
const lineupModal = document.getElementById('custom-lineup-modal');
const closeLineupModalBtn = document.getElementById('close-lineup-modal');
const lineupModalTitle = document.getElementById('lineup-modal-title');
const customLineupForm = document.getElementById('custom-lineup-form');
const battingOrderList = document.getElementById('batting-order-list');
const pitcherSelect = document.getElementById('pitcher-select');
const lineupError = document.getElementById('lineup-error');
const steal2bBtn = document.getElementById('steal-2b-btn');
const steal3bBtn = document.getElementById('steal-3b-btn');
const stealHomeBtn = document.getElementById('steal-home-btn');
const pickoff1bBtn = document.getElementById('pickoff-1b-btn');
const pickoff2bBtn = document.getElementById('pickoff-2b-btn');
const pickoff3bBtn = document.getElementById('pickoff-3b-btn');

// --- Game State ---
/** @type {{ batters: any[]; pitchers: any[] } | null} */
let loadedHome = null;
/** @type {{ batters: any[]; pitchers: any[] } | null} */
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
let lastRenderedTop = true;
/** @type {string[] | null} */
let customHomeLineup = null;
/** @type {string | null} */
let customHomePitcher = null;
/** @type {string[] | null} */
let customAwayLineup = null;
/** @type {string | null} */
let customAwayPitcher = null;
/** @type {'home' | 'away' | null} */
let editingTeam = null;

// --- Utility: Hardcoded list of available teams ---
async function fetchAvailableTeams() {
  return [
    "ARI-2025.html",
    "ATL-2025.html",
    "BAL-2025.html",
    "BOS-2025.html",
    "CHC-2025.html",
    "CHW-2025.html",
    "CIN-2025.html",
    "CLE-2025.html",
    "COL-2025.html",
    "DET-2025.html",
    "HOU-2025.html",
    "KCR-2025.html",
    "LAA-2025.html",
    "LAD-2025.html",
    "MIA-2025.html",
    "MIL-2025.html",
    "MIN-2025.html",
    "NYM-2025.html",
    "NYY-2025.html",
    "OAK-2025.html",
    "PHI-2025.html",
    "PIT-2025.html",
    "SDP-2025.html",
    "SEA-2025.html",
    "SFG-2025.html",
    "STL-2025.html",
    "TBR-2025.html",
    "TEX-2025.html",
    "TOR-2025.html",
    "WSN-2025.html"
  ]
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
 * @param {{ batters?: any[], pitchers?: any[], lineup?: any[], pitcher?: any } | null | undefined} home
 * @param {{ batters?: any[], pitchers?: any[], lineup?: any[], pitcher?: any } | null | undefined} away
 */
function renderLineups(home, away) {
  if (!lineupsContainer) return;
  lineupsContainer.innerHTML = '';
  /**
   * @param {{ batters?: any[], pitchers?: any[], lineup?: any[], pitcher?: any } | null | undefined} team
   * @param {string} label
   */
  const makeTable = (team, label) => {
    if (!team) return `<div><strong>${label}:</strong> Not loaded</div>`;
    // Prefer custom lineup/pitcher if present
    const batters = team.lineup || team.batters || [];
    const pitcher = team.pitcher || (team.pitchers && team.pitchers[0]) || { name: 'N/A' };
    return `
      <div style="margin-bottom:1.5em;">
        <strong>${label} Lineup</strong>
        <table class="lineup-table">
          <thead><tr><th>#</th><th>Name</th><th>PA</th></tr></thead>
          <tbody>
            ${(batters || []).slice(0, 9).map((b, i) => `<tr><td>${i+1}</td><td>${b.name || ''}</td><td>${b.PA || ''}</td></tr>`).join('')}
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
 * @param {{ batterName: string, outcome: string, outs: number, score: number[], bases: number[], inning: number, top: boolean } | null} result
 * @param {boolean} isNewHalfInning
 */
function renderAtBatResult(result, isNewHalfInning = false) {
  if (!atbatResultContainer) return;
  if (!result) return;
  // Insert inning/half-inning label if needed
  if (isNewHalfInning) {
    const labelDiv = document.createElement('div');
    labelDiv.style.marginTop = '1em';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.textContent = `Inning ${result.inning} - ${result.top ? 'Top' : 'Bottom'}`;
    atbatResultContainer.appendChild(labelDiv);
  }
  // Format base state
  const basesStr = ['1B','2B','3B'].map((b,i) => result.bases[i] ? b : '').filter(Boolean).join(', ') || 'Empty';
  // Append new result as a div
  const div = document.createElement('div');
  div.innerHTML = `<strong>Batter:</strong> ${result.batterName}<br><strong>Result:</strong> ${result.outcome}<br><strong>Outs:</strong> ${result.outs} &nbsp; <strong>Score:</strong> Away ${result.score[0]} – Home ${result.score[1]} &nbsp; <strong>Bases:</strong> ${basesStr}`;
  atbatResultContainer.appendChild(div);
  atbatResultContainer.appendChild(document.createElement('br'));
}

// --- Start a new game ---
function startGame() {
  if (!homeRoster || !awayRoster) return;
  homeMatchups = prepareMatchups(homeRoster);
  awayMatchups = prepareMatchups(awayRoster);
  gameState = initGameState();
  renderGameStateWithButtons();
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
  const result = simulateAtBat(awayMatchups, homeMatchups, state, [], []);

  // Always log the at-bat result first (before transition)
  renderAtBatResult({
    batterName: batter.name,
    outcome: result.outcome,
    outs: state.outs,
    score: [...state.score],
    bases: [...state.bases],
    inning: state.inning,
    top: state.top
  });

  let transitionMsg = '';
  let isNewHalfInning = false;
  // Handle inning/half-inning transitions
  if (state.outs >= 3) {
    state.outs = 0;
    state.bases = [0, 0, 0];
    if (state.top) {
      state.top = false; // Switch to bottom
      transitionMsg = 'End of top half. Switching to bottom of inning.';
      isNewHalfInning = true;
    } else {
      state.top = true; // Switch to top of next inning
      state.inning++;
      transitionMsg = 'End of inning. Advancing to next inning.';
      isNewHalfInning = true;
    }
  }

  // If a transition occurred, log the transition message and insert the new inning/half-inning label for the next at-bat
  if (isNewHalfInning) {
    // Log the transition message as a divider
    if (atbatResultContainer) {
      const div = document.createElement('div');
      div.innerHTML = `<em>${transitionMsg}</em>`;
      atbatResultContainer.appendChild(div);
      // Insert the new inning/half-inning label for the next at-bat
      lastRenderedInning = state.inning;
      lastRenderedTop = state.top;
      const labelDiv = document.createElement('div');
      labelDiv.style.marginTop = '1em';
      labelDiv.style.fontWeight = 'bold';
      labelDiv.textContent = `Inning ${state.inning} - ${state.top ? 'Top' : 'Bottom'}`;
      atbatResultContainer.appendChild(labelDiv);
    }
  }
  renderGameStateWithButtons();
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
    // Use custom lineup if set, else default
    homeRoster = home && home.batters && home.pitchers
      ? buildRoster(
          customHomeLineup && customHomeLineup.length === 9 ? customHomeLineup : home.batters.slice(0,9).map(b=>b.player_id),
          customHomePitcher || home.pitchers[0].player_id,
          /** @type {any[]} */(home.batters),
          /** @type {any[]} */(home.pitchers)
        )
      : null;
    awayRoster = away && away.batters && away.pitchers
      ? buildRoster(
          customAwayLineup && customAwayLineup.length === 9 ? customAwayLineup : away.batters.slice(0,9).map(b=>b.player_id),
          customAwayPitcher || away.pitchers[0].player_id,
          /** @type {any[]} */(away.batters),
          /** @type {any[]} */(away.pitchers)
        )
      : null;
    // Render the actual lineups that will be used in the game
    renderLineups(homeRoster, awayRoster);
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
if (customizeHomeBtn) {
  customizeHomeBtn.addEventListener('click', () => {
    if (!loadedHome) return;
    showLineupModal('home', loadedHome.batters, loadedHome.pitchers, customHomeLineup, customHomePitcher);
  });
}
if (customizeAwayBtn) {
  customizeAwayBtn.addEventListener('click', () => {
    if (!loadedAway) return;
    showLineupModal('away', loadedAway.batters, loadedAway.pitchers, customAwayLineup, customAwayPitcher);
  });
}
if (closeLineupModalBtn) {
  closeLineupModalBtn.addEventListener('click', () => {
    if (lineupModal) lineupModal.style.display = 'none';
  });
}
if (customLineupForm) {
  customLineupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!battingOrderList || !pitcherSelect) return;
    const lineup = [];
    const selects = battingOrderList.querySelectorAll('select');
    for (const sel of selects) {
      if (!sel.value) {
        if (lineupError) lineupError.textContent = 'Please select a player for every lineup slot.';
        return;
      }
      lineup.push(sel.value);
    }
    // Check for duplicates
    if (new Set(lineup).size !== lineup.length) {
      if (lineupError) lineupError.textContent = 'No duplicate players allowed in the lineup.';
      return;
    }
    const pitcher = /** @type {HTMLSelectElement} */(pitcherSelect).value;
    if (!pitcher) {
      if (lineupError) lineupError.textContent = 'Please select a starting pitcher.';
      return;
    }
    if (lineup.includes(pitcher)) {
      if (lineupError) lineupError.textContent = 'Pitcher cannot also be in the batting lineup.';
      return;
    }
    // Save
    if (editingTeam === 'home') {
      customHomeLineup = lineup;
      customHomePitcher = pitcher;
    } else {
      customAwayLineup = lineup;
      customAwayPitcher = pitcher;
    }
    if (lineupModal) lineupModal.style.display = 'none';
    // Reset game state and matchups so new lineup is used
    homeMatchups = null;
    awayMatchups = null;
    gameState = null;
    lastRenderedInning = 1;
    lastRenderedTop = true;
    if (atbatResultContainer) atbatResultContainer.innerHTML = '';
    // Re-render lineups to reflect custom lineup (use homeRoster/awayRoster)
    renderLineups(homeRoster, awayRoster);
    // Re-render lineups and restart game with new custom lineup
    loadAndDisplayLineups();
  });
}

// Auto-load on page load
window.addEventListener('DOMContentLoaded', () => {
  populateTeamDropdowns();
});

/**
 * @param {'home' | 'away'} team
 * @param {any[]} batters
 * @param {any[]} pitchers
 * @param {string[] | null} currentLineup
 * @param {string | null} currentPitcher
 */
function showLineupModal(team, batters, pitchers, currentLineup, currentPitcher) {
  editingTeam = team;
  if (!lineupModal || !lineupModalTitle || !battingOrderList || !pitcherSelect) return;
  lineupModalTitle.textContent = `Customize ${team === 'home' ? 'Home' : 'Away'} Lineup`;
  if (lineupError) lineupError.textContent = '';
  lineupModal.style.display = 'flex';

  // Batting order dropdowns
  battingOrderList.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const li = document.createElement('li');
    const select = document.createElement('select');
    select.name = `batter${i}`;
    select.required = true;
    select.innerHTML = '<option value="">-- Select --</option>' +
      batters.map(b => `<option value="${b.player_id}">${b.name} (${b.PA} PA)</option>`).join('');
    if (currentLineup && currentLineup[i]) select.value = currentLineup[i];
    li.appendChild(select);
    battingOrderList.appendChild(li);
  }

  // Pitcher dropdown
  pitcherSelect.innerHTML = '<option value="">-- Select --</option>' +
    pitchers.map(p => `<option value="${p.player_id}">${p.name} (${p.stats && p.stats.IP ? p.stats.IP : ''} IP)</option>`).join('');
  if (currentPitcher) /** @type {HTMLSelectElement} */(pitcherSelect).value = currentPitcher;
}

function updateBaseActionButtons() {
  if (!gameState) return;
  // Steal buttons: enable if runner present on base
  if (steal2bBtn) (steal2bBtn instanceof HTMLButtonElement ? steal2bBtn : /** @type {HTMLButtonElement} */(steal2bBtn)).disabled = !gameState.bases[0];
  if (steal3bBtn) (steal3bBtn instanceof HTMLButtonElement ? steal3bBtn : /** @type {HTMLButtonElement} */(steal3bBtn)).disabled = !gameState.bases[1];
  if (stealHomeBtn) (stealHomeBtn instanceof HTMLButtonElement ? stealHomeBtn : /** @type {HTMLButtonElement} */(stealHomeBtn)).disabled = !gameState.bases[2];
  // Pickoff buttons: enable if runner present on base
  if (pickoff1bBtn) (pickoff1bBtn instanceof HTMLButtonElement ? pickoff1bBtn : /** @type {HTMLButtonElement} */(pickoff1bBtn)).disabled = !gameState.bases[0];
  if (pickoff2bBtn) (pickoff2bBtn instanceof HTMLButtonElement ? pickoff2bBtn : /** @type {HTMLButtonElement} */(pickoff2bBtn)).disabled = !gameState.bases[1];
  if (pickoff3bBtn) (pickoff3bBtn instanceof HTMLButtonElement ? pickoff3bBtn : /** @type {HTMLButtonElement} */(pickoff3bBtn)).disabled = !gameState.bases[2];
}

function renderGameStateWithButtons() {
  renderGameState();
  updateBaseActionButtons();
}

// Steal event handlers
if (steal2bBtn) steal2bBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  // Assume away team is batting if top, home if bottom
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  // Find runner on 1B (first in lineup who is not at bat)
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const catcher = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptSteal(2, gameState, runner, pitcher, catcher, 1);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
if (steal3bBtn) steal3bBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const catcher = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptSteal(3, gameState, runner, pitcher, catcher, 2);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
if (stealHomeBtn) stealHomeBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const catcher = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptSteal(4, gameState, runner, pitcher, catcher, 3);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
// Pickoff event handlers
if (pickoff1bBtn) pickoff1bBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const fielder = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptPickoff(1, gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
if (pickoff2bBtn) pickoff2bBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const fielder = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptPickoff(2, gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
if (pickoff3bBtn) pickoff3bBtn.addEventListener('click', () => {
  if (!gameState || !homeRoster || !awayRoster) return;
  const teamIndex = gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? awayRoster : homeRoster;
  const runner = roster.lineup.find(b => true) || {};
  const pitcher = (teamIndex === 0 ? homeRoster : awayRoster).pitcher;
  const fielder = (teamIndex === 0 ? homeRoster : awayRoster).lineup[0] || {};
  const result = attemptPickoff(3, gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: 'Runner',
    outcome: result.description,
    outs: gameState.outs,
    score: [...gameState.score],
    bases: [...gameState.bases],
    inning: gameState.inning,
    top: gameState.top
  });
  renderGameStateWithButtons();
});
