// Rendering and UI update functions for Baseball Simulator
import {
  lineupsContainer,
  gameStateContainer,
  atbatResultContainer,
  nextAtBatBtn
} from './domElements';

// --- Render lineups ---
export function renderLineups(home: any, away: any): void {
  if (!lineupsContainer) return;
  lineupsContainer.innerHTML = '';
  const makeTable = (team: any, label: string): string => {
    if (!team) return `<div><strong>${label}:</strong> Not loaded</div>`;
    const batters = team.lineup || team.batters || [];
    const pitcher = team.pitcher || (team.pitchers && team.pitchers[0]) || { name: 'N/A' };
    return `
      <div style="margin-bottom:1.5em;">
        <strong>${label} Lineup</strong>
        <table class="lineup-table">
          <thead><tr><th>#</th><th>Name</th><th>PA</th></tr></thead>
          <tbody>
            ${(batters || []).slice(0, 9).map((b: any, i: number) => `<tr><td>${i+1}</td><td>${b.name || ''}${b.position ? ` <span class='pos-label'>(${b.position})</span>` : ''}</td><td>${b.PA || ''}</td></tr>`).join('')}
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
    <div><strong>Inning:</strong> ${inning} (${top ? 'Top' : 'Bottom'})</div>
    <div><strong>Outs:</strong> ${outs}</div>
    <div><strong>Bases:</strong> ${basesStr}</div>
    <div><strong>Score:</strong> Away ${score[0]} &ndash; Home ${score[1]}</div>
    <div style="margin-top:1em;"><strong>At Bat:</strong> ${batter.name} (vs ${pitcher.name})</div>
  `;
  if (nextAtBatBtn) nextAtBatBtn.style.display = '';
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
      labelDiv.style.marginTop = '1em';
      labelDiv.style.fontWeight = 'bold';
      labelDiv.textContent = `Inning ${result.inning} - ${result.top ? 'Top' : 'Bottom'}`;
      atbatResultContainer.appendChild(labelDiv);
      lastInning = result.inning;
      lastTop = result.top;
    }
    const basesStr = ['1B','2B','3B'].map((b: string, i: number) => result.bases[i] ? b : '').filter(Boolean).join(', ') || 'Empty';
    const div = document.createElement('div');
    div.innerHTML = `<strong>${result.batterName}:</strong> ${result.outcome} <span style="color:#888">(Outs: ${result.outs}, Score: Away ${result.score[0]} – Home ${result.score[1]}, Bases: ${basesStr})</span>`;
    atbatResultContainer.appendChild(div);
  }
}

// --- Render game state with buttons ---
export function renderGameStateWithButtons(renderGameState: () => void, updateBaseActionButtons: () => void): void {
  renderGameState();
  updateBaseActionButtons();
} 