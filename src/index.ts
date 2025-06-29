// Modern vanilla JS frontend for Baseball Simulator
import { loadTeamFile, getAvailableTeams, getDatasetMetadata } from './utils/dataLoader.js';
import type { NormalizedBatter, NormalizedPitcher } from './types/baseball.js';
import { buildRoster } from './core/rosterBuilder.js';
import { prepareMatchups, type Roster } from './core/matchupPreparer.js';
import { initGameState, simulateAtBat, attemptSteal, attemptPickoff, type GameState } from './core/gameEngine.js';
import { checkGameEnd } from './core/gameEndLogic.js';
import {
  homeSelect,
  awaySelect,
  loadTeamsBtn,
  statusDiv,
  lineupsContainer,
  gameStateContainer,
  nextAtBatBtn,
  atbatResultContainer,
  customizeHomeBtn,
  customizeAwayBtn,
  lineupModal,
  closeLineupModalBtn,
  lineupModalTitle,
  customLineupForm,
  battingOrderList,
  pitcherSelect,
  lineupError,
  steal2bBtn,
  steal3bBtn,
  stealHomeBtn,
  pickoff1bBtn,
  pickoff2bBtn,
  pickoff3bBtn,
  simulateFullGameBtn
} from './ui/domElements';
import {
  renderLineups,
  renderGameState,
  renderAtBatResult,
  renderAllAtBatResults,
  renderGameStateWithButtons
} from './ui/render';
import {
  gameStore,
  resetGameState,
  type LoadedTeam,
  type AtBatLogEntry
} from './game/state';

// --- Utility: Get available teams from JSON dataset ---
async function fetchAvailableTeams(): Promise<string[]> {
  try {
    return await getAvailableTeams();
  } catch (error) {
    console.error('Error fetching available teams:', error);
    return [];
  }
}

// --- Helper function to find defensive player by position ---
function findDefensivePlayer(fielders: any[], position: string): any {
  // Find the primary player at the specified position
  const player = fielders.find(f => f.position === position);
  if (player) return player;
  
  // Fallback: find any player who has played this position
  const backup = fielders.find(f => f.positions && f.positions.includes(position));
  if (backup) return backup;
  
  // Final fallback: return first player with defensive stats
  return fielders.find(f => f.stats) || { stats: { armStrength: 50, FP: 0.985 } };
}

// --- Game End Logic ---
function endGame(winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean): void {
  // Disable all buttons in the sticky-action-bar
  const stickyBar = document.querySelector('.sticky-action-bar');
  if (stickyBar) {
    const buttons = stickyBar.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.classList.add('disabled-greyed');
    });
  }
  if (statusDiv) {
    statusDiv.textContent = `Game Over: ${winner} wins! Final Score: Away ${score[0]} – Home ${score[1]} (${inning}${lastWasTop ? ' Top' : ' Bottom'})`;
  }
  if (atbatResultContainer) {
    const div = document.createElement('div');
    div.style.marginTop = '1em';
    div.style.fontWeight = 'bold';
    div.style.color = '#b00';
    div.textContent = `Game Over: ${winner} wins! Final Score: Away ${score[0]} – Home ${score[1]} (${inning}${lastWasTop ? ' Top' : ' Bottom'})`;
    atbatResultContainer.appendChild(div);
  }
}

// --- Start a new game with current team selections ---
async function startNewGame(): Promise<void> {
  if (!statusDiv) return;
  
  // Reset game state but preserve loaded teams
  gameStore.gameState = null;
  gameStore.lastRenderedInning = 1;
  gameStore.lastRenderedTop = true;
  gameStore.atBatLog = [];
  
  // Re-enable all action buttons and remove disabled styling
  const stickyBar = document.querySelector('.sticky-action-bar');
  if (stickyBar) {
    const buttons = stickyBar.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('disabled-greyed');
    });
  }
  
  // Also explicitly re-enable individual buttons
  if (nextAtBatBtn) nextAtBatBtn.disabled = false;
  if (steal2bBtn) steal2bBtn.disabled = false;
  if (steal3bBtn) steal3bBtn.disabled = false;
  if (stealHomeBtn) stealHomeBtn.disabled = false;
  if (pickoff1bBtn) pickoff1bBtn.disabled = false;
  if (pickoff2bBtn) pickoff2bBtn.disabled = false;
  if (pickoff3bBtn) pickoff3bBtn.disabled = false;
  if (simulateFullGameBtn) simulateFullGameBtn.disabled = false;
  
  // Clear game state display
  if (gameStateContainer) gameStateContainer.innerHTML = '';
  if (atbatResultContainer) atbatResultContainer.innerHTML = '';
  
  // If teams are already loaded, just start a new game
  if (gameStore.loadedHome && gameStore.loadedAway) {
    startGame();
    statusDiv.textContent = 'New game started. Ready to simulate!';
  } else {
    // If teams aren't loaded, try to load them from dropdowns
    if (homeSelect && awaySelect && homeSelect.value && awaySelect.value) {
      await loadAndDisplayLineups();
    } else {
      statusDiv.textContent = 'Please select home and away teams.';
    }
  }
}

// --- Start a new game ---
function startGame(): void {
  if (!gameStore.homeRoster || !gameStore.awayRoster) return;
  gameStore.homeMatchups = prepareMatchups(gameStore.homeRoster);
  gameStore.awayMatchups = prepareMatchups(gameStore.awayRoster);
  gameStore.gameState = initGameState();
  // Reset persistent at-bat log
  gameStore.atBatLog = [];
  renderAllAtBatResults(gameStore.atBatLog);
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
}

