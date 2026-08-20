/**
 * @fileoverview Prices the pitcher's stamina shift (count-game design, §7.8).
 *
 * The shift is worth a lot — 175 points of OBP on AHEAD -> EVEN, 103 on
 * EVEN -> BEHIND — so the only thing stopping a pitcher spending on every batter
 * is what it costs him later. This script asks whether the printed costs (2 and
 * 1) actually buy that restraint, by playing whole games under several spending
 * policies and measuring runs allowed.
 *
 * The verdict is not "which policy allows fewest runs" but a shape:
 *
 *   a well-priced resource makes a SELECTIVE policy beat both extremes.
 *
 * If `always` wins, the shift is too cheap and the decision is fake. If `never`
 * wins, it is too expensive and nobody will ever spend. If `risp` (or another
 * judgement policy) wins, the price is doing its job.
 *
 * Laboratory conditions, deliberately unlike a real season:
 *   - Exactly 9 innings, no walk-offs and no extras, so runs allowed is comparable.
 *   - The HOME pitcher runs the policy under test; the AWAY pitcher always plays
 *     `never` as an untouched control.
 *   - Both sides' batters use one fixed approach policy, so protect/dead-red
 *     cannot confound the comparison between pitcher policies.
 *
 * Outcome sampling is injected into the existing engine via simulateAtBat's
 * `randomFn` hook, which is called exactly once per PA and before the lineup
 * index advances. Everything downstream of the outcome — GDP, sac flies, errors,
 * baserunner advancement — is the engine's own, which matters here because the
 * whole point of protect vs dead-red is the difference between a K and an out.
 *
 * Usage:
 *   bun run src/scripts/shiftPolicySim.ts [games] [HOME-YEAR] [AWAY-YEAR]
 *   bun run src/scripts/shiftPolicySim.ts 4000 MIL-2025 CHC-2025
 */

import { loadTeamFile } from '../utils/dataLoader.js';
import { buildRoster } from '../core/rosterBuilder.js';
import { prepareMatchups } from '../core/matchupPreparer.js';
import { initGameState, simulateAtBat } from '../core/gameEngine.js';
import {
  getCountCards, tallyFor, applyApproach, BUCKETS, OUTCOMES
} from '../core/countCards.js';
import type { Bucket, Approach, CountProfiles } from '../core/countCards.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import type { Fielder, GameState } from '../core/gameEngine.js';
import path from 'path';

const DEFAULT_GAMES = 4000;
const INNINGS = 9;
const MAX_PA_PER_HALF = 30;

/** Cost in fatigue-track steps to shift one rung toward the pitcher. */
const SHIFT_COST: Partial<Record<Bucket, number>> = { ahead: 2, even: 1 };
/** Where a shift lands. `early` is off the ladder and cannot be shifted. */
const SHIFT_TO: Partial<Record<Bucket, Bucket>> = { ahead: 'even', even: 'behind' };
/** TIRED moves the roll one rung the other way. */
const TIRED_TO: Partial<Record<Bucket, Bucket>> = { behind: 'even', even: 'ahead' };

/** Batters past ENDURANCE before the manager goes to the pen. */
const HOOK_SLACK = 6;
/**
 * Batters the bullpen absorbs before it, too, is worn through. Without this the
 * pen is a free, never-tiring, infinitely deep league-average arm, and burning
 * the starter early costs nothing at all — which flatters aggressive spending
 * so badly that the pricing question becomes unanswerable.
 */
const PEN_DEPTH = 12;
/**
 * Whether a TIRED pitcher may still buy shifts. With this true the economy has a
 * hole: the TIRED penalty is capped at one rung however far past ENDURANCE the
 * track runs, so once a pitcher is gassed every further point is FREE and
 * blanket spending becomes correct. Set false and a gassed pitcher has nothing
 * left to bear down with, which caps lifetime spending near ENDURANCE and makes
 * every point genuinely scarce. Set via SPEND_WHILE_TIRED=1 to compare.
 */
const SPEND_WHILE_TIRED = process.env.SPEND_WHILE_TIRED === '1';
/**
 * Runs per game inside which blanket spending counts as break-even. Statistical
 * significance is not the bar: at 40k games a 0.05-run difference is significant
 * and completely meaningless at a table where you play a handful of games. This
 * is ~3% of the run environment — below it, nobody could tell.
 */
const FAIR_BAND = 0.15;
/** Median BF/start across 2025 qualified starters, the anchor for ENDURANCE. */
const MEDIAN_BF_PER_START = 23.1;
const ENDURANCE_SCALE = 18 / MEDIAN_BF_PER_START;

interface ShiftContext {
  bucket: Bucket;
  inning: number;
  outs: number;
  bases: (unknown | null)[];
  tired: boolean;
}
interface Policy { name: string; blurb: string; spend: (c: ShiftContext) => boolean }

const onBase = (c: ShiftContext) => !!c.bases[1] || !!c.bases[2];
const shiftable = (c: ShiftContext) => c.bucket === 'ahead' || c.bucket === 'even';

const POLICIES: Policy[] = [
  { name: 'never',     blurb: 'never spend',                    spend: () => false },
  { name: 'always',    blurb: 'spend on every shiftable PA',    spend: c => shiftable(c) },
  { name: 'risp',      blurb: 'spend only with RISP',           spend: c => shiftable(c) && onBase(c) },
  { name: 'risp+late', blurb: 'RISP, or from the 6th on',       spend: c => shiftable(c) && (onBase(c) || c.inning >= 6) },
  { name: 'cheap',     blurb: 'only EVEN->BEHIND (costs 1)',    spend: c => c.bucket === 'even' },
  { name: 'expensive', blurb: 'only AHEAD->EVEN (costs 2)',     spend: c => c.bucket === 'ahead' },
];

/**
 * The batter's approach, held fixed across every pitcher policy.
 * Dead-red on 0-2 is indefensible and protect on 2-0 is timid, so those are
 * forced; EVEN is where the situation actually decides.
 */
function chooseApproach(bucket: Bucket, state: GameState): Approach {
  if (bucket === 'behind') return 'protect';
  if (bucket === 'ahead') return 'deadRed';
  const [first, second, third] = state.bases;
  if (third && state.outs < 2) return 'protect';   // a ball in play scores him
  if (second && state.outs === 2) return 'protect'; // a single scores him
  if (!first && !second && !third) return 'deadRed'; // a single is worth little
  return 'protect';
}

type Column = number[];
interface BatterCard {
  leverage: Column;
  columns: Record<Bucket, { none: Column; protect: Column; deadRed: Column }>;
}

/** Precompute every column once; the sim then only samples. */
function buildCard(
  batter: NormalizedBatter, pitcher: NormalizedPitcher | null,
  batTeam: string, pitTeam: string, profiles: CountProfiles
): BatterCard {
  const bt = tallyFor(profiles, 'batters', batter.player_id, batTeam);
  const pt = pitcher ? tallyFor(profiles, 'pitchers', pitcher.player_id, pitTeam) : null;
  const cards = getCountCards(bt, pt, profiles);
  const columns = {} as BatterCard['columns'];
  for (const b of BUCKETS) {
    const base = cards.resolution[b];
    const asArr = (r: typeof base) => OUTCOMES.map(o => r[o]);
    columns[b] = {
      none: asArr(base),
      protect: b === 'early' ? asArr(base) : asArr(applyApproach(base, 'protect')),
      deadRed: b === 'early' ? asArr(base) : asArr(applyApproach(base, 'deadRed')),
    };
  }
  return { leverage: BUCKETS.map(b => cards.leverage[b]), columns };
}

function pick(weights: number[]): number {
  let r = Math.random();
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

/** ENDURANCE from batters faced per start; falls back to the league median. */
function enduranceFor(raw: Record<string, unknown> | undefined): number {
  const gs = Number(raw?.p_gs ?? 0), bf = Number(raw?.p_bfp ?? 0);
  if (gs >= 10 && bf > 0) return Math.round((bf / gs) * ENDURANCE_SCALE);
  return 18;
}

interface Track {
  bf: number; spent: number; endurance: number; tiredAt: number | null;
  pulled: boolean; starterBF: number; penBF: number;
}
const newTrack = (endurance: number): Track =>
  ({ bf: 0, spent: 0, endurance, tiredAt: null, pulled: false, starterBF: 0, penBF: 0 });

interface Tally {
  runsAllowed: number[]; spend: number[]; starterBF: number[];
  tiredPA: number[]; shifts: number; shiftable: number;
}

function playGame(
  awayMatchups: ReturnType<typeof prepareMatchups>,
  homeMatchups: ReturnType<typeof prepareMatchups>,
  awayFielders: Fielder[], homeFielders: Fielder[],
  awayRoster: { lineup: NormalizedBatter[]; pitcher: NormalizedPitcher },
  homeRoster: { lineup: NormalizedBatter[]; pitcher: NormalizedPitcher },
  cards: { starter: BatterCard[]; pen: BatterCard[] }[],   // [awayBatters, homeBatters]
  policy: Policy, control: Policy,
  endurances: [number, number],
  hook: boolean,
  tally: Tally,
): void {
  const state = initGameState();
  const tracks: [Track, Track] = [newTrack(endurances[0]), newTrack(endurances[1])];
  let shifts = 0, shiftable_ = 0;

  const randomFn = (): string => {
    const batTeam = state.top ? 0 : 1;
    const pitTeam = 1 - batTeam;
    const track = tracks[pitTeam];
    const idx = state.lineupIndices[batTeam] % 9;

    if (hook && !track.pulled && track.bf + track.spent > track.endurance + HOOK_SLACK) {
      track.pulled = true;
    }
    const card = track.pulled ? cards[batTeam].pen[idx] : cards[batTeam].starter[idx];

    let bucket = BUCKETS[pick(card.leverage)];
    let tired: boolean;
    if (track.pulled) {
      track.penBF++;
      tired = track.penBF > PEN_DEPTH;          // the pen wears through too
    } else {
      track.starterBF++;
      tired = track.bf + track.spent > track.endurance;
      if (tired && track.tiredAt === null) track.tiredAt = track.bf;
    }
    if (tired) bucket = TIRED_TO[bucket] ?? bucket;

    if (!track.pulled) {
      const ctx: ShiftContext = { bucket, inning: state.inning, outs: state.outs, bases: state.bases, tired };
      const active = pitTeam === 1 ? policy : control;
      if (shiftable(ctx)) { if (pitTeam === 1) shiftable_++; }
      if (shiftable(ctx) && (SPEND_WHILE_TIRED || !tired) && active.spend(ctx)) {
        track.spent += SHIFT_COST[bucket]!;
        bucket = SHIFT_TO[bucket]!;
        if (pitTeam === 1) shifts++;
      }
    }

    track.bf++;
    const approach = bucket === 'early' ? 'none' : chooseApproach(bucket, state);
    return OUTCOMES[pick(card.columns[bucket][approach])];
  };

  for (let inning = 1; inning <= INNINGS; inning++) {
    for (const top of [true, false]) {
      state.inning = inning; state.top = top;
      state.outs = 0; state.bases = [null, null, null];
      let guard = 0;
      while (state.outs < 3 && guard++ < MAX_PA_PER_HALF) {
        simulateAtBat(awayMatchups, homeMatchups, state, awayFielders, homeFielders,
          awayRoster as never, homeRoster as never, randomFn);
      }
    }
  }

  // Away runs are the runs the home pitcher (policy under test) gave up.
  tally.runsAllowed.push(state.score[0]);
  tally.spend.push(tracks[1].spent);
  tally.starterBF.push(tracks[1].starterBF);
  if (tracks[1].tiredAt !== null) tally.tiredPA.push(tracks[1].tiredAt);
  tally.shifts += shifts;
  tally.shiftable += shiftable_;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => {
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return Math.sqrt(v / Math.max(1, xs.length));
};

async function main(): Promise<void> {
  const games = Number(process.argv[2]) || DEFAULT_GAMES;
  const homeCode = process.argv[3] || 'MIL-2025';
  const awayCode = process.argv[4] || 'CHC-2025';
  const year = homeCode.split('-')[1];

  const profPath = path.resolve(process.cwd(), `dist/count-profiles-${year}.json`);
  const profiles = await Bun.file(profPath).json() as CountProfiles;
  const rawDataset = await Bun.file(path.resolve(process.cwd(), `dist/complete-dataset-${year}.json`)).json();
  const rawTeams = Array.isArray(rawDataset) ? rawDataset : (rawDataset.teams ?? Object.values(rawDataset));
  const rawPitching = new Map<string, Record<string, unknown>>();
  for (const t of rawTeams) for (const p of (t.players ?? [])) {
    if (p.rawPitching) rawPitching.set(p.player_id, p.rawPitching);
  }

  const [home, away] = await Promise.all([loadTeamFile(homeCode), loadTeamFile(awayCode)]);
  const ok = (n: string) => !/team totals|rank in finals|player/i.test(n);
  const lineupOf = (bs: NormalizedBatter[]) =>
    [...bs].filter(b => ok(b.name) && b.PA > 0).sort((a, b) => b.PA - a.PA).slice(0, 9);
  const starterOf = (ps: NormalizedPitcher[]) => {
    const el = ps.filter(p => ok(p.name) && p.TBF > 0);
    const st = el.filter(p => (p.stats?.IP ?? 0) >= 50);
    return [...(st.length ? st : el)].sort((a, b) => b.TBF - a.TBF)[0];
  };

  const homeLineup = lineupOf(home.batters), awayLineup = lineupOf(away.batters);
  const homeStarter = starterOf(home.pitchers), awayStarter = starterOf(away.pitchers);
  const homeRoster = buildRoster(homeLineup.map(b => b.player_id), homeStarter.player_id, home.batters, home.pitchers);
  const awayRoster = buildRoster(awayLineup.map(b => b.player_id), awayStarter.player_id, away.batters, away.pitchers);
  const homeMatchups = prepareMatchups(homeRoster, awayRoster);
  const awayMatchups = prepareMatchups(awayRoster, homeRoster);

  const homeTeam = homeCode.split('-')[0], awayTeam = awayCode.split('-')[0];
  const cards = [
    { // away batters
      starter: awayRoster.lineup.map(b => buildCard(b, homeStarter, awayTeam, homeTeam, profiles)),
      pen: awayRoster.lineup.map(b => buildCard(b, null, awayTeam, homeTeam, profiles)),
    },
    { // home batters
      starter: homeRoster.lineup.map(b => buildCard(b, awayStarter, homeTeam, awayTeam, profiles)),
      pen: homeRoster.lineup.map(b => buildCard(b, null, homeTeam, awayTeam, profiles)),
    },
  ];

  const endurances: [number, number] = [
    enduranceFor(rawPitching.get(awayStarter.player_id)),
    enduranceFor(rawPitching.get(homeStarter.player_id)),
  ];
  const control = POLICIES[0];

  console.log(`\nShift pricing — ${awayCode} @ ${homeCode}, ${games} games per policy`);
  console.log(`policy pitcher: ${homeStarter.name} (ENDURANCE ${endurances[1]}), control: ${awayStarter.name} plays "never"`);
  console.log(`costs: AHEAD->EVEN ${SHIFT_COST.ahead}, EVEN->BEHIND ${SHIFT_COST.even}; hook at ENDURANCE+${HOOK_SLACK}`);
  console.log(`a TIRED pitcher ${SPEND_WHILE_TIRED ? 'MAY' : 'may NOT'} spend\n`);

  // Two regimes bound the answer. A complete game makes the pitcher eat every
  // tired batter himself (cost fully felt); the hooked game lets a manager rescue
  // him (cost partly transferred to a finite pen). A price that survives both is
  // robust to how the bullpen eventually gets modelled.
  const REGIMES: { label: string; hook: boolean; note: string }[] = [
    { label: 'COMPLETE GAME  (no hook — the starter eats all 9)', hook: false,
      note: 'upper bound on what spending costs' },
    { label: `HOOKED  (pulled at ENDURANCE+${HOOK_SLACK}, pen wears through after ${PEN_DEPTH} BF)`, hook: true,
      note: 'closer to real usage' },
  ];

  const verdicts: string[] = [];
  for (const regime of REGIMES) {
    const results: { p: Policy; t: Tally }[] = [];
    for (const p of POLICIES) {
      const t: Tally = { runsAllowed: [], spend: [], starterBF: [], tiredPA: [], shifts: 0, shiftable: 0 };
      for (let g = 0; g < games; g++) {
        playGame(awayMatchups, homeMatchups, away.fielders as Fielder[], home.fielders as Fielder[],
          awayRoster, homeRoster, cards, p, control, endurances, regime.hook, t);
      }
      results.push({ p, t });
    }

    console.log(`\n${regime.label}   — ${regime.note}`);
    console.log('policy       runs allowed/9      spend/gm   starter BF   TIRED at BF   % shiftable used');
    for (const { p, t } of results) {
      const m = mean(t.runsAllowed), e = se(t.runsAllowed);
      const used = t.shiftable ? (100 * t.shifts / t.shiftable) : 0;
      console.log(
        `${p.name.padEnd(11)}  ${m.toFixed(3)} ± ${e.toFixed(3)}      ` +
        `${mean(t.spend).toFixed(2).padStart(5)}     ${mean(t.starterBF).toFixed(1).padStart(6)}   ` +
        `${(t.tiredPA.length ? mean(t.tiredPA).toFixed(1) : '—').padStart(9)}   ${used.toFixed(0).padStart(10)}%`
      );
    }

    // The bar is NOT "spending wins". A fairly priced resource is EV-neutral in
    // blanket use — if `always` beat `never` outright the price would be wrong.
    // What a good price produces is: blanket spending breaks even, and SELECTIVE
    // spending is the only thing that profits.
    const byName = new Map(results.map(r => [r.p.name, r.t]));
    const mOf = (n: string) => mean(byName.get(n)!.runsAllowed);
    const seOf = (n: string) => se(byName.get(n)!.runsAllowed);
    const neverM = mOf('never'), alwaysM = mOf('always');
    const seBlanket = Math.hypot(seOf('never'), seOf('always'));
    const blanket = alwaysM - neverM;   // >0 means blanket spending costs you runs

    const selective = ['risp', 'risp+late', 'cheap', 'expensive']
      .map(n => ({ n, m: mOf(n), s: seOf(n) }))
      .sort((a, b) => a.m - b.m)[0];
    const edge = neverM - selective.m;  // >0 means judgement beats abstinence
    const seEdge = Math.hypot(seOf('never'), selective.s);

    console.log(`blanket spending: ${blanket >= 0 ? '+' : ''}${blanket.toFixed(3)} runs vs never ` +
      `(2 SE ± ${(2 * seBlanket).toFixed(3)}; break-even band ± ${FAIR_BAND})`);
    console.log(`best selective:   ${selective.n} saves ${edge.toFixed(3)} runs vs never (± ${(2 * seEdge).toFixed(3)} at 2 SE)`);

    const blanketTol = Math.max(2 * seBlanket, FAIR_BAND);
    let v: string;
    if (blanket < -blanketTol) v = 'TOO CHEAP';
    else if (blanket > blanketTol) v = 'TOO EXPENSIVE';
    else if (edge > 2 * seEdge) v = 'FAIR + REWARDS JUDGEMENT';
    else v = 'FAIR BUT INERT';
    verdicts.push(v);
    console.log(`verdict: ${v}`);
  }

  console.log('\n' + '='.repeat(72));
  const [cg, hk] = verdicts;
  if (verdicts.every(v => v === 'FAIR + REWARDS JUDGEMENT')) {
    console.log('✅ PRICED RIGHT in both regimes — blanket spending breaks even and only');
    console.log('   judgement profits, however the bullpen is modelled. Take these to the table.');
  } else if (verdicts.every(v => v === 'TOO CHEAP')) {
    console.log('⚠️  TOO CHEAP in both regimes — blanket spending wins outright, so there is');
    console.log('   no decision. Raise the costs and re-run.');
  } else if (verdicts.every(v => v === 'TOO EXPENSIVE')) {
    console.log('⚠️  TOO EXPENSIVE in both regimes — nobody will ever spend. Lower the costs.');
  } else if (verdicts.every(v => v === 'FAIR BUT INERT')) {
    console.log('⚖️  FAIR BUT INERT in both regimes — the price is right (blanket spending is');
    console.log('   break-even) but no selective policy profits measurably either. The decision');
    console.log('   is honest; whether it is INTERESTING is what the paper playtest decides.');
  } else {
    console.log(`⚠️  REGIME-DEPENDENT — "${cg}" on a complete game, "${hk}" when hooked.`);
    console.log('   The bullpen assumption is carrying the result, so model the pen properly');
    console.log('   before trusting these costs.');
  }
  console.log('='.repeat(72) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
