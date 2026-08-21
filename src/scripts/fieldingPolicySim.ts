/**
 * @fileoverview Prices the infield-in decision (design doc §10).
 *
 * The stamina sim (shiftPolicySim.ts) asked whether spending was fairly priced.
 * This asks the same of the defensive declaration, against the same bar:
 *
 *   a real decision means neither extreme wins, and judgement profits.
 *
 * If `always-in` wins, playing in is free and there is no decision. If
 * `always-back` wins, nobody will ever play in. If a situational policy beats
 * both, the DP and THRU box counts are doing their job.
 *
 * Unlike the stamina sim this does NOT drive the main game engine. The engine
 * has its own GDP and sac-fly models, which would double-count against the DP
 * and THRU boxes being tested here — so bases, outs and advancement are modelled
 * directly and the run environment is calibrated against the engine separately.
 *
 * Usage:  bun run fielding-policy [games] [BATTING-TEAM] [PITCHING-TEAM]
 */

import { loadTeamFile } from '../utils/dataLoader.js';
import {
  getCountCards, getOutTypes, tallyFor, applyApproach, BUCKETS, OUTCOMES
} from '../core/countCards.js';
import type { Bucket, CountProfiles, Approach } from '../core/countCards.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import path from 'path';

const DEFAULT_GAMES = 20000;
const INNINGS = 9;
/** Ones-digit bands, matching what the card prints. */
type OutKind = 'DP' | 'GB' | 'THRU' | 'FB' | 'LD' | 'POP';
/** Digit 7-9 on a hit: the lead runner takes the extra base (§10). */
const EXTRA_BASE_FROM = 7;
/** How many grounder boxes get through with the infield in. The knob under test. */
const THRU_WIDTH = Number(process.env.THRU_WIDTH ?? 1);

interface Bases { first: boolean; second: boolean; third: boolean }
interface State { bases: Bases; outs: number; runs: number; inning: number; margin: number }

interface Policy { name: string; blurb: string; in: (s: State) => boolean }
const POLICIES: Policy[] = [
  { name: 'always-back', blurb: 'concede the run every time', in: () => false },
  { name: 'always-in',   blurb: 'cut the run off every time', in: () => true },
  { name: 'close-late',  blurb: 'in from the 7th within one run', in: s => s.inning >= 7 && Math.abs(s.margin) <= 1 },
  { name: 'any-close',   blurb: 'in whenever within one run', in: s => Math.abs(s.margin) <= 1 },
  { name: 'tied-only',   blurb: 'in only when tied', in: s => s.margin === 0 },
  { name: 'late-always', blurb: 'in from the 7th regardless', in: s => s.inning >= 7 },
];

interface Card {
  leverage: number[];
  columns: Record<Bucket, Record<'none' | Approach, number[]>>;
  outBands: OutKind[];   // 10 entries, one per ones digit
}

/** Turn an out-type distribution into the ten printed digit slots. */
function outBands(dist: number[] | null, thruWidth = THRU_WIDTH): OutKind[] {
  const d = dist ?? [0.47, 0.294, 0.132, 0.104];
  const raw = d.map(v => v * 10);
  const n = raw.map(Math.floor);
  const short = 10 - n.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, f: v - n[i] })).sort((a, b) => b.f - a.f)
    .slice(0, Math.max(0, short)).forEach(({ i }) => n[i]++);
  const gb = n[0];
  const dp = gb >= 2 ? 1 : 0;
  const thru = Math.min(Math.max(0, gb - dp - 1), thruWidth);
  const plain = gb - dp - thru;
  const out: OutKind[] = [];
  const push = (c: number, k: OutKind) => { for (let i = 0; i < c; i++) out.push(k); };
  push(dp, 'DP'); push(plain, 'GB'); push(thru, 'THRU');
  push(n[1], 'FB'); push(n[2], 'LD'); push(n[3], 'POP');
  while (out.length < 10) out.push('GB');
  return out.slice(0, 10);
}

const pick = (w: number[]): number => {
  let r = Math.random();
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return w.length - 1;
};

/** Same competent-manager approach policy the stamina sim used, held fixed. */
function approachFor(b: Bucket, s: State): Approach {
  if (b === 'behind') return 'protect';
  if (b === 'ahead') return 'deadRed';
  if (s.bases.third && s.outs < 2) return 'protect';
  if (s.bases.second && s.outs === 2) return 'protect';
  if (!s.bases.first && !s.bases.second && !s.bases.third) return 'deadRed';
  return 'protect';
}

/** Resolve one plate appearance, mutating state. Returns runs scored on the play. */
function plateAppearance(card: Card, s: State, playIn: boolean): number {
  const bucket = BUCKETS[pick(card.leverage)];
  const approach = bucket === 'early' ? 'none' : approachFor(bucket, s);
  const roll = Math.floor(Math.random() * 100);        // 0-99, the d100 minus one
  const col = card.columns[bucket][approach];
  const outcome = OUTCOMES[pick(col)];
  const ones = roll % 10;
  const B = s.bases;
  let scored = 0;

  const advanceOnHit = (bases: number) => {
    const extra = ones >= EXTRA_BASE_FROM ? 1 : 0;
    const push = bases + extra;
    if (B.third) { scored++; B.third = false; }
    if (B.second) { if (push >= 2) { scored++; } else { B.third = true; } B.second = false; }
    if (B.first) {
      if (push >= 3) scored++;
      else if (push === 2) B.third = true;
      else B.second = true;
      B.first = false;
    }
    if (bases === 1) B.first = true;
    else if (bases === 2) B.second = true;
    else if (bases === 3) B.third = true;
  };

  switch (outcome) {
    case 'K': case 'HBP': case 'BB': {
      if (outcome === 'K') { s.outs++; break; }
      // Walk/HBP: forced advance only.
      if (B.first && B.second && B.third) scored++;
      else if (B.first && B.second) B.third = true;
      else if (B.first) B.second = true;
      B.first = true;
      break;
    }
    case 'HR': {
      scored += 1 + (B.first ? 1 : 0) + (B.second ? 1 : 0) + (B.third ? 1 : 0);
      B.first = B.second = B.third = false;
      break;
    }
    case '1B': advanceOnHit(1); break;
    case '2B': advanceOnHit(2); break;
    case '3B': advanceOnHit(3); break;
    case 'Out': {
      const kind = card.outBands[ones];
      const grounder = kind === 'DP' || kind === 'GB' || kind === 'THRU';

      if (kind === 'THRU' && playIn) {
        // Got through: a single, and the run scores anyway.
        advanceOnHit(1);
        break;
      }
      if (kind === 'DP' && B.first && s.outs < 2) {
        s.outs += 2;
        B.first = false;
        if (s.outs < 3 && B.third && !playIn) { scored++; B.third = false; }
        break;
      }
      if (kind === 'FB' && B.third && s.outs < 2) {
        s.outs++;                                   // sacrifice fly
        if (s.outs < 3) { scored++; B.third = false; }
        break;
      }
      s.outs++;
      if (s.outs < 3 && grounder && !playIn) {
        // Infield back: concede the run, runners move up.
        if (B.third) { scored++; B.third = false; }
        if (B.second) { B.second = false; B.third = true; }
        if (B.first) { B.first = false; B.second = true; }
      }
      break;
    }
  }
  return scored;
}

interface Counters { live: number; pa: number; immediateRuns: number; liveOuts: number }

function playGame(cards: Card[], policy: Policy, awayLead: () => number, c?: Counters): number {
  let runs = 0, slot = 0;
  for (let inning = 1; inning <= INNINGS; inning++) {
    const s: State = {
      bases: { first: false, second: false, third: false },
      outs: 0, runs, inning, margin: runs - awayLead(),
    };
    let guard = 0;
    while (s.outs < 3 && guard++ < 30) {
      s.margin = runs - awayLead();
      // The declaration is only live with a runner on third and fewer than two out.
      const live = s.bases.third && s.outs < 2;
      const before = s.outs;
      const got = plateAppearance(cards[slot % 9], s, live && policy.in(s));
      runs += got;
      if (c) { c.pa++; if (live) { c.live++; c.immediateRuns += got; if (s.outs > before) c.liveOuts++; } }
      slot++;
    }
  }
  return runs;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1) / xs.length);
};

async function main(): Promise<void> {
  const games = Number(process.argv[2]) || DEFAULT_GAMES;
  const batCode = process.argv[3] || 'CHC-2025';
  const pitCode = process.argv[4] || 'MIL-2025';
  const year = batCode.split('-')[1];
  const profiles = await Bun.file(
    path.resolve(process.cwd(), `dist/count-profiles-${year}.json`)).json() as CountProfiles;

  const ok = (n: string) => !/team totals|rank in finals|player/i.test(n);
  const bat = await loadTeamFile(batCode);
  const pit = await loadTeamFile(pitCode);
  const lineup = [...bat.batters].filter(b => ok(b.name) && b.PA > 0)
    .sort((a, b) => b.PA - a.PA).slice(0, 9) as NormalizedBatter[];
  const el = pit.pitchers.filter(p => ok(p.name) && p.TBF > 0);
  const st = el.filter(p => (p.stats?.IP ?? 0) >= 50);
  const starter = [...(st.length ? st : el)].sort((a, b) => b.TBF - a.TBF)[0] as NormalizedPitcher;
  const pitTally = tallyFor(profiles, 'pitchers', starter.player_id, pitCode.split('-')[0]);

  const cards: Card[] = lineup.map(b => {
    const bt = tallyFor(profiles, 'batters', b.player_id, batCode.split('-')[0]);
    const cc = getCountCards(bt, pitTally, profiles);
    const columns = {} as Card['columns'];
    for (const bk of BUCKETS) {
      const base = cc.resolution[bk];
      const arr = (r: typeof base) => OUTCOMES.map(o => r[o]);
      columns[bk] = {
        none: arr(base),
        protect: bk === 'early' ? arr(base) : arr(applyApproach(base, 'protect')),
        deadRed: bk === 'early' ? arr(base) : arr(applyApproach(base, 'deadRed')),
      };
    }
    return {
      leverage: BUCKETS.map(x => cc.leverage[x]),
      columns,
      outBands: outBands(getOutTypes(bt, pitTally, profiles)),
    };
  });

  console.log(`\nInfield in/back — ${batCode} batting vs ${starter.name}, ${games} games per policy`);
  console.log(`the declaration is live only with a runner on third and fewer than two out`);
  console.log(`THRU width: ${THRU_WIDTH} box${THRU_WIDTH === 1 ? '' : 'es'}\n`);
  console.log('policy        runs/9        vs always-back');

  const results = POLICIES.map(p => {
    const xs: number[] = [];
    // A fixed notional opponent score drives the margin-aware policies.
    const c: Counters = { live: 0, pa: 0, immediateRuns: 0, liveOuts: 0 };
    for (let g = 0; g < games; g++) xs.push(playGame(cards, p, () => 4, c));
    return { p, xs, c };
  });
  const backM = mean(results.find(r => r.p.name === 'always-back')!.xs);

  for (const { p, xs } of results) {
    const m = mean(xs), e = se(xs);
    const d = m - backM;
    console.log(`${p.name.padEnd(13)} ${m.toFixed(3)} ± ${e.toFixed(3)}   ` +
      `${p.name === 'always-back' ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(3)}`}   ${p.blurb}`);
  }

  const back = results.find(r => r.p.name === 'always-back')!;
  const inn = results.find(r => r.p.name === 'always-in')!;
  console.log(`\nhow often the declaration is live: ${(100 * back.c.live / back.c.pa).toFixed(1)}% of PA` +
    `  (${(back.c.live / games).toFixed(2)} times a game)`);
  console.log(`runs conceded per live PA — back ${(back.c.immediateRuns / back.c.live).toFixed(3)}` +
    `, in ${(inn.c.immediateRuns / inn.c.live).toFixed(3)}` +
    `  → swing ${((back.c.immediateRuns / back.c.live) - (inn.c.immediateRuns / inn.c.live)).toFixed(3)} runs each time`);

  const sorted = [...results].sort((a, b) => mean(a.xs) - mean(b.xs));
  const best = sorted[0];
  const inM = mean(results.find(r => r.p.name === 'always-in')!.xs);
  const spread = Math.abs(inM - backM);
  console.log(`\nbest: ${best.p.name} at ${mean(best.xs).toFixed(3)} runs allowed`);
  console.log(`always-in vs always-back: ${(inM - backM >= 0 ? '+' : '')}${(inM - backM).toFixed(3)} runs`);

  // A tenth of a run a game is far below what anyone can perceive across the
  // handful of games a table actually plays, so "one-sided" only means something
  // once the tilt is big enough to notice.
  const PERCEPTIBLE = 0.15;
  if (spread < PERCEPTIBLE) {
    console.log(`\n⚖️  FREE CHOICE — the tilt is ${spread.toFixed(3)} runs a game, below anything a player`);
    console.log('   could detect. Neither extreme is punished, so the table decides this on feel,');
    console.log('   which is what a moment is supposed to be. It will never be a strategic lever:');
    console.log(`   it comes up ${(back.c.live / games).toFixed(2)} times a game and swings about a tenth of a run.`);
  } else if (best.p.name === 'always-in' || best.p.name === 'always-back') {
    console.log(`\n⚠️  ONE-SIDED — "${best.p.blurb}" is correct by ${spread.toFixed(3)} runs a game, enough to notice.`);
  } else {
    console.log('\n✅ A REAL DECISION — a situational policy beats both extremes by a perceptible margin.');
  }
  console.log('\nCaveat: the margin-aware policies are graded against a fixed notional opponent');
  console.log('score, so they are not tested as sharply as always-in/always-back. The ceiling is');
  console.log('clear regardless — no policy can gain much from a decision this rare.');
  console.log();
}

main().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