// --- Simulate next at-bat ---
function handleNextAtBat(): void {
  if (!gameStore.gameState || !gameStore.homeMatchups || !gameStore.awayMatchups || !gameStore.homeRoster || !gameStore.awayRoster) return
  const state = gameStore.gameState

  const teamIndex = state.top ? 0 : 1
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster
  const batterIdx = state.lineupIndices[teamIndex] % roster.lineup.length
  const batter = roster.lineup[batterIdx]
  const result = simulateAtBat(gameStore.awayMatchups, gameStore.homeMatchups, state, gameStore.awayFielders || [], gameStore.homeFielders || [], gameStore.awayRoster, gameStore.homeRoster)

  // Always log the at-bat result first (before transition)
  renderAtBatResult({
    batterName: batter.name,
    outcome: result.outcome,
    outs: state.outs,
    score: [...state.score],
    bases: state.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: state.inning,
    top: state.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));

  // Check for immediate game end (e.g. walk-off or pre-half-end win)
  const gameEnded = checkGameEnd({
    inning: state.inning,
    top: state.top,
    score: state.score as [number, number],
    outs: state.outs
  }, endGame)

  if (gameEnded) {
    renderGameStateWithButtons(
      () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
      updateBaseActionButtons
    );
    return
  }

  // Handle inning/half-inning transitions
  let transitionMsg = ''
  let isNewHalfInning = false
  if (state.outs >= 3) {
    // Log transition message BEFORE updating state
    if (state.top) {
      transitionMsg = 'End of top half. Switching to bottom of inning.'
    } else {
      transitionMsg = 'End of inning. Advancing to next inning.'
    }
    
    // Log the transition message with the current (old) state
    renderAtBatResult({
      batterName: '::',
      outcome: transitionMsg,
      outs: state.outs,
      score: [...state.score],
      bases: state.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
      inning: state.inning,
      top: state.top
    }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
    
    // Now update the game state
    state.bases = [null, null, null]
    state.outs = 0
    if (state.top) {
      state.top = false // Switch to bottom half
    } else {
      state.top = true  // Switch to top of next inning
      state.inning++
    }
    isNewHalfInning = true
  }

  // Check for game end after half-inning transition
  if (isNewHalfInning) {
    const gameEnded = checkGameEnd({
      inning: state.inning,
      top: state.top,
      score: state.score as [number, number],
      outs: state.outs
    }, endGame)
    if (gameEnded) {
      renderGameStateWithButtons(
        () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
        updateBaseActionButtons
      );
      return
    }
  }

  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
}

function simulateFullGame(): void {
  if (!gameStore.gameState || !gameStore.homeMatchups || !gameStore.awayMatchups) {
    startGame();
  }
  while (gameStore.gameState && nextAtBatBtn && !nextAtBatBtn.disabled) {
    handleNextAtBat();
  }
}

// --- Load and display lineups when both teams are selected ---
async function loadAndDisplayLineups(): Promise<void> {
  if (!homeSelect || !awaySelect || !statusDiv) return;
  const homeFile = homeSelect.value;
  const awayFile = awaySelect.value;
  if (!homeFile || !awayFile) return;
  statusDiv.textContent = 'Loading lineups...';
  try {
    const [home, away] = await Promise.all([
      loadTeamFile(homeFile),
      loadTeamFile(awayFile)
    ]);
    gameStore.loadedHome = home;
    gameStore.loadedAway = away;
    gameStore.homeFielders = home.fielders;
    gameStore.awayFielders = away.fielders;
    // Merge batting and fielding data for each batter (home)
    const mergedHomeBatters = home.batters.map(batter => {
      const fielder = home.fielders.find(f => f.player_id === batter.player_id);
      if (fielder) {
        return { ...batter, ...fielder, stats: { ...batter.stats, ...fielder.stats }, position: fielder.position };
      }
      return batter;
    });
    // Merge batting and fielding data for each batter (away)
    const mergedAwayBatters = away.batters.map(batter => {
      const fielder = away.fielders.find(f => f.player_id === batter.player_id);
      if (fielder) {
        return { ...batter, ...fielder, stats: { ...batter.stats, ...fielder.stats }, position: fielder.position };
      }
      return batter;
    });
    // Use custom lineup if set, else default
    gameStore.homeRoster = home && home.batters && home.pitchers
      ? buildRoster(
          gameStore.customHomeLineup && gameStore.customHomeLineup.length === 9 ? gameStore.customHomeLineup : mergedHomeBatters.slice(0,9).map(b=>b.player_id),
          gameStore.customHomePitcher || home.pitchers.find(p => p.name && p.name !== 'Player')?.player_id || home.pitchers[0].player_id,
          mergedHomeBatters,
          home.pitchers
        )
      : null;
    gameStore.awayRoster = away && away.batters && away.pitchers
      ? buildRoster(
          gameStore.customAwayLineup && gameStore.customAwayLineup.length === 9 ? gameStore.customAwayLineup : mergedAwayBatters.slice(0,9).map(b=>b.player_id),
          gameStore.customAwayPitcher || away.pitchers.find(p => p.name && p.name !== 'Player')?.player_id || away.pitchers[0].player_id,
          mergedAwayBatters,
          away.pitchers
        )
      : null;
    // Render the actual lineups that will be used in the game
    renderLineups(gameStore.homeRoster, gameStore.awayRoster);
    // Reset persistent at-bat log
    gameStore.atBatLog = [];
    renderAllAtBatResults(gameStore.atBatLog);
    statusDiv.textContent = 'Lineups loaded. Ready to simulate!';

    startGame();
  } catch (err) {
    console.error('Failed to load lineups:', err);
    const errorMessage = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    statusDiv.textContent = `Failed to load lineups: ${errorMessage}`;
  }
}

// --- Populate team dropdowns ---
async function populateTeamDropdowns(): Promise<void> {
  if (!statusDiv) return;
  
  // Reset game state and re-enable all buttons
  resetGameState();
  
  // Re-enable all action buttons
  if (nextAtBatBtn) nextAtBatBtn.disabled = false;
  if (steal2bBtn) steal2bBtn.disabled = false;
  if (steal3bBtn) steal3bBtn.disabled = false;
  if (stealHomeBtn) stealHomeBtn.disabled = false;
  if (pickoff1bBtn) pickoff1bBtn.disabled = false;
  if (pickoff2bBtn) pickoff2bBtn.disabled = false;
  if (pickoff3bBtn) pickoff3bBtn.disabled = false;
  if (simulateFullGameBtn) simulateFullGameBtn.disabled = false;
  
  // Clear game state display
  if (gameStateContainer) gameStateContainer.innerHTML = '';
  if (atbatResultContainer) atbatResultContainer.innerHTML = '';
  
  statusDiv.textContent = 'Loading teams...';
  try {
    const teams = await fetchAvailableTeams();
    if (!teams.length) {
      statusDiv.textContent = 'No teams found in data folder.';
      return;
    }
    for (const select of [homeSelect, awaySelect]) {
      if (!select) continue;
      select.innerHTML = '';
      for (const teamCode of teams) {
        const option = document.createElement('option');
        option.value = teamCode;
        option.textContent = teamCode;
        select.appendChild(option);
      }
    }
    
    // Set default selections dynamically based on available teams
    // Prefer CHC and MIL if available, otherwise use first two teams
    const preferredHome = 'CHC-2025';
    const preferredAway = 'MIL-2025';
    
    if (homeSelect) {
      homeSelect.value = teams.includes(preferredHome) ? preferredHome : teams[0] || '';
    }
    if (awaySelect) {
      awaySelect.value = teams.includes(preferredAway) ? preferredAway : teams[1] || teams[0] || '';
    }
    
    statusDiv.textContent = 'Select home and away teams.';
    if (homeSelect && awaySelect && homeSelect.value && awaySelect.value) {
      loadAndDisplayLineups();
    }
  } catch (err) {
    console.error('Failed to populate team dropdowns:', err);
    const errorMessage = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    statusDiv.textContent = `Failed to load teams: ${errorMessage}`;
  }
}

/**
 * Update rosters with new lineups without resetting game state
 */
function updateRostersWithNewLineups(): void {
  if (!gameStore.loadedHome || !gameStore.loadedAway) return;
  
  // Check if pitchers have changed and reset fatigue if needed
  const oldHomePitcher = gameStore.homeRoster?.pitcher?.player_id;
  const oldAwayPitcher = gameStore.awayRoster?.pitcher?.player_id;
  
  // Merge batting and fielding data for each batter (home)
  const mergedHomeBatters = (gameStore.loadedHome && gameStore.loadedHome.batters && gameStore.loadedHome.fielders)
    ? gameStore.loadedHome.batters.map(batter => {
        const fielder = gameStore.loadedHome!.fielders.find(f => f.player_id === batter.player_id);
        if (fielder) {
          return { ...batter, ...fielder, stats: { ...batter.stats, ...fielder.stats }, position: fielder.position };
        }
        return batter;
      })
    : [];
  const mergedAwayBatters = (gameStore.loadedAway && gameStore.loadedAway.batters && gameStore.loadedAway.fielders)
    ? gameStore.loadedAway.batters.map(batter => {
        const fielder = gameStore.loadedAway!.fielders.find(f => f.player_id === batter.player_id);
        if (fielder) {
          return { ...batter, ...fielder, stats: { ...batter.stats, ...fielder.stats }, position: fielder.position };
        }
        return batter;
      })
    : [];
  // Rebuild rosters with current custom lineups
  gameStore.homeRoster = gameStore.loadedHome && gameStore.loadedHome.batters && gameStore.loadedHome.pitchers
    ? buildRoster(
        gameStore.customHomeLineup && gameStore.customHomeLineup.length === 9 ? gameStore.customHomeLineup : mergedHomeBatters.slice(0,9).map(b=>b.player_id),
        gameStore.customHomePitcher || gameStore.loadedHome.pitchers.find(p => p.name && p.name !== 'Player')?.player_id || gameStore.loadedHome.pitchers[0].player_id,
        mergedHomeBatters,
        gameStore.loadedHome.pitchers
      )
    : null;
  gameStore.awayRoster = gameStore.loadedAway && gameStore.loadedAway.batters && gameStore.loadedAway.pitchers
    ? buildRoster(
        gameStore.customAwayLineup && gameStore.customAwayLineup.length === 9 ? gameStore.customAwayLineup : mergedAwayBatters.slice(0,9).map(b=>b.player_id),
        gameStore.customAwayPitcher || gameStore.loadedAway.pitchers.find(p => p.name && p.name !== 'Player')?.player_id || gameStore.loadedAway.pitchers[0].player_id,
        mergedAwayBatters,
        gameStore.loadedAway.pitchers
      )
    : null;
  
  // Check if pitchers changed and reset fatigue accordingly
  const newHomePitcher = gameStore.homeRoster?.pitcher?.player_id;
  const newAwayPitcher = gameStore.awayRoster?.pitcher?.player_id;
  
  if (gameStore.gameState && gameStore.gameState.pitcherFatigue) {
    // Reset home pitcher fatigue if home pitcher changed
    if (oldHomePitcher && newHomePitcher && oldHomePitcher !== newHomePitcher) {
      gameStore.gameState.pitcherFatigue[1] = { battersFaced: 0 };
      console.log(`🔄 Home pitcher changed from ${oldHomePitcher} to ${newHomePitcher} - fatigue reset`);
    }
    
    // Reset away pitcher fatigue if away pitcher changed
    if (oldAwayPitcher && newAwayPitcher && oldAwayPitcher !== newAwayPitcher) {
      gameStore.gameState.pitcherFatigue[0] = { battersFaced: 0 };
      console.log(`🔄 Away pitcher changed from ${oldAwayPitcher} to ${newAwayPitcher} - fatigue reset`);
    }
  }
  
  // Rebuild matchups for future at-bats
  if (gameStore.homeRoster && gameStore.awayRoster) {
    gameStore.homeMatchups = prepareMatchups({ lineup: gameStore.homeRoster.lineup, pitcher: gameStore.awayRoster.pitcher });
    gameStore.awayMatchups = prepareMatchups({ lineup: gameStore.awayRoster.lineup, pitcher: gameStore.homeRoster.pitcher });
  }
  
  // Update the display
  renderLineups(gameStore.homeRoster, gameStore.awayRoster);
  renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop);
}

/**
 * @param team - Team to customize
 * @param batters - Available batters
 * @param pitchers - Available pitchers
 * @param currentLineup - Current lineup
 * @param currentPitcher - Current pitcher
 */
function showLineupModal(team: 'home' | 'away', batters: NormalizedBatter[], pitchers: NormalizedPitcher[], currentLineup: string[] | null, currentPitcher: string | null): void {
  gameStore.editingTeam = team;
  if (!lineupModal || !lineupModalTitle || !battingOrderList || !pitcherSelect) return;
  lineupModalTitle.textContent = `Customize ${team === 'home' ? 'Home' : 'Away'} Lineup`;
  if (lineupError) lineupError.textContent = '';
  lineupModal.style.display = 'flex';

  // Use the current roster's lineup/pitcher if available
  let effectiveLineup = currentLineup;
  let effectivePitcher = currentPitcher;
  if (team === 'home' && gameStore.homeRoster) {
    effectiveLineup = gameStore.homeRoster.lineup ? gameStore.homeRoster.lineup.map(b => b.player_id) : currentLineup;
    effectivePitcher = gameStore.homeRoster.pitcher ? gameStore.homeRoster.pitcher.player_id : currentPitcher;
  } else if (team === 'away' && gameStore.awayRoster) {
    effectiveLineup = gameStore.awayRoster.lineup ? gameStore.awayRoster.lineup.map(b => b.player_id) : currentLineup;
    effectivePitcher = gameStore.awayRoster.pitcher ? gameStore.awayRoster.pitcher.player_id : currentPitcher;
  }

  // Batting order dropdowns
  battingOrderList.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const li = document.createElement('li');
    const select = document.createElement('select');
    select.name = `batter${i}`;
    select.required = true;
    select.innerHTML = '<option value="">-- Select --</option>' +
      batters.map(b => `<option value="${b.player_id}">${b.name} (${b.PA} PA)</option>`).join('');
    if (effectiveLineup && effectiveLineup[i]) select.value = effectiveLineup[i];
    li.appendChild(select);
    battingOrderList.appendChild(li);
  }

  // Pitcher dropdown
  pitcherSelect.innerHTML = '<option value="">-- Select --</option>' +
    pitchers.filter(p => p.name && p.name !== 'Player' && p.name !== 'Pitcher').map(p => `<option value="${p.player_id}">${p.name} (${p.stats && p.stats.IP ? p.stats.IP : ''} IP)</option>`).join('');
  if (effectivePitcher) pitcherSelect.value = effectivePitcher;
}

