// Rendering and UI update functions for Baseball Simulator
import {
  lineupsContainer,
  gameStateContainer,
  fieldContainer,
  atbatResultContainer,
  nextAtBatBtn
} from './domElements';
import { convertPositionCode } from '../utils/describeOutcome.js';

// --- Render graphical baseball field ---
type Point = { x: number; y: number };

// Base coordinates on the SVG canvas (home, 1B, 2B, 3B)
const FIELD_POINTS: Record<'home' | 'first' | 'second' | 'third', Point> = {
  home: { x: 160, y: 250 },
  first: { x: 250, y: 160 },
  second: { x: 160, y: 70 },
  third: { x: 70, y: 160 }
};

// The base a runner advances toward when forced (index 0=1B, 1=2B, 2=3B)
const ADVANCE_TO: Point[] = [FIELD_POINTS.second, FIELD_POINTS.third, FIELD_POINTS.home];
const BASE_POINTS: Point[] = [FIELD_POINTS.first, FIELD_POINTS.second, FIELD_POINTS.third];

// Ordered stations around the diamond so runners follow the base paths.
// Station 0 = home (batter start), 1 = 1B, 2 = 2B, 3 = 3B.
const STATIONS: Point[] = [FIELD_POINTS.home, FIELD_POINTS.first, FIELD_POINTS.second, FIELD_POINTS.third];

// The base station each runner occupied on the previous render, keyed by player
// identity, so we can animate them running the bases between plays.
let previousRunnerStations: Record<string, number> = {};

function playerInitials(name: string | undefined): string {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameLabel(name: string | undefined): string {
  if (!name) return '';
  const last = String(name).trim().split(/\s+/).filter(Boolean).pop() || '';
  return last.length > 10 ? last.slice(0, 9) + '…' : last;
}

function runnerKey(runner: any, baseIndex: number): string {
  return String(runner?.player_id || runner?.name || `base-${baseIndex}`);
}

// Runners forced to advance: on 1B always (batter incoming); on 2B/3B only
// when every base behind is also occupied.
function getForcedBases(bases: any[]): number[] {
  const forced: number[] = [];
  if (bases[0]) forced.push(0);
  if (bases[1] && bases[0]) forced.push(1);
  if (bases[2] && bases[1] && bases[0]) forced.push(2);
  return forced;
}

/**
 * Render a simple graphical baseball field showing runners on base,
 * the current batter at the plate, force-play base paths, and the out count.
 * Runners animate from their previous base to their new one between plays.
 * @param gameState - Current game state (bases array, outs)
 * @param batterName - Name of the batter currently at the plate
 */
export function renderField(gameState: any, batterName?: string): void {
  if (!fieldContainer) return;
  if (!gameState) {
    fieldContainer.innerHTML = '';
    previousRunnerStations = {};
    return;
  }
  const bases = gameState.bases || [null, null, null];
  const outs = Math.min(Number(gameState.outs) || 0, 3);
  const p = FIELD_POINTS;

  // Track base stations this render so the next render can animate from here.
  const nextStations: Record<string, number> = {};

  // Runner marker: colored circle with initials + last name. Runners animate
  // along the base paths, passing through each intermediate base (e.g. a double
  // runs home -> 1B -> 2B rather than cutting across the diamond).
  const runnerMarker = (pt: Point, runner: any, baseIndex: number): string => {
    if (!runner) return '';
    const initials = playerInitials(runner.name);
    const label = firstNameLabel(runner.name);
    const key = runnerKey(runner, baseIndex);
    const destStation = baseIndex + 1; // 1=1B, 2=2B, 3=3B
    // A runner not seen before is a batter who just reached base (starts home).
    const startStation = key in previousRunnerStations ? previousRunnerStations[key] : 0;
    nextStations[key] = destStation;

    let staticPt = pt;
    let anim = '';
    if (destStation > startStation) {
      const waypoints = STATIONS.slice(startStation, destStation + 1);
      staticPt = waypoints[0];
      const segments = waypoints.length - 1;
      const values = waypoints.map((w) => `${w.x} ${w.y}`).join('; ');
      const keyTimes = waypoints.map((_, i) => (i / segments).toFixed(4)).join('; ');
      const dur = (segments * 0.42).toFixed(2);
      anim = `<animateTransform attributeName="transform" type="translate" values="${values}" keyTimes="${keyTimes}" calcMode="linear" dur="${dur}s" fill="freeze" />`;
    }
    return `
      <g transform="translate(${staticPt.x} ${staticPt.y})">
        ${anim}
        <circle class="runner" cx="0" cy="0" r="14" />
        <text class="marker-label" x="0" y="0">${initials}</text>
        <text class="runner-name" x="0" y="27">${label}</text>
      </g>`;
  };

  // Base plate (diamond-shaped square rotated 45deg)
  const basePlate = (pt: Point, occupied: boolean): string => {
    const s = 9;
    return `<rect class="base-plate${occupied ? ' occupied' : ''}" x="${pt.x - s / 2}" y="${pt.y - s / 2}" width="${s}" height="${s}" transform="rotate(45 ${pt.x} ${pt.y})" rx="1.5" />`;
  };

  // Highlight the path segment each forced runner must travel.
  const forcePaths = getForcedBases(bases).map((i) => {
    const from = BASE_POINTS[i];
    const to = ADVANCE_TO[i];
    return `<line class="force-path" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join('');

  // Out indicators (2 dots; third out ends the half-inning)
  const outDots = [0, 1].map((i) => {
    const cx = 232 + i * 20;
    return `<circle class="out-dot${outs > i ? ' filled' : ''}" cx="${cx}" cy="26" r="6" />`;
  }).join('');

  const batterInitials = playerInitials(batterName);

  fieldContainer.innerHTML = `
    <svg viewBox="0 0 320 290" role="img" aria-label="Baseball field showing runners and outs">
      <!-- Grass -->
      <rect x="0" y="0" width="320" height="290" fill="#5a9e4f" rx="10" />
      <!-- Outfield arc -->
      <path d="M ${p.home.x} ${p.home.y} L 12 100 A 220 220 0 0 1 308 100 Z" fill="#6bb35d" />
      <!-- Infield dirt -->
      <polygon points="${p.home.x},${p.home.y + 12} ${p.first.x + 12},${p.first.y} ${p.second.x},${p.second.y - 12} ${p.third.x - 12},${p.third.y}" fill="#c9a06a" />
      <!-- Infield grass -->
      <polygon points="${p.home.x},${p.home.y - 14} ${p.first.x - 14},${p.first.y} ${p.second.x},${p.second.y + 14} ${p.third.x + 14},${p.third.y}" fill="#6bb35d" />
      <!-- Base paths -->
      <polygon points="${p.home.x},${p.home.y} ${p.first.x},${p.first.y} ${p.second.x},${p.second.y} ${p.third.x},${p.third.y}" fill="none" stroke="#e8d3b0" stroke-width="4" stroke-linejoin="round" />
      <!-- Force-play paths -->
      ${forcePaths}
      <!-- Pitcher's mound -->
      <circle cx="160" cy="160" r="16" fill="#c9a06a" />
      <rect x="155" y="157" width="10" height="5" fill="#ffffff" rx="1" />
      <!-- Bases -->
      ${basePlate(p.first, !!bases[0])}
      ${basePlate(p.second, !!bases[1])}
      ${basePlate(p.third, !!bases[2])}
      <!-- Home plate -->
      <polygon class="base-plate" points="${p.home.x - 7},${p.home.y - 6} ${p.home.x + 7},${p.home.y - 6} ${p.home.x + 7},${p.home.y + 2} ${p.home.x},${p.home.y + 8} ${p.home.x - 7},${p.home.y + 2}" />
      <!-- Runners -->
      ${runnerMarker(p.first, bases[0], 0)}
      ${runnerMarker(p.second, bases[1], 1)}
      ${runnerMarker(p.third, bases[2], 2)}
      <!-- Batter at the plate -->
      ${batterInitials ? `
        <g>
          <circle class="batter" cx="${p.home.x - 22}" cy="${p.home.y - 4}" r="13" />
          <text class="marker-label" x="${p.home.x - 22}" y="${p.home.y - 4}">${batterInitials}</text>
        </g>` : ''}
      <!-- Outs -->
      <text class="out-label" x="200" y="30">Outs</text>
      ${outDots}
    </svg>`;

  previousRunnerStations = nextStations;
}

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
    renderField(null);
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
  renderField(state, batter?.name);
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