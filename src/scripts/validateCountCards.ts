#!/usr/bin/env bun
/**
 * @fileoverview Calibration check for the tabletop count cards.
 * @module scripts/validateCountCards
 *
 * The two-roll card system implies a marginal outcome distribution:
 *
 *   P(outcome) = sum over buckets of P(bucket) * P(outcome | bucket)
 *
 * If that marginal matches what `getAtBatProbabilities()` produces for the same
 * matchup, the tabletop game inherits the digital sim's already-validated run
 * environment, and the count columns are a redistribution rather than a new and
 * unvalidated model. Divergence means the priors in countCards.ts need work.
 *
 * This gates card printing. Do not build a card generator until it passes.
 *
 * Usage: bun run src/scripts/validateCountCards.ts 2025
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAtBatProbabilities, type AtBatProbabilities } from '../core/probabilityModel.ts';
import { getCountCards, tallyFor, OUTCOMES, BUCKETS, type CountProfiles } from '../core/countCards.ts';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

/** Same heuristic the Monte Carlo validation uses: top 9 by PA, starter = most TBF with >=50 IP. */
function lineupFor(team: any): { batters: NormalizedBatter[]; starter: NormalizedPitcher | null } {
  const batters = team.players
    .filter((p: any) => p.batting?.PA > 0)
    .sort((a: any, b: any) => b.batting.PA - a.batting.PA)
    .slice(0, 9)
    .map((p: any) => ({ name: p.name, player_id: p.player_id, ...p.batting }));
  const starters = team.players
    .filter((p: any) => p.pitching?.TBF > 0 && (p.pitching.stats?.IP ?? 0) >= 50)
    .sort((a: any, b: any) => b.pitching.TBF - a.pitching.TBF);
  const sp = starters[0];
  return {
    batters,
    starter: sp ? { name: sp.name, player_id: sp.player_id, ...sp.pitching } : null
  };
}

const MATCHUPS: [string, string][] = [
  ['CHC', 'MIL'], ['DET', 'TEX'], ['ARI', 'SDP'], ['NYY', 'BOS'], ['LAD', 'SFG'],
  ['ATL', 'PHI'], ['HOU', 'SEA'], ['CLE', 'MIN'], ['BAL', 'TBR'], ['OAK', 'LAA']
];

async function main() {
  const year = Bun.argv.slice(2).find(a => /^\d{4}$/.test(a)) ?? '2025';
  const dataset = JSON.parse(await readFile(path.resolve(projectRoot, `dist/complete-dataset-${year}.json`), 'utf-8'));
  const profiles: CountProfiles = JSON.parse(await readFile(path.resolve(projectRoot, `dist/count-profiles-${year}.json`), 'utf-8'));
  const byCode = new Map<string, any>(dataset.teams.map((t: any) => [t.team, t]));

  const diffs: Record<string, number[]> = Object.fromEntries(OUTCOMES.map(o => [o, []]));
  let pairs = 0, batterHits = 0, pitcherHits = 0;

  console.log(`Comparing card marginal vs getAtBatProbabilities across ${MATCHUPS.length} matchups\n`);

  for (const [away, home] of MATCHUPS) {
    const A = byCode.get(away), H = byCode.get(home);
    if (!A || !H) { console.warn(`  skip ${away}@${home}: missing team`); continue; }
    const aL = lineupFor(A), hL = lineupFor(H);
    if (!aL.starter || !hL.starter) { console.warn(`  skip ${away}@${home}: no starter`); continue; }

    for (const [batters, team, pitcher, pTeam] of [
      [aL.batters, away, hL.starter, home],
      [hL.batters, home, aL.starter, away]
    ] as [NormalizedBatter[], string, NormalizedPitcher, string][]) {
      for (const b of batters) {
        const bt = tallyFor(profiles, 'batters', b.player_id, team);
        const pt = tallyFor(profiles, 'pitchers', pitcher.player_id, pTeam);
        if (bt) batterHits++;
        if (pt) pitcherHits++;
        const model = getAtBatProbabilities(b, pitcher);
        const cards = getCountCards(bt, pt, profiles);
        for (const o of OUTCOMES) diffs[o].push(cards.blended[o] - model[o as keyof AtBatProbabilities]);
        pairs++;
      }
    }
  }

  const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
  const meanAbs = (xs: number[]) => mean(xs.map(Math.abs));

  console.log(`${'outcome'.padEnd(9)}${'mean Δ'.padStart(10)}${'mean |Δ|'.padStart(11)}${'max |Δ|'.padStart(10)}`);
  let worst = 0;
  for (const o of OUTCOMES) {
    const d = diffs[o];
    const mx = Math.max(...d.map(Math.abs));
    worst = Math.max(worst, meanAbs(d));
    const pp = (x: number) => `${(100 * x).toFixed(2)}pp`;
    console.log(`${o.padEnd(9)}${pp(mean(d)).padStart(10)}${pp(meanAbs(d)).padStart(11)}${pp(mx).padStart(10)}`);
  }

  console.log(`\n${pairs} batter-vs-starter pairs`);
  console.log(`profile coverage: batters ${(100 * batterHits / pairs).toFixed(1)}%, pitchers ${(100 * pitcherHits / pairs).toFixed(1)}%`);
  console.log(`\nworst mean |Δ| across outcomes: ${(100 * worst).toFixed(2)}pp`);
  console.log(worst < 0.02
    ? `✅ PASS — cards track the model within 2pp; the count columns redistribute a validated run environment.`
    : `❌ FAIL — retune PRIOR_LEVERAGE / PRIOR_RESOLUTION in countCards.ts before printing any card.`);

  // Show one worked matchup so the personality test is inspectable by eye.
  const chc = byCode.get('CHC'), mil = byCode.get('MIL');
  if (chc && mil) {
    const { starter } = lineupFor(mil);
    const { batters } = lineupFor(chc);
    if (starter && batters.length) {
      console.log(`\n--- Sample: top CHC batters vs ${starter.name} (${mil.team}) ---`);
      console.log(`${'batter'.padEnd(22)}` + BUCKETS.map(b => b.padStart(9)).join('') + '   | K% by column');
      for (const b of batters.slice(0, 4)) {
        const c = getCountCards(
          tallyFor(profiles, 'batters', b.player_id, 'CHC'),
          tallyFor(profiles, 'pitchers', starter.player_id, 'MIL'),
          profiles);
        const lev = BUCKETS.map(k => `${(100 * c.leverage[k]).toFixed(1)}%`.padStart(9)).join('');
        const ks = BUCKETS.map(k => `${(100 * c.resolution[k].K).toFixed(0)}%`).join('/');
        console.log(`${b.name.slice(0, 21).padEnd(22)}${lev}   | ${ks}`);
      }
    }
  }
}

if (import.meta.main) await main();