function updateBaseActionButtons(): void {
  if (!gameStore.gameState) return;
  // Steal buttons: enable if runner present on base
  if (steal2bBtn) steal2bBtn.disabled = !gameStore.gameState.bases[0];
  if (steal3bBtn) steal3bBtn.disabled = !gameStore.gameState.bases[1];
  if (stealHomeBtn) stealHomeBtn.disabled = !gameStore.gameState.bases[2];
  // Pickoff buttons: enable if runner present on base
  if (pickoff1bBtn) pickoff1bBtn.disabled = !gameStore.gameState.bases[0];
  if (pickoff2bBtn) pickoff2bBtn.disabled = !gameStore.gameState.bases[1];
  if (pickoff3bBtn) pickoff3bBtn.disabled = !gameStore.gameState.bases[2];
}

// --- Event listeners ---
if (loadTeamsBtn) {
  loadTeamsBtn.addEventListener('click', startNewGame);
}
if (homeSelect) homeSelect.addEventListener('change', loadAndDisplayLineups);
if (awaySelect) awaySelect.addEventListener('change', loadAndDisplayLineups);
if (nextAtBatBtn) nextAtBatBtn.addEventListener('click', handleNextAtBat);
if (customizeHomeBtn) {
  customizeHomeBtn.addEventListener('click', () => {
    if (!gameStore.loadedHome) return;
    showLineupModal('home', gameStore.loadedHome.batters, gameStore.loadedHome.pitchers, gameStore.customHomeLineup, gameStore.customHomePitcher);
  });
}
if (customizeAwayBtn) {
  customizeAwayBtn.addEventListener('click', () => {
    if (!gameStore.loadedAway) return;
    showLineupModal('away', gameStore.loadedAway.batters, gameStore.loadedAway.pitchers, gameStore.customAwayLineup, gameStore.customAwayPitcher);
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
    const lineup: string[] = [];
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
    const pitcher = pitcherSelect.value;
    if (!pitcher) {
      if (lineupError) lineupError.textContent = 'Please select a starting pitcher.';
      return;
    }
    if (lineup.includes(pitcher)) {
      if (lineupError) lineupError.textContent = 'Pitcher cannot also be in the batting lineup.';
      return;
    }
    // Save
    if (gameStore.editingTeam === 'home') {
      gameStore.customHomeLineup = lineup;
      gameStore.customHomePitcher = pitcher;
    } else {
      gameStore.customAwayLineup = lineup;
      gameStore.customAwayPitcher = pitcher;
    }
    if (lineupModal) lineupModal.style.display = 'none';
    
    // Update rosters without resetting game state
    updateRostersWithNewLineups();
  });
}

// Auto-load on page load
window.addEventListener('DOMContentLoaded', () => {
  populateTeamDropdowns();
});

// Steal event handlers
if (steal2bBtn) steal2bBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  // Assume away team is batting if top, home if bottom
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 1B
  const runner = gameStore.gameState.bases[0];
  if (!runner) return;
  
  // Find the catcher from the defensive fielding data
  const catcher = defenseFielders ? findDefensivePlayer(defenseFielders, 'C') : { stats: { armStrength: 50 } };
  const pitcher = defenseRoster.pitcher;

  const result = attemptSteal(2, gameStore.gameState, runner, pitcher, catcher, 1);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

if (steal3bBtn) steal3bBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 2B
  const runner = gameStore.gameState.bases[1];
  if (!runner) return;
  
  // Find the catcher from the defensive fielding data
  const catcher = defenseFielders ? findDefensivePlayer(defenseFielders, 'C') : { stats: { armStrength: 50 } };
  const pitcher = defenseRoster.pitcher;
  
  const result = attemptSteal(3, gameStore.gameState, runner, pitcher, catcher, 2);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

if (stealHomeBtn) stealHomeBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 3B
  const runner = gameStore.gameState.bases[2];
  if (!runner) return;
  
  // Find the catcher from the defensive fielding data
  const catcher = defenseFielders ? findDefensivePlayer(defenseFielders, 'C') : { stats: { armStrength: 50 } };
  const pitcher = defenseRoster.pitcher;
  
  const result = attemptSteal(4, gameStore.gameState, runner, pitcher, catcher, 3);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

