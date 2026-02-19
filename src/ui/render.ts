// Rendering and UI update functions for Baseball Simulator
import {
  lineupsContainer,
  gameStateContainer,
  atbatResultContainer,
  nextAtBatBtn
} from './domElements';
import { convertPositionCode } from '../utils/describeOutcome.js';

// --- Render lineups ---
export function renderLineups(home: any, away: any): void {
  if (!lineupsContainer) return;
  lineupsContainer.innerHTML = '';
  const makeTable = (team: any, label: string): string => {
    if (!team) return `<div class="lineup-block"><div class="block-label">${label}</div><div class="pitcher-row">Not loaded</div></div>`;
    const batters = team.lineup || team.batters || [];
    const pitcher = team.pitcher || (team.pitchers && team.pitchers[0]) || { name: 'N/A' };
    return `
      <div class="lineup-block">
        <div class="block-label">${label}</div>
        <table class="lineup-table">
          <thead><tr><th>#</th><th>Name</th><th>BABIP</th></tr></thead>
          <tbody>
            ${(batters || []).slice(0, 9).map((b: any, i: number) => {
              const position = b.position ? convertPositionCode(b.position) : '';
              const babip = b.rates?.BABIP ? Number(b.rates.BABIP).toFixed(3) : '';
              return `<tr><td>${i+1}</td><td>${b.name || ''}${position ? ` <span class="pos-label">(${position})</span>` : ''}</td><td>${babip}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="pitcher-row"><strong>Pitcher:</strong> ${pitcher.name}</div>
      </div>
    `;
  };
  lineupsContainer.innerHTML = `<div class="lineups-grid">${makeTable(home, 'Home')}${makeTable(away, 'Away')}</div>`;
}

// --- Render game state and current batter ---
export function renderGameState(
  gameState: any,
  homeRoster: any,
  awayRoster: any,
  homeMatchups: any,
  awayMatchups: any,
  lastRenderedInning: number,
  lastRenderedTop: boolean
): void {
  if (!gameStateContainer) return;
  if (!gameState || !homeRoster || !awayRoster) {
    gameStateContainer.innerHTML = '<em>Game not started.</em>';
    if (nextAtBatBtn) nextAtBatBtn.style.display = 'none';
    return;
  }
  // Always show the Next At-Bat button if a game is in progress
  if (nextAtBatBtn) nextAtBatBtn.style.display = '';
  const state = gameState;
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
    <div class="game-state-grid">
      <div class="game-state-item"><span class="label">Inning</span><span class="value">${inning} ${top ? 'Top' : 'Bot'}</span></div>
      <div class="game-state-item"><span class="label">Outs</span><span class="value">${outs}</span></div>
      <div class="game-state-item"><span class="label">Bases</span><span class="value">${basesStr}</span></div>
      <div class="game-state-item"><span class="label">Score</span><span class="value">${score[0]} &ndash; ${score[1]}</span></div>
    </div>
    <div class="game-state-item at-bat">
      <span class="label">At Bat</span>
      <span class="value">${batter.name} <span class="text-muted">vs ${pitcher.name}</span></span>
    </div>
  `;
}

// --- Render at-bat result ---
export function renderAtBatResult(result: any, atBatLog: any[], renderAllAtBatResults: () => void): void {
  if (!atbatResultContainer) return;
  if (!result) return;
  atBatLog.push(result);
  renderAllAtBatResults();
}

// --- Render all at-bat results ---
export function renderAllAtBatResults(atBatLog: any[]): void {
  if (!atbatResultContainer) return;
  atbatResultContainer.innerHTML = '';
  let lastInning: number | null = null;
  let lastTop: boolean | null = null;
  for (const result of atBatLog) {
    if (result.inning !== lastInning || result.top !== lastTop) {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'inning-label';
      labelDiv.textContent = `Inning ${result.inning} – ${result.top ? 'Top' : 'Bottom'}`;
      atbatResultContainer.appendChild(labelDiv);
      lastInning = result.inning;
      lastTop = result.top;
    }
    const basesStr = ['1B','2B','3B'].map((b: string, i: number) => result.bases[i] ? b : '').filter(Boolean).join(', ') || 'Empty';
    const div = document.createElement('div');
    div.className = 'atbat-entry';
    div.innerHTML = `<strong>${result.batterName}</strong> ${result.outcome}<span class="meta"> · ${result.outs} out · ${result.score[0]}-${result.score[1]} · ${basesStr}</span>`;
    atbatResultContainer.appendChild(div);
  }
}

// --- Render game state with buttons ---
export function renderGameStateWithButtons(renderGameState: () => void, updateBaseActionButtons: () => void): void {
  renderGameState();
  updateBaseActionButtons();
} 