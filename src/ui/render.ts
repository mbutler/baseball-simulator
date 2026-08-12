// Rendering and UI update functions for Baseball Simulator
import {
  lineupsContainer,
  gameStateContainer,
  fieldContainer,
  atbatResultContainer,
  nextAtBatBtn
} from './domElements';
import { convertPositionCode } from '../utils/describeOutcome.js';
import { formatPlayerName, playerInitials, shortName } from '../utils/playerName.js';
import { formatAverage } from '../utils/format.js';
import { formatTeamName } from '../utils/teamNames.js';

// --- Render graphical baseball field ---
type Point = { x: number; y: number };

// The field is laid out in feet with home plate at the origin and +y pointing
// toward center field, then projected into SVG user units by ft(). Outfield
// distances are shortened from a real park so the diamond stays legible at
// small sizes; every shape below is derived from these constants rather than
// hand-placed, so changing one reshapes the whole field.
const VIEW_W = 340;
const VIEW_H = 292;
const MARGIN = 10;

const HALF_DIAMOND_FT = 90 / Math.SQRT2; // home -> 1B along each axis
const MOUND_Y_FT = HALF_DIAMOND_FT; // the mound sits at the center of the diamond
const MOUND_R_FT = 11;
const INFIELD_ARC_R_FT = 104; // infield skin, swept around the mound
const HOME_CIRCLE_R_FT = 28;
const FOUL_LINE_OFFSET_FT = 5.5; // the chalk runs just outside the bags
const PATH_OUTER_FT = 6.3; // skin showing beyond the foul line
const PATH_INNER_FT = 8.4; // base path, from the foul line in to the infield grass
const BACKSTOP_FT = 66; // foul ground behind the plate, where the field comes to a point
const FENCE_CY_FT = 86.6; // the fence arc is centered out beyond the mound, so
const FENCE_R_FT = 227; // center field plays deeper than the foul poles
const STRIPE_FT = 19; // width of one mown grass stripe

const GRASS_DARK = '#5ea545';
const GRASS_LIGHT = '#68ac45';
const DIRT = '#e9d18b';

// Every line running toward the first-base corner is the home-to-first line
// shifted sideways, which on a 45-degree line means shifting y = x down by this
// much. Positive offsets move into foul ground.
const drop = (offset: number): number => offset * Math.SQRT2;

// Intersect the line y = x - d with the circle centered at (0, cy), on the
// first-base side of the field.
function lineHitsCircle(d: number, cy: number, r: number): Point {
  const k = d + cy;
  const x = (k + Math.sqrt(2 * r * r - k * k)) / 2;
  return { x, y: x - d };
}

// The corners of the field, where its edges run into the fence.
const FIELD_CORNER_FT = lineHitsCircle(BACKSTOP_FT, FENCE_CY_FT, FENCE_R_FT);

const SCALE = (VIEW_W - 2 * MARGIN) / (2 * FIELD_CORNER_FT.x);
const HOME_PY = MARGIN + (FENCE_CY_FT + FENCE_R_FT) * SCALE;

/** Project a point in field feet to SVG user units. */
function ft(x: number, y: number): Point {
  return { x: VIEW_W / 2 + x * SCALE, y: HOME_PY - y * SCALE };
}
/** Convert a length in feet to SVG user units. */
function px(feet: number): number {
  return feet * SCALE;
}
const at = (p: Point): string => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
const n = (value: number): string => value.toFixed(1);

// Base coordinates on the SVG canvas (home, 1B, 2B, 3B)
const FIELD_POINTS: Record<'home' | 'first' | 'second' | 'third', Point> = {
  home: ft(0, 0),
  first: ft(HALF_DIAMOND_FT, HALF_DIAMOND_FT),
  second: ft(0, 2 * HALF_DIAMOND_FT),
  third: ft(-HALF_DIAMOND_FT, HALF_DIAMOND_FT)
};

const MOUND = ft(0, MOUND_Y_FT);

// Alternating light/dark mown stripes, aligned on the center of the field.
const TURF_PATTERN = `<pattern id="bs-turf" x="${n(VIEW_W / 2 - px(STRIPE_FT))}" y="0" width="${n(px(STRIPE_FT) * 2)}" height="${VIEW_H}" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="${n(px(STRIPE_FT) * 2)}" height="${VIEW_H}" fill="${GRASS_DARK}" />
        <rect x="0" y="0" width="${n(px(STRIPE_FT))}" height="${VIEW_H}" fill="${GRASS_LIGHT}" />
      </pattern>`;

// The field's silhouette: sidelines converging behind the plate, closed by the
// outfield fence arc.
const OUTLINE_PATH = `M ${at(ft(0, -BACKSTOP_FT))} L ${at(ft(-FIELD_CORNER_FT.x, FIELD_CORNER_FT.y))} ` +
  `A ${n(px(FENCE_R_FT))} ${n(px(FENCE_R_FT))} 0 0 1 ${at(ft(FIELD_CORNER_FT.x, FIELD_CORNER_FT.y))} Z`;

// Infield skin: the arc around the mound, flaring down the base paths to meet
// the dirt circle at home plate.
const DIRT_PATH = (() => {
  const d = drop(FOUL_LINE_OFFSET_FT + PATH_OUTER_FT);
  const edge = lineHitsCircle(d, MOUND_Y_FT, INFIELD_ARC_R_FT);
  const r = n(px(INFIELD_ARC_R_FT));
  return `M ${at(ft(0, -d))} L ${at(ft(edge.x, edge.y))} ` +
    `A ${r} ${r} 0 0 0 ${at(ft(-edge.x, edge.y))} Z`;
})();

// Infield grass: the diamond with the base paths to first and third cut out of
// its lower edges. Its bottom tip is hidden under the dirt circle at home.
const GRASS_POINTS = (() => {
  const rise = drop(PATH_INNER_FT - FOUL_LINE_OFFSET_FT); // shift to the fair side
  const notch = HALF_DIAMOND_FT - rise / 2;
  return [ft(0, 2 * HALF_DIAMOND_FT), ft(notch, notch + rise), ft(0, rise), ft(-notch, notch + rise)]
    .map(at)
    .join(' ');
})();

// Chalk: foul lines running from behind the plate out to the fence, plus the
// batter's boxes.
const FOUL_LINES = [1, -1].map((side) => {
  const d = drop(FOUL_LINE_OFFSET_FT);
  const end = lineHitsCircle(d, FENCE_CY_FT, FENCE_R_FT);
  const a = ft(0, -d);
  const b = ft(side * end.x, end.y);
  return `<line class="chalk" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" />`;
}).join('');

const BATTERS_BOXES = [1, -1].map((side) => {
  const corner = ft(side > 0 ? 5.5 : -16.5, 10);
  return `<rect class="chalk-box" x="${n(corner.x)}" y="${n(corner.y)}" width="${n(px(11))}" height="${n(px(20))}" />`;
}).join('');

const HOME_PLATE_POINTS = [
  ft(-4, 3.5), ft(4, 3.5), ft(4, -1.5), ft(0, -6), ft(-4, -1.5)
].map(at).join(' ');

// The base a runner advances toward when forced (index 0=1B, 1=2B, 2=3B)
const ADVANCE_TO: Point[] = [FIELD_POINTS.second, FIELD_POINTS.third, FIELD_POINTS.home];
const BASE_POINTS: Point[] = [FIELD_POINTS.first, FIELD_POINTS.second, FIELD_POINTS.third];

// Ordered stations around the diamond so runners follow the base paths.
// Station 0 = home (batter start), 1 = 1B, 2 = 2B, 3 = 3B.
const STATIONS: Point[] = [FIELD_POINTS.home, FIELD_POINTS.first, FIELD_POINTS.second, FIELD_POINTS.third];

// The base station each runner occupied on the previous render, keyed by player
// identity, so we can animate them running the bases between plays.
let previousRunnerStations: Record<string, number> = {};

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
    const label = shortName(runner.name);
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
        <circle class="runner" cx="0" cy="0" r="11" />
        <text class="marker-label" x="0" y="0">${initials}</text>
        <text class="runner-name" x="0" y="22">${label}</text>
      </g>`;
  };

  // Base plate (diamond-shaped square rotated 45deg)
  const basePlate = (pt: Point, occupied: boolean): string => {
    const s = px(8);
    return `<rect class="base-plate${occupied ? ' occupied' : ''}" x="${n(pt.x - s / 2)}" y="${n(pt.y - s / 2)}" width="${n(s)}" height="${n(s)}" transform="rotate(45 ${n(pt.x)} ${n(pt.y)})" rx="1" />`;
  };

  // Highlight the path segment each forced runner must travel.
  const forcePaths = getForcedBases(bases).map((i) => {
    const from = BASE_POINTS[i];
    const to = ADVANCE_TO[i];
    return `<line class="force-path" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join('');

  // Out indicators (2 dots; third out ends the half-inning), tucked into the
  // empty corner outside the fence.
  const outDots = [0, 1].map((i) => {
    const cx = 292 + i * 20;
    return `<circle class="out-dot${outs > i ? ' filled' : ''}" cx="${cx}" cy="22" r="6" />`;
  }).join('');

  const batterInitials = playerInitials(batterName);
  // Behind the plate, far enough up the wedge that the marker clears the foul lines.
  const batterPt = ft(0, -36);

  fieldContainer.innerHTML = `
    <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="Baseball field showing runners and outs">
      <defs>${TURF_PATTERN}</defs>
      <!-- Grass, cut to the shape of the field -->
      <path d="${OUTLINE_PATH}" fill="url(#bs-turf)" />
      <!-- Infield skin and base paths -->
      <path d="${DIRT_PATH}" fill="${DIRT}" />
      <polygon points="${GRASS_POINTS}" fill="url(#bs-turf)" />
      <circle cx="${n(p.home.x)}" cy="${n(p.home.y)}" r="${n(px(HOME_CIRCLE_R_FT))}" fill="${DIRT}" />
      <!-- Chalk -->
      ${FOUL_LINES}
      ${BATTERS_BOXES}
      <!-- Pitcher's mound -->
      <circle cx="${n(MOUND.x)}" cy="${n(MOUND.y)}" r="${n(px(MOUND_R_FT))}" fill="${DIRT}" />
      <rect x="${n(MOUND.x - px(4.5))}" y="${n(MOUND.y - px(1))}" width="${n(px(9))}" height="${n(px(2))}" fill="#ffffff" rx="0.5" />
      <!-- Force-play paths -->
      ${forcePaths}
      <!-- Bases -->
      ${basePlate(p.first, !!bases[0])}
      ${basePlate(p.second, !!bases[1])}
      ${basePlate(p.third, !!bases[2])}
      <!-- Home plate -->
      <polygon class="base-plate" points="${HOME_PLATE_POINTS}" />
      <!-- Runners -->
      ${runnerMarker(p.first, bases[0], 0)}
      ${runnerMarker(p.second, bases[1], 1)}
      ${runnerMarker(p.third, bases[2], 2)}
      <!-- Batter at the plate -->
      ${batterInitials ? `
        <g>
          <circle class="batter" cx="${n(batterPt.x)}" cy="${n(batterPt.y)}" r="11" />
          <text class="marker-label" x="${n(batterPt.x)}" y="${n(batterPt.y)}">${batterInitials}</text>
        </g>` : ''}
      <!-- Outs -->
      <text class="out-label" x="248" y="26">Outs</text>
      ${outDots}
    </svg>`;

  previousRunnerStations = nextStations;
}

/**
 * Render the home and away lineups side by side.
 * @param home - Home roster
 * @param away - Away roster
 * @param homeTeamCode - Dataset code for the home club, e.g. "CHC-2026"
 * @param awayTeamCode - Dataset code for the away club
 */
export function renderLineups(home: any, away: any, homeTeamCode?: string | null, awayTeamCode?: string | null): void {
  if (!lineupsContainer) return;
  lineupsContainer.innerHTML = '';
  const makeTable = (team: any, label: string, teamCode?: string | null): string => {
    const teamName = formatTeamName(teamCode);
    const heading = `<div class="lineup-heading"><div class="block-label">${label}</div>${teamName ? `<div class="team-name">${teamName}</div>` : ''}</div>`;
    if (!team) return `<div class="lineup-block">${heading}<div class="pitcher-row">Not loaded</div></div>`;
    const batters = team.lineup || team.batters || [];
    const pitcher = team.pitcher || (team.pitchers && team.pitchers[0]) || { name: 'N/A' };
    return `
      <div class="lineup-block">
        ${heading}
        <table class="lineup-table">
          <thead><tr><th>#</th><th>Name</th><th>BABIP</th></tr></thead>
          <tbody>
            ${(batters || []).slice(0, 9).map((b: any, i: number) => {
              const position = b.position ? convertPositionCode(b.position) : '';
              const babip = formatAverage(b.rates?.BABIP);
              return `<tr><td>${i+1}</td><td>${formatPlayerName(b.name)}${position ? ` <span class="pos-label">(${position})</span>` : ''}</td><td>${babip}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="pitcher-row"><strong>Pitcher:</strong> ${formatPlayerName(pitcher.name)}</div>
      </div>
    `;
  };
  lineupsContainer.innerHTML = `<div class="lineups-grid">${makeTable(home, 'Home', homeTeamCode)}${makeTable(away, 'Away', awayTeamCode)}</div>`;
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
      <span class="value">${formatPlayerName(batter.name)} <span class="text-muted">vs ${formatPlayerName(pitcher.name)}</span></span>
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

// How close to the end of the play-by-play still counts as following along.
const FOLLOW_SLACK_PX = 24;

/**
 * Run an update to the play-by-play list, keeping the newest play in view.
 * Rebuilding the list resets its scroll position, so a reader who has scrolled
 * back through earlier plays is returned to where they were instead.
 * @param update - Callback that adds to or rebuilds the list
 */
export function withLatestPlayInView(update: () => void): void {
  const list = atbatResultContainer;
  if (!list) return;
  const previousScrollTop = list.scrollTop;
  const wasFollowing = list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_SLACK_PX;
  update();
  list.scrollTop = wasFollowing ? list.scrollHeight : previousScrollTop;
}

// --- Render all at-bat results ---
export function renderAllAtBatResults(atBatLog: any[]): void {
  if (!atbatResultContainer) return;
  withLatestPlayInView(() => buildAtBatResults(atBatLog));
}

function buildAtBatResults(atBatLog: any[]): void {
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
    div.innerHTML = `<strong>${formatPlayerName(result.batterName)}</strong> ${result.outcome}<span class="meta"> · ${result.outs} out · ${result.score[0]}-${result.score[1]} · ${basesStr}</span>`;
    atbatResultContainer.appendChild(div);
  }
}

// --- Render game state with buttons ---
export function renderGameStateWithButtons(renderGameState: () => void, updateBaseActionButtons: () => void): void {
  renderGameState();
  updateBaseActionButtons();
} 