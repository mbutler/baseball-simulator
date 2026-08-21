#!/usr/bin/env bun
/**
 * @fileoverview Distills the per-PA cache into count-state profiles for card generation.
 * @module scripts/buildCountProfiles
 *
 * Reads `dist/data/statcast/pa-<year>.csv` (written by fetchCountData.ts) and emits
 * `dist/count-profiles-<year>.json`.
 *
 * Stores RAW COUNTS, not rates. Shrinkage and log5 happen in the probability model,
 * so priors can be retuned without rebuilding this file.
 *
 * Players are keyed `<player_id>|<TEAM>` to match how Baseball Reference splits a
 * traded player's season, which is also how the main dataset is organized.
 *
 * Usage: bun run src/scripts/buildCountProfiles.ts 2025
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OUTCOMES, BUCKETS, decodeCount, type Outcome, type Bucket } from './fetchCountData.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const cacheDir = path.resolve(projectRoot, 'dist/data/statcast');

const CHADWICK_SHARDS = '0123456789abcdef'.split('');

/**
 * Names where Baseball Reference and the Chadwick register disagree beyond
 * accent/suffix folding (BR uses a common nickname). Keyed by folded Chadwick slug.
 */
const NAME_ALIASES: Record<string, string> = {
  enriquehernandez: 'kikehernandez',   // BR uses the nickname
  michaeltaylor: 'michaelataylor',     // BR writes the middle initial
  mattboyd: 'matthewboyd',             // BR uses the full first name
  mikeking: 'michaelking',             // BR uses the full first name
  matthewbowman: 'mattbowman',         // BR uses the short first name
  joseferrer: 'joseaferrer'            // BR writes the middle initial
};

/** Fold a display name the way updateDataset.ts does, plus diacritics and generational suffixes. */
export function foldName(raw: string): string {
  const stripped = (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')      // combining marks
    .replace(/ø/gi, 'o').replace(/ł/gi, 'l').replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return stripped.replace(/(jr|sr|ii|iii|iv)$/, '');
}

/** Bucket a count path at the pivot: the count faced on the 3rd pitch. */
export function bucketOf(pathStr: string): Bucket {
  if (pathStr.length <= 2) return 'early';
  const [balls, strikes] = decodeCount(pathStr[2]);
  if (balls > strikes) return 'ahead';
  if (balls < strikes) return 'behind';
  return 'even';
}

/** Download + cache the Chadwick MLBAM -> folded-name crosswalk. */
async function loadCrosswalk(): Promise<Map<string, string>> {
  await mkdir(cacheDir, { recursive: true });
  const cacheFile = path.resolve(cacheDir, 'chadwick-mlbam.csv');
  let text: string;
  try {
    text = await readFile(cacheFile, 'utf-8');
    console.log(`ℹ️  Using cached crosswalk: ${cacheFile}`);
  } catch {
    console.log(`🌐 Downloading Chadwick register (${CHADWICK_SHARDS.length} shards)...`);
    const lines: string[] = ['key_mlbam,slug'];
    for (const shard of CHADWICK_SHARDS) {
      const url = `https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-${shard}.csv`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Chadwick shard ${shard}: ${res.status}`);
      const rows = (await res.text()).split('\n');
      const head = rows[0].replace(/^﻿/, '').split(',');
      const iM = head.indexOf('key_mlbam');
      const iF = head.indexOf('name_first');
      const iL = head.indexOf('name_last');
      const iY = head.indexOf('mlb_played_last');
      for (let i = 1; i < rows.length; i++) {
        const c = rows[i].split(',');
        if (c.length < head.length || !c[iM]) continue;
        if (Number(c[iY]) < 2024) continue; // only players plausibly in a recent season
        lines.push(`${c[iM]},${foldName(c[iF] + c[iL])}`);
      }
    }
    text = lines.join('\n');
    await writeFile(cacheFile, text);
    console.log(`💾 Cached crosswalk: ${cacheFile}`);
  }
  const map = new Map<string, string>();
  const rows = text.split('\n');
  for (let i = 1; i < rows.length; i++) {
    const [id, slug] = rows[i].split(',');
    if (id && slug) map.set(id, NAME_ALIASES[slug] ?? slug);
  }
  return map;
}

/** Batted-ball classes, in the order they are stored and printed. */
const OUT_TYPES = ['GB', 'FB', 'LD', 'POP'] as const;
const BB_INDEX: Record<string, number> = { G: 0, F: 1, L: 2, P: 3 };

type Tally = { PA: number; buckets: number[]; outcomes: number[][]; outTypes: number[] };
const newTally = (): Tally => ({
  PA: 0,
  buckets: BUCKETS.map(() => 0),
  outcomes: BUCKETS.map(() => OUTCOMES.map(() => 0)),
  outTypes: OUT_TYPES.map(() => 0)
});
/**
 * `bb` is the batted-ball class of the terminal pitch, empty when the PA never put
 * a ball in play. Only outs are tallied: the card's ones-digit line reads off the
 * Out band, so a hitter's grounder-on-a-single is not what it describes.
 */
function add(t: Tally, b: number, o: number, bb: string, isOut: boolean) {
  t.PA++; t.buckets[b]++; t.outcomes[b][o]++;
  if (isOut && bb && BB_INDEX[bb] !== undefined) t.outTypes[BB_INDEX[bb]]++;
}

async function main() {
  const year = Bun.argv.slice(2).find(a => /^\d{4}$/.test(a)) ?? '2025';
  const paFile = path.resolve(cacheDir, `pa-${year}.csv`);
  const outFile = path.resolve(projectRoot, `dist/count-profiles-${year}.json`);

  const crosswalk = await loadCrosswalk();

  // Repo roster: which (slug, team) pairs actually exist, and in what role.
  const dataset = JSON.parse(
    await readFile(path.resolve(projectRoot, `dist/complete-dataset-${year}.json`), 'utf-8')
  );
  const repoKeys = new Set<string>();
  const repoSlugToId = new Map<string, string>();
  for (const t of dataset.teams) {
    for (const p of t.players) {
      const folded = foldName(p.name);
      repoKeys.add(`${folded}|${t.team}`);
      repoSlugToId.set(folded, p.player_id);
    }
  }
  console.log(`📇 Repo roster: ${repoKeys.size} (player, team) pairs`);

  const paText = await readFile(paFile, 'utf-8');
  const rows = paText.split('\n');
  console.log(`📖 PA cache: ${rows.length - 1} plate appearances\n`);

  const bIdx = Object.fromEntries(BUCKETS.map((b, i) => [b, i])) as Record<Bucket, number>;
  const oIdx = Object.fromEntries(OUTCOMES.map((o, i) => [o, i])) as Record<Outcome, number>;

  const league = newTally();
  const batters = new Map<string, Tally>();
  const pitchers = new Map<string, Tally>();
  const unmatched = new Map<string, number>();
  const unmatchedPit = new Map<string, number>();
  let matchedBat = 0, matchedPit = 0, totalPA = 0;

  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line) continue;
    const [batter, pitcher, batTeam, fldTeam, pathStr, outcome, bb] = line.split(',');
    if (!outcome) continue;
    const b = bIdx[bucketOf(pathStr)];
    const o = oIdx[outcome as Outcome];
    if (o === undefined) continue;
    const isOut = outcome === 'Out';
    const bbc = (bb ?? '').trim();
    totalPA++;
    add(league, b, o, bbc, isOut);

    const bSlug = crosswalk.get(batter);
    const pSlug = crosswalk.get(pitcher);

    if (bSlug && repoKeys.has(`${bSlug}|${batTeam}`)) {
      const key = `${repoSlugToId.get(bSlug)}|${batTeam}`;
      let t = batters.get(key); if (!t) batters.set(key, t = newTally());
      add(t, b, o, bbc, isOut); matchedBat++;
    } else {
      unmatched.set(bSlug ?? `mlbam:${batter}`, (unmatched.get(bSlug ?? `mlbam:${batter}`) ?? 0) + 1);
    }

    if (pSlug && repoKeys.has(`${pSlug}|${fldTeam}`)) {
      const key = `${repoSlugToId.get(pSlug)}|${fldTeam}`;
      let t = pitchers.get(key); if (!t) pitchers.set(key, t = newTally());
      add(t, b, o, bbc, isOut); matchedPit++;
    } else {
      const k = pSlug ?? `mlbam:${pitcher}`;
      unmatchedPit.set(k, (unmatchedPit.get(k) ?? 0) + 1);
    }
  }

  const profile = {
    metadata: {
      year, generatedAt: new Date().toISOString(),
      source: 'Baseball Savant (Statcast) pitch-level data, regular season only',
      pivot: 'count faced on the 3rd pitch; PAs ending in <=2 pitches are "early"',
      note: 'Raw counts, not rates. Shrinkage and log5 are applied in probabilityModel.',
      bucketOrder: BUCKETS, outcomeOrder: OUTCOMES, outTypeOrder: OUT_TYPES,
      totalPA,
      batterMatchRate: Number((matchedBat / totalPA).toFixed(4)),
      pitcherMatchRate: Number((matchedPit / totalPA).toFixed(4)),
      batterKeys: batters.size, pitcherKeys: pitchers.size
    },
    league,
    batters: Object.fromEntries(batters),
    pitchers: Object.fromEntries(pitchers)
  };
  await writeFile(outFile, JSON.stringify(profile));

  // --- audit ---
  const pct = (n: number, d: number) => `${(100 * n / d).toFixed(1)}%`;
  console.log(`League count buckets (share of PA, and outcome mix):`);
  console.log(`${'bucket'.padEnd(8)}${'%PA'.padStart(7)}  ` + OUTCOMES.map(o => o.padStart(7)).join(''));
  BUCKETS.forEach((name, i) => {
    const n = league.buckets[i];
    const cells = OUTCOMES.map((_, j) => pct(league.outcomes[i][j], n).padStart(7)).join('');
    console.log(`${name.padEnd(8)}${pct(n, totalPA).padStart(7)}  ${cells}`);
  });

  // Audit BOTH sides. A pitcher-side miss is just as damaging as a batter-side one —
  // an unmatched starter silently falls back to a league-average leverage card.
  for (const [label, matched, misses] of [
    ['Batter', matchedBat, unmatched],
    ['Pitcher', matchedPit, unmatchedPit]
  ] as [string, number, Map<string, number>][]) {
    console.log(`\n🔗 ${label} PA matched to a repo (player, team): ${pct(matched, totalPA)}`);
    const worst = [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (worst.length) {
      console.log(`   Top unmatched by PA lost:`);
      for (const [slug, n] of worst) console.log(`   ${String(n).padStart(5)} PA  ${slug}`);
    }
  }
  console.log(`\n💾 Wrote ${outFile}`);
}

if (import.meta.main) await main();
