#!/usr/bin/env bun
/**
 * Monte Carlo validation: simulate many full games and compare aggregated
 * box-score rates to MLB baselines and each batter's season rates.
 *
 * Usage:
 *   bun run src/scripts/monteCarloValidate.ts [games] [homeTeam] [awayTeam]
 *   bun run src/scripts/monteCarloValidate.ts 2500 CHC-2025 MIL-2025
 *   bun run src/scripts/monteCarloValidate.ts 400 --multi
 */
import { loadTeamFile, getAvailableTeams } from '../utils/dataLoader.js';
import { buildRoster } from '../core/rosterBuilder.js';
import { prepareMatchups } from '../core/matchupPreparer.js';
import { initGameState, simulateAtBat } from '../core/gameEngine.js';
import { checkGameEnd } from '../core/gameEndLogic.js';
import { getAtBatProbabilities } from '../core/probabilityModel.js';
import { formatPlayerName } from '../utils/playerName.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import type { Roster } from '../core/matchupPreparer.js';
import type { Fielder } from '../core/gameEngine.js';

const DEFAULT_GAMES = 2500;
const DEFAULT_MULTI_GAMES = 400;
const MAX_AT_BATS = 200;
const MAX_INNING = 15;
const OUT_JSON = '/tmp/monte-carlo-results.json';

/** Diverse 10-pair slate: contenders, mid-tier, weak clubs, and Coors. */
const SLATE_ABBR: [string, string][] = [
  ['CHC', 'MIL'],
  ['LAD', 'NYY'],
  ['ATL', 'PHI'],
  ['HOU', 'SEA'],
  ['CLE', 'KCR'],
  ['BOS', 'TOR'],
  ['SDP', 'ARI'],
  ['TEX', 'DET'],
  ['SFG', 'NYM'],
  ['CHW', 'COL'],
];

/** 2025 MLB regular-season league averages (per team unless noted). */
const MLB_2024 = {
  runsPerTeamGame: 4.45,
  avg: 0.245,
  obp: 0.315,
  slg: 0.404,
  ops: 0.719,
  kPct: 0.222,
  bbPct: 0.084,
  hrPct: 0.031,
  hbpPct: 0.011,
  babip: 0.291,
  paPerTeamGame: 37.6,
  gdpPerTeamGame: 0.64,
  errorsPerTeamGame: 0.54,
  extraInningPct: 0.085,
};

type EventKind = 'K' | 'BB' | 'HBP' | 'HR' | '1B' | '2B' | '3B' | 'SF' | 'GDP' | 'GTP' | 'ROE' | 'Out';

interface BatterTally {
  name: string;
  team: 'home' | 'away';
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sf: number;
  gdp: number;
  roe: number;
}

interface Totals {
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sf: number;
  gdp: number;
  gtp: number;
  roe: number;
  outs: number;
}

function emptyTotals(): Totals {
  return {
    pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0,
    bb: 0, hbp: 0, so: 0, sf: 0, gdp: 0, gtp: 0, roe: 0, outs: 0,
  };
}

function emptyBatter(name: string, team: 'home' | 'away'): BatterTally {
  return {
    name, team,
    pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0,
    bb: 0, hbp: 0, so: 0, sf: 0, gdp: 0, roe: 0,
  };
}

function classifyOutcome(outcome: string): EventKind {
  if (outcome === 'K' || outcome.startsWith('Strikeout')) return 'K';
  if (outcome === 'BB') return 'BB';
  if (outcome === 'HBP') return 'HBP';
  if (outcome === 'HR') return 'HR';
  if (outcome === '1B') return '1B';
  if (outcome === '2B') return '2B';
  if (outcome === '3B') return '3B';
  if (outcome.startsWith('Error')) return 'ROE';
  if (outcome.includes('double play')) return 'GDP';
  if (outcome.includes('triple play')) return 'GTP';
  if (outcome.startsWith('Sacrifice fly')) return 'SF';
  return 'Out';
}

function recordEvent(kind: EventKind, totals: Totals, batter: BatterTally): void {
  totals.pa++;
  batter.pa++;

  switch (kind) {
    case 'K':
      totals.ab++; batter.ab++;
      totals.so++; batter.so++;
      totals.outs++;
      break;
    case 'BB':
      totals.bb++; batter.bb++;
      break;
    case 'HBP':
      totals.hbp++; batter.hbp++;
      break;
    case 'HR':
      totals.ab++; batter.ab++;
      totals.h++; batter.h++;
      totals.hr++; batter.hr++;
      break;
    case '1B':
      totals.ab++; batter.ab++;
      totals.h++; batter.h++;
      totals.singles++; batter.singles++;
      break;
    case '2B':
      totals.ab++; batter.ab++;
      totals.h++; batter.h++;
      totals.doubles++; batter.doubles++;
      break;
    case '3B':
      totals.ab++; batter.ab++;
      totals.h++; batter.h++;
      totals.triples++; batter.triples++;
      break;
    case 'SF':
      totals.sf++; batter.sf++;
      totals.outs++;
      break;
    case 'GDP':
      totals.ab++; batter.ab++;
      totals.gdp++; batter.gdp++;
      totals.outs++;
      break;
    case 'GTP':
      totals.ab++; batter.ab++;
      totals.gtp++;
      totals.outs++;
      break;
    case 'ROE':
      totals.ab++; batter.ab++;
      totals.roe++; batter.roe++;
      break;
    case 'Out':
      totals.ab++; batter.ab++;
      totals.outs++;
      break;
  }
}

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function avg(t: { h: number; ab: number }): number {
  return rate(t.h, t.ab);
}

function obp(t: { h: number; bb: number; hbp: number; ab: number; sf: number }): number {
  return rate(t.h + t.bb + t.hbp, t.ab + t.bb + t.hbp + t.sf);
}

function slg(t: { singles: number; doubles: number; triples: number; hr: number; ab: number }): number {
  return rate(t.singles + 2 * t.doubles + 3 * t.triples + 4 * t.hr, t.ab);
}

function babip(t: { h: number; hr: number; ab: number; so: number; sf: number }): number {
  return rate(t.h - t.hr, t.ab - t.so - t.hr + t.sf);
}

function seasonRates(batter: NormalizedBatter) {
  const s = batter.stats;
  const pa = Math.max(1, batter.PA);
  const ab = Math.max(1, pa - s.BB - s.HBP - s.SF);
  const hits = s.H;
  return {
    avg: hits / ab,
    obp: (hits + s.BB + s.HBP) / (ab + s.BB + s.HBP + s.SF),
    slg: (s.singles + 2 * s.doubles + 3 * s.triples + 4 * s.HR) / ab,
    kPct: s.SO / pa,
    bbPct: s.BB / pa,
    hrPct: s.HR / pa,
    babip: batter.rates.BABIP ?? 0.29,
  };
}

function modelRates(batter: NormalizedBatter, pitcher: NormalizedPitcher) {
  const p = getAtBatProbabilities(batter, pitcher);
  const reachHits = p['1B'] + p['2B'] + p['3B'] + p.HR;
  const abShare = 1 - p.BB - p.HBP; // SF is folded into Out in the model
  return {
    kPct: p.K,
    bbPct: p.BB,
    hrPct: p.HR,
    avg: abShare > 0 ? reachHits / abShare : 0,
    obp: p.BB + p.HBP + reachHits,
    slg: abShare > 0 ? (p['1B'] + 2 * p['2B'] + 3 * p['3B'] + 4 * p.HR) / abShare : 0,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function avg3(n: number): string {
  return n.toFixed(3).replace(/^0/, '');
}

function deltaTone(sim: number, mlb: number, absTol: number, relTol = 0.15): 'ok' | 'warn' | 'bad' {
  const abs = Math.abs(sim - mlb);
  const rel = mlb !== 0 ? abs / Math.abs(mlb) : abs;
  if (abs <= absTol || rel <= relTol) return 'ok';
  if (rel <= relTol * 2 || abs <= absTol * 2) return 'warn';
  return 'bad';
}

function playGame(
  awayMatchups: ReturnType<typeof prepareMatchups>,
  homeMatchups: ReturnType<typeof prepareMatchups>,
  awayFielders: Fielder[],
  homeFielders: Fielder[],
  awayRoster: Roster,
  homeRoster: Roster,
  batters: Map<string, BatterTally>,
  totals: Totals,
): { away: number; home: number; innings: number; extra: boolean; walkOff: boolean; cap: boolean } {
  const state = initGameState();
  let gameOver = false;
  let paCount = 0;
  let walkOff = false;
  let cap = false;
  let winner: 'Home' | 'Away' | null = null;

  const endGame = (w: 'Home' | 'Away') => {
    gameOver = true;
    winner = w;
  };

  while (!gameOver && paCount < MAX_AT_BATS) {
    paCount++;
    const teamIndex = state.top ? 0 : 1;
    const roster = teamIndex === 0 ? awayRoster : homeRoster;
    const batterIdx = state.lineupIndices[teamIndex] % roster.lineup.length;
    const batter = roster.lineup[batterIdx];
    const tally = batters.get(batter.player_id);
    if (!tally) throw new Error(`Missing batter tally for ${batter.player_id}`);

    const result = simulateAtBat(
      awayMatchups,
      homeMatchups,
      state,
      awayFielders,
      homeFielders,
      awayRoster,
      homeRoster,
    );
    recordEvent(classifyOutcome(result.outcome), totals, tally);

    if (state.outs >= 3) {
      const shouldEnd = checkGameEnd({
        inning: state.inning,
        top: state.top,
        score: state.score as [number, number],
        outs: state.outs,
      }, endGame);
      if (shouldEnd) {
        gameOver = true;
        break;
      }
      state.bases = [null, null, null];
      state.outs = 0;
      if (state.top) {
        state.top = false;
      } else {
        state.top = true;
        state.inning++;
      }
    }

    if (!gameOver) {
      const shouldEnd = checkGameEnd({
        inning: state.inning,
        top: state.top,
        score: state.score as [number, number],
        outs: state.outs,
      }, endGame);
      if (shouldEnd) {
        walkOff = winner === 'Home';
        gameOver = true;
      }
    }

    if (state.inning > MAX_INNING) {
      cap = true;
      gameOver = true;
    }
  }

  return {
    away: state.score[0],
    home: state.score[1],
    innings: Math.min(state.inning, MAX_INNING),
    extra: state.inning > 9,
    walkOff,
    cap,
  };
}

function isRosterName(name: string): boolean {
  return !/team totals|rank in finals|player/i.test(name);
}

function pickLineup(batters: NormalizedBatter[]): NormalizedBatter[] {
  return [...batters]
    .filter(b => isRosterName(b.name) && b.PA > 0)
    .sort((a, b) => b.PA - a.PA)
    .slice(0, 9);
}

function pickStarter(pitchers: NormalizedPitcher[]): NormalizedPitcher {
  const eligible = pitchers.filter(p => isRosterName(p.name) && p.TBF > 0);
  const starters = eligible.filter(p => (p.stats?.IP ?? 0) >= 50);
  const pool = starters.length > 0 ? starters : eligible;
  return [...pool].sort((a, b) => b.TBF - a.TBF)[0];
}

function addTotals(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  (Object.keys(out) as (keyof Totals)[]).forEach(k => { out[k] = a[k] + b[k]; });
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length));
}

function leagueRowsFrom(sim: {
  runsPerTeam: number;
  avg: number;
  obp: number;
  slg: number;
  kPct: number;
  bbPct: number;
  hrPct: number;
  hbpPct: number;
  babip: number;
  paPerTeam: number;
  gdpPerTeam: number;
  errPerTeam: number;
  extraInningPct: number;
}) {
  return [
    { metric: 'Runs / team / game', sim: sim.runsPerTeam, mlb: MLB_2024.runsPerTeamGame, format: 'num' as const, absTol: 0.4 },
    { metric: 'AVG', sim: sim.avg, mlb: MLB_2024.avg, format: 'avg' as const, absTol: 0.015 },
    { metric: 'OBP', sim: sim.obp, mlb: MLB_2024.obp, format: 'avg' as const, absTol: 0.015 },
    { metric: 'SLG', sim: sim.slg, mlb: MLB_2024.slg, format: 'avg' as const, absTol: 0.025 },
    { metric: 'OPS', sim: sim.obp + sim.slg, mlb: MLB_2024.ops, format: 'avg' as const, absTol: 0.035 },
    { metric: 'K%', sim: sim.kPct, mlb: MLB_2024.kPct, format: 'pct' as const, absTol: 0.02 },
    { metric: 'BB%', sim: sim.bbPct, mlb: MLB_2024.bbPct, format: 'pct' as const, absTol: 0.015 },
    { metric: 'HR/PA', sim: sim.hrPct, mlb: MLB_2024.hrPct, format: 'pct' as const, absTol: 0.006 },
    { metric: 'HBP/PA', sim: sim.hbpPct, mlb: MLB_2024.hbpPct, format: 'pct' as const, absTol: 0.004 },
    { metric: 'BABIP', sim: sim.babip, mlb: MLB_2024.babip, format: 'avg' as const, absTol: 0.015 },
    { metric: 'PA / team / game', sim: sim.paPerTeam, mlb: MLB_2024.paPerTeamGame, format: 'num' as const, absTol: 1.5 },
    { metric: 'GDP / team / game', sim: sim.gdpPerTeam, mlb: MLB_2024.gdpPerTeamGame, format: 'num' as const, absTol: 0.2 },
    { metric: 'Errors / team / game', sim: sim.errPerTeam, mlb: MLB_2024.errorsPerTeamGame, format: 'num' as const, absTol: 0.2 },
    { metric: 'Extra-inning games', sim: sim.extraInningPct, mlb: MLB_2024.extraInningPct, format: 'pct' as const, absTol: 0.04 },
  ].map(row => {
    const status = deltaTone(row.sim, row.mlb, row.absTol);
    const fmt = (v: number) => row.format === 'pct' ? pct(v) : row.format === 'avg' ? avg3(v) : v.toFixed(2);
    return {
      metric: row.metric,
      sim: row.sim,
      mlb: row.mlb,
      simLabel: fmt(row.sim),
      mlbLabel: fmt(row.mlb),
      delta: row.sim - row.mlb,
      deltaLabel: row.format === 'pct'
        ? `${row.sim - row.mlb >= 0 ? '+' : ''}${((row.sim - row.mlb) * 100).toFixed(1)} pp`
        : row.format === 'avg'
          ? `${row.sim - row.mlb >= 0 ? '+' : ''}${(row.sim - row.mlb).toFixed(3).replace(/^(-?)0/, '$1')}`
          : `${row.sim - row.mlb >= 0 ? '+' : ''}${(row.sim - row.mlb).toFixed(2)}`,
      status,
    };
  });
}

interface MatchupResult {
  homeTeam: string;
  awayTeam: string;
  homePitcher: string;
  awayPitcher: string;
  games: number;
  totals: Totals;
  homeRuns: number;
  awayRuns: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  extraInningGames: number;
  walkOffs: number;
  capGames: number;
  inningsSum: number;
  runTotals: number[];
  players: ReturnType<typeof playerRowsFor>;
}

function playerRowsFor(
  homeRoster: Roster,
  awayRoster: Roster,
  homeTeam: string,
  awayTeam: string,
  batters: Map<string, BatterTally>,
) {
  return [...homeRoster.lineup, ...awayRoster.lineup].map(batter => {
    const t = batters.get(batter.player_id)!;
    const season = seasonRates(batter);
    const vsPitcher = homeRoster.lineup.some(b => b.player_id === batter.player_id)
      ? awayRoster.pitcher
      : homeRoster.pitcher;
    const model = modelRates(batter, vsPitcher);
    return {
      name: formatPlayerName(batter.name),
      team: homeRoster.lineup.some(b => b.player_id === batter.player_id) ? homeTeam : awayTeam,
      pa: t.pa,
      simAvg: avg(t),
      seasonAvg: season.avg,
      simObp: obp(t),
      seasonObp: season.obp,
      simSlg: slg(t),
      seasonSlg: season.slg,
      simOps: obp(t) + slg(t),
      seasonOps: season.obp + season.slg,
      simK: rate(t.so, t.pa),
      seasonK: season.kPct,
      modelK: model.kPct,
      simBB: rate(t.bb, t.pa),
      seasonBB: season.bbPct,
      modelBB: model.bbPct,
      simHR: rate(t.hr, t.pa),
      seasonHR: season.hrPct,
      modelHR: model.hrPct,
    };
  }).sort((a, b) => b.simOps - a.simOps);
}

async function runMatchup(homeTeam: string, awayTeam: string, numGames: number): Promise<MatchupResult> {
  const [home, away] = await Promise.all([
    loadTeamFile(homeTeam),
    loadTeamFile(awayTeam),
  ]);

  const homeLineup = pickLineup(home.batters);
  const awayLineup = pickLineup(away.batters);
  const homeStarter = pickStarter(home.pitchers);
  const awayStarter = pickStarter(away.pitchers);
  if (homeLineup.length < 9 || awayLineup.length < 9 || !homeStarter || !awayStarter) {
    throw new Error(`Could not build rosters for ${awayTeam} @ ${homeTeam}`);
  }

  const homeRoster = buildRoster(
    homeLineup.map(b => b.player_id),
    homeStarter.player_id,
    home.batters,
    home.pitchers,
  );
  const awayRoster = buildRoster(
    awayLineup.map(b => b.player_id),
    awayStarter.player_id,
    away.batters,
    away.pitchers,
  );
  const homeMatchups = prepareMatchups(homeRoster, awayRoster);
  const awayMatchups = prepareMatchups(awayRoster, homeRoster);

  const batters = new Map<string, BatterTally>();
  for (const b of homeRoster.lineup) batters.set(b.player_id, emptyBatter(formatPlayerName(b.name), 'home'));
  for (const b of awayRoster.lineup) batters.set(b.player_id, emptyBatter(formatPlayerName(b.name), 'away'));

  const totals = emptyTotals();
  let homeRuns = 0;
  let awayRuns = 0;
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let extraInningGames = 0;
  let walkOffs = 0;
  let capGames = 0;
  let inningsSum = 0;
  const runTotals: number[] = [];

  for (let g = 0; g < numGames; g++) {
    const result = playGame(
      awayMatchups, homeMatchups,
      away.fielders, home.fielders,
      awayRoster, homeRoster,
      batters, totals,
    );
    homeRuns += result.home;
    awayRuns += result.away;
    inningsSum += result.innings;
    if (result.home > result.away) homeWins++;
    else if (result.away > result.home) awayWins++;
    else ties++;
    if (result.extra) extraInningGames++;
    if (result.walkOff) walkOffs++;
    if (result.cap) capGames++;
    runTotals.push(result.home + result.away);
  }

  return {
    homeTeam,
    awayTeam,
    homePitcher: formatPlayerName(homeRoster.pitcher.name),
    awayPitcher: formatPlayerName(awayRoster.pitcher.name),
    games: numGames,
    totals,
    homeRuns,
    awayRuns,
    homeWins,
    awayWins,
    ties,
    extraInningGames,
    walkOffs,
    capGames,
    inningsSum,
    runTotals,
    players: playerRowsFor(homeRoster, awayRoster, homeTeam, awayTeam, batters),
  };
}

function summarize(results: MatchupResult[]) {
  const games = results.reduce((s, r) => s + r.games, 0);
  const totals = results.reduce((s, r) => addTotals(s, r.totals), emptyTotals());
  const homeRuns = results.reduce((s, r) => s + r.homeRuns, 0);
  const awayRuns = results.reduce((s, r) => s + r.awayRuns, 0);
  const extraInningGames = results.reduce((s, r) => s + r.extraInningGames, 0);
  const runTotals = results.flatMap(r => r.runTotals);
  const teamGames = games * 2;
  const players = results.flatMap(r => r.players);
  const kCalib = mean(players.map(p => Math.abs(p.simK - p.modelK)));
  const bbCalib = mean(players.map(p => Math.abs(p.simBB - p.modelBB)));
  const kSeason = mean(players.map(p => Math.abs(p.simK - p.seasonK)));
  const bbSeason = mean(players.map(p => Math.abs(p.simBB - p.seasonBB)));

  const league = leagueRowsFrom({
    runsPerTeam: (homeRuns + awayRuns) / teamGames,
    avg: avg(totals),
    obp: obp(totals),
    slg: slg(totals),
    kPct: rate(totals.so, totals.pa),
    bbPct: rate(totals.bb, totals.pa),
    hrPct: rate(totals.hr, totals.pa),
    hbpPct: rate(totals.hbp, totals.pa),
    babip: babip(totals),
    paPerTeam: totals.pa / teamGames,
    gdpPerTeam: totals.gdp / teamGames,
    errPerTeam: totals.roe / teamGames,
    extraInningPct: extraInningGames / games,
  });

  const matchups = results.map(r => ({
    label: `${r.awayTeam} @ ${r.homeTeam}`,
    starters: `${r.awayPitcher} vs ${r.homePitcher}`,
    games: r.games,
    runsPerTeam: (r.homeRuns + r.awayRuns) / (r.games * 2),
    kPct: rate(r.totals.so, r.totals.pa),
    bbPct: rate(r.totals.bb, r.totals.pa),
    homeWinPct: r.homeWins / r.games,
    extraInningPct: r.extraInningGames / r.games,
  }));

  return {
    games,
    totals,
    homeRuns,
    awayRuns,
    extraInningGames,
    walkOffs: results.reduce((s, r) => s + r.walkOffs, 0),
    capGames: results.reduce((s, r) => s + r.capGames, 0),
    homeWins: results.reduce((s, r) => s + r.homeWins, 0),
    awayWins: results.reduce((s, r) => s + r.awayWins, 0),
    ties: results.reduce((s, r) => s + r.ties, 0),
    runTotals,
    league,
    matchups,
    players,
    calibration: { kCalib, bbCalib, kSeason, bbSeason },
  };
}

function printLeague(league: ReturnType<typeof leagueRowsFrom>, heading: string) {
  console.log(`\n=== ${heading} ===`);
  for (const row of league) {
    const mark = row.status === 'ok' ? '  ' : row.status === 'warn' ? '~ ' : '! ';
    console.log(`${mark}${row.metric.padEnd(24)} sim ${row.simLabel.padStart(7)}   MLB ${row.mlbLabel.padStart(7)}   ${row.deltaLabel}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const multi = argv.includes('--multi');
  const positional = argv.filter(a => a !== '--multi');
  const teams = await getAvailableTeams();
  const year = teams[0]?.split('-').pop() ?? '2025';
  const numGames = Number(positional[0]) || (multi ? DEFAULT_MULTI_GAMES : DEFAULT_GAMES);

  const pairs: [string, string][] = multi
    ? SLATE_ABBR
        .map(([h, a]) => [`${h}-${year}`, `${a}-${year}`] as [string, string])
        .filter(([h, a]) => teams.includes(h) && teams.includes(a))
    : [[
        positional[1] || (teams.includes(`CHC-${year}`) ? `CHC-${year}` : teams[0]),
        positional[2] || (teams.includes(`MIL-${year}`) ? `MIL-${year}` : teams[1]),
      ]];

  if (pairs.length === 0) {
    throw new Error('No valid matchups in the current dataset.');
  }

  console.log(multi
    ? `League slate: ${pairs.length} matchups × ${numGames} games (${year})`
    : `Single matchup: ${pairs[0][1]} @ ${pairs[0][0]} × ${numGames}`);

  const started = Date.now();
  const results: MatchupResult[] = [];
  for (const [homeTeam, awayTeam] of pairs) {
    process.stdout.write(`  ${awayTeam} @ ${homeTeam} ... `);
    const result = await runMatchup(homeTeam, awayTeam, numGames);
    results.push(result);
    const rpg = (result.homeRuns + result.awayRuns) / (result.games * 2);
    console.log(`${rpg.toFixed(2)} R/G  K ${pct(rate(result.totals.so, result.totals.pa))}  BB ${pct(rate(result.totals.bb, result.totals.pa))}`);
  }

  const elapsedMs = Date.now() - started;
  const summary = summarize(results);
    printLeague(summary.league, `Monte Carlo vs MLB ${year}  (${summary.games} games)`);

  console.log(`\nElapsed ${(elapsedMs / 1000).toFixed(1)}s  (${(summary.games / (elapsedMs / 1000)).toFixed(0)} games/s)`);
  console.log(`Wins: home ${summary.homeWins}  away ${summary.awayWins}  ties ${summary.ties}`);
  console.log(`Walk-offs ${summary.walkOffs}  15-inning caps ${summary.capGames}  extra-inning ${summary.extraInningGames}`);
  console.log(`Combined runs: mean ${mean(summary.runTotals).toFixed(2)}  sd ${stdev(summary.runTotals).toFixed(2)}  range ${Math.min(...summary.runTotals)}–${Math.max(...summary.runTotals)}`);
  console.log(`Calibration |sim−model|  K ${pct(summary.calibration.kCalib)}  BB ${pct(summary.calibration.bbCalib)}`);
  console.log(`Calibration |sim−season| K ${pct(summary.calibration.kSeason)}  BB ${pct(summary.calibration.bbSeason)}`);

  if (multi) {
    console.log('\n=== Per matchup ===');
    for (const m of summary.matchups) {
      console.log(`${m.label.padEnd(24)} ${m.runsPerTeam.toFixed(2)} R/G  K ${pct(m.kPct).padStart(6)}  BB ${pct(m.bbPct).padStart(6)}  homeW ${pct(m.homeWinPct)}`);
    }
  } else {
    const players = summary.players;
    console.log('\n=== Batters (sim vs season) ===');
    console.log('Name'.padEnd(22) + 'PA'.padStart(6) + '  OPS sim/szn     K% sim/model     BB% sim/model');
    for (const p of players) {
      console.log(
        p.name.slice(0, 21).padEnd(22) +
        String(p.pa).padStart(6) +
        `  ${avg3(p.simOps)}/${avg3(p.seasonOps)}`.padEnd(16) +
        `  ${pct(p.simK)}/${pct(p.modelK)}`.padEnd(16) +
        `  ${pct(p.simBB)}/${pct(p.modelBB)}`
      );
    }
  }

  const report = {
    meta: {
      year,
      multi,
      games: summary.games,
      gamesPerMatchup: numGames,
      matchupCount: pairs.length,
      elapsedMs,
      gamesPerSec: summary.games / (elapsedMs / 1000),
    },
    league: summary.league,
    matchups: summary.matchups,
    scoring: {
      runsPerTeamGame: (summary.homeRuns + summary.awayRuns) / (summary.games * 2),
      homeWins: summary.homeWins,
      awayWins: summary.awayWins,
      ties: summary.ties,
      extraInningGames: summary.extraInningGames,
      extraInningPct: summary.extraInningGames / summary.games,
      walkOffs: summary.walkOffs,
      capGames: summary.capGames,
      combinedRunsMean: mean(summary.runTotals),
      combinedRunsStdev: stdev(summary.runTotals),
      combinedRunsMin: Math.min(...summary.runTotals),
      combinedRunsMax: Math.max(...summary.runTotals),
    },
    calibration: summary.calibration,
    players: multi ? undefined : summary.players,
  };

  await Bun.write(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