// Pickoff event handlers
if (pickoff1bBtn) pickoff1bBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 1B
  const runner = gameStore.gameState.bases[0];
  if (!runner) return;
  
  // Find the first baseman from the defensive fielding data
  const fielder = defenseFielders ? findDefensivePlayer(defenseFielders, '1B') : { stats: { FP: 0.985 } };
  const pitcher = defenseRoster.pitcher;
  
  const result = attemptPickoff(1, gameStore.gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

if (pickoff2bBtn) pickoff2bBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 2B
  const runner = gameStore.gameState.bases[1];
  if (!runner) return;
  
  // Find the second baseman from the defensive fielding data
  const fielder = defenseFielders ? findDefensivePlayer(defenseFielders, '2B') : { stats: { FP: 0.985 } };
  const pitcher = defenseRoster.pitcher;
  
  const result = attemptPickoff(2, gameStore.gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

if (pickoff3bBtn) pickoff3bBtn.addEventListener('click', () => {
  if (!gameStore.gameState || !gameStore.homeRoster || !gameStore.awayRoster) return;
  const teamIndex = gameStore.gameState.top ? 0 : 1;
  const roster = teamIndex === 0 ? gameStore.awayRoster : gameStore.homeRoster;
  const defenseRoster = teamIndex === 0 ? gameStore.homeRoster : gameStore.awayRoster;
  const defenseFielders = teamIndex === 0 ? gameStore.homeFielders : gameStore.awayFielders;
  
  // Find the actual runner on 3B
  const runner = gameStore.gameState.bases[2];
  if (!runner) return;
  
  // Find the third baseman from the defensive fielding data
  const fielder = defenseFielders ? findDefensivePlayer(defenseFielders, '3B') : { stats: { FP: 0.985 } };
  const pitcher = defenseRoster.pitcher;
  
  const result = attemptPickoff(3, gameStore.gameState, runner, pitcher, fielder);
  renderAtBatResult({
    batterName: runner.name,
    outcome: result.description,
    outs: gameStore.gameState.outs,
    score: [...gameStore.gameState.score],
    bases: gameStore.gameState.bases.map(b => b ? 1 : 0), // Convert back to 0/1 for display
    inning: gameStore.gameState.inning,
    top: gameStore.gameState.top
  }, gameStore.atBatLog, () => renderAllAtBatResults(gameStore.atBatLog));
  renderGameStateWithButtons(
    () => renderGameState(gameStore.gameState, gameStore.homeRoster, gameStore.awayRoster, gameStore.homeMatchups, gameStore.awayMatchups, gameStore.lastRenderedInning, gameStore.lastRenderedTop),
    updateBaseActionButtons
  );
});

// Wire up the button if present
if (simulateFullGameBtn) {
  simulateFullGameBtn.addEventListener('click', simulateFullGame);
} 