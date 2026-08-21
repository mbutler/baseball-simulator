#!/usr/bin/env bun
/**
 * @fileoverview Builds count-state profiles from Baseball Savant pitch-level data.
 * @module scripts/fetchCountData
 *
 * Two stages, cached independently:
 *
 *   1. FETCH   Savant CSV in date chunks -> a compact per-PA cache
 *              (`dist/data/statcast/pa-<year>.csv`). One line per plate
 *              appearance: batter, pitcher, teams, the full count path, outcome.
 *              The full path is kept so the pivot definition in stage 2 can be
 *              changed without re-downloading a season.
 *
 *   2. DISTILL The PA cache -> `dist/count-profiles-<year>.json`: a league
 *              count table plus per-player leverage and per-column outcomes,
 *              keyed by the same player_id slug the main dataset uses.
 *
 * Usage:
 *   bun run src/scripts/fetchCountData.ts 2025
 *   bun run src/scripts/fetchCountData.ts 2025 --distill-only
 */

import { mkdir, readFile, writeFile, appendFile, rm, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const cacheDir = path.resolve(projectRoot, 'dist/data/statcast');

const SAVANT_ROW_CAP = 25000; // hard cap on the CSV export endpoint

/** Outcome vocabulary — the same eight the probability model uses. */
export const OUTCOMES = ['K', 'BB', 'HBP', 'HR', '1B', '2B', '3B', 'Out'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Count buckets, from the batter's perspective, measured at the pivot pitch.
 * `early` = the PA ended before the pivot (a first- or second-pitch result).
 */
export const BUCKETS = ['early', 'ahead', 'even', 'behind'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Statcast team abbreviations that differ from this repo's canonical codes. */
const TEAM_ALIASES: Record<string, string> = {
  AZ: 'ARI', CWS: 'CHW', KC: 'KCR', SD: 'SDP',
  SF: 'SFG', TB: 'TBR', WSH: 'WSN', ATH: 'OAK'
};
const canonTeam = (t: string) => TEAM_ALIASES[t] ?? t;

const STRIKEOUTS = new Set(['strikeout', 'strikeout_double_play']);
const EVENT_MAP: Record<string, Outcome> = {
  walk: 'BB', hit_by_pitch: 'HBP', home_run: 'HR',
  single: '1B', double: '2B', triple: '3B'
};
/** Not real batting results — excluded rather than counted as outs. */
const EXCLUDED_EVENTS = new Set(['catcher_interf', 'truncated_pa', 'game_advisory']);

function classify(event: string): Outcome | null {
  if (!event || EXCLUDED_EVENTS.has(event)) return null;
  if (STRIKEOUTS.has(event)) return 'K';
  return EVENT_MAP[event] ?? 'Out';
}

/** Encode a (balls, strikes) count as one base-36 char so a path packs tightly. */
const encodeCount = (balls: number, strikes: number) =>
  (balls * 3 + strikes).toString(36);
const decodeCount = (ch: string): [number, number] => {
  const n = parseInt(ch, 36);
  return [Math.floor(n / 3), n % 3];
};

/** Minimal RFC4180 CSV parser: handles quoted commas, escaped quotes, and newlines in fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Fetch one date range of pitches from the Savant CSV export. */
async function fetchRange(start: string, end: string, year: string, attempts = 4): Promise<string[][]> {
  const url = new URL('https://baseballsavant.mlb.com/statcast_search/csv');
  const params: Record<string, string> = {
    all: 'true', type: 'details', hfSea: `${year}|`, hfGT: 'R|',
    player_type: 'batter', game_date_gt: start, game_date_lt: end
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let lastErr = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'baseball-simulator/1.0 (personal, non-commercial)' } });
      if (!res.ok) throw new Error(`status ${res.status} ${res.statusText}`);
      const rows = parseCsv((await res.text()).replace(/^﻿/, ''));
      if (rows.length < 2) return [];
      return rows;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < attempts) {
        const waitMs = 3000 * 2 ** (attempt - 1);
        console.warn(`   ⚠️  ${start}..${end} attempt ${attempt}/${attempts}: ${lastErr} — retry in ${waitMs / 1000}s`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`Savant fetch failed for ${start}..${end}: ${lastErr}`);
}

interface PaRow {
  batter: string; pitcher: string;
  batTeam: string; fldTeam: string;
  path: string; outcome: Outcome; bb: string;
}

const PA_HEADER = 'batter,pitcher,batTeam,fldTeam,path,outcome,bb';

/** Statcast batted-ball type, one char. Empty when the PA never put a ball in play. */
function encodeBbType(v: string | undefined): string {
  switch ((v ?? '').trim()) {
    case 'ground_ball': return 'G';
    case 'fly_ball': return 'F';
    case 'line_drive': return 'L';
    case 'popup': return 'P';
    default: return '';
  }
}

/** Collapse pitch rows into one record per plate appearance. */
function pitchesToPAs(rows: string[][]): PaRow[] {
  if (rows.length < 2) return []; // empty date range (e.g. before Opening Day)
  const head = rows[0];
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const need = ['game_pk', 'at_bat_number', 'pitch_number', 'balls', 'strikes',
                'events', 'batter', 'pitcher', 'home_team', 'away_team', 'inning_topbot', 'game_type',
                'bb_type'];
  for (const n of need) if (!(n in col)) throw new Error(`Savant CSV missing column: ${n}`);

  const groups = new Map<string, string[][]>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < head.length) continue;
    if (r[col.game_type] !== 'R') continue; // regular season only, to match BR season stats
    const key = `${r[col.game_pk]}|${r[col.at_bat_number]}`;
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }

  const out: PaRow[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => Number(a[col.pitch_number]) - Number(b[col.pitch_number]));
    const terminal = [...g].reverse().find(r => r[col.events]);
    if (!terminal) continue;
    const outcome = classify(terminal[col.events]);
    if (!outcome) continue;

    const first = g[0];
    const isTop = first[col.inning_topbot] === 'Top';
    out.push({
      batter: first[col.batter],
      pitcher: first[col.pitcher],
      batTeam: canonTeam(isTop ? first[col.away_team] : first[col.home_team]),
      fldTeam: canonTeam(isTop ? first[col.home_team] : first[col.away_team]),
      path: g.map(r => encodeCount(Number(r[col.balls]), Number(r[col.strikes]))).join(''),
      outcome,
      bb: encodeBbType(terminal[col.bb_type])
    });
  }
  return out;
}

/** Stage 1: download the season in chunks, writing the compact PA cache. */
async function fetchSeason(year: string, chunkDays: number): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const paFile = path.resolve(cacheDir, `pa-${year}.csv`);

  const seasonStart = new Date(`${year}-03-01T00:00:00Z`);
  const seasonEnd = new Date(`${year}-10-10T00:00:00Z`);

  // Write per chunk and resume from what is already cached: a crash at chunk 45
  // used to lose the whole run (design doc §7 item 6). The progress marker holds
  // the next date to fetch; a header mismatch means the cache predates a schema
  // change, so it is discarded rather than silently mixed.
  const progFile = `${paFile}.progress`;
  let cursor = seasonStart;
  let chunks = 0;
  let resumed = false;

  const existingHead = await readFile(paFile, 'utf8')
    .then(t => t.slice(0, t.indexOf('\n')).trim()).catch(() => null);
  const savedNext = await readFile(progFile, 'utf8').then(t => t.trim()).catch(() => null);

  if (existingHead === PA_HEADER && savedNext) {
    cursor = new Date(`${savedNext}T00:00:00Z`);
    resumed = true;
    console.log(`↻ Resuming from ${savedNext} (cache header matches)`);
  } else {
    if (existingHead && existingHead !== PA_HEADER) {
      console.log('ℹ️  Cached PA file has an older schema — refetching the season.');
    }
    await writeFile(paFile, PA_HEADER + '\n');
  }

  while (cursor <= seasonEnd) {
    let span = chunkDays;
    let rows: string[][] = [];
    // Shrink the window if we brush the row cap, so no pitches are silently dropped.
    for (;;) {
      const start = iso(cursor);
      const end = iso(addDays(cursor, span - 1));
      rows = await fetchRange(start, end, year);
      if (rows.length - 1 < SAVANT_ROW_CAP - 1000 || span === 1) break;
      span = Math.max(1, Math.floor(span / 2));
      console.warn(`   ⚠️  ${start}..${end} near the ${SAVANT_ROW_CAP}-row cap — narrowing to ${span}d`);
    }
    const pas = pitchesToPAs(rows);
    if (pas.length) {
      await appendFile(paFile, pas.map(p =>
        `${p.batter},${p.pitcher},${p.batTeam},${p.fldTeam},${p.path},${p.outcome},${p.bb}`).join('\n') + '\n');
    }
    chunks++;
    if (pas.length) {
      console.log(`   ${iso(cursor)}..${iso(addDays(cursor, span - 1))}  ${rows.length - 1} pitches → ${pas.length} PA`);
    }
    cursor = addDays(cursor, span);
    await writeFile(progFile, iso(cursor));
    await new Promise(r => setTimeout(r, 1200)); // be polite
  }

  await rm(progFile, { force: true });
  const total = (await readFile(paFile, 'utf8')).trimEnd().split('\n').length - 1;
  console.log(`\n💾 PA cache: ${paFile} (${total} PA, ${chunks} requests this run${resumed ? ', resumed' : ''})`);
  return paFile;
}

export { fetchSeason, pitchesToPAs, parseCsv, encodeCount, decodeCount, classify, canonTeam };

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const year = args.find(a => /^\d{4}$/.test(a)) ?? '2025';
  const distillOnly = args.includes('--distill-only');
  const paFile = path.resolve(cacheDir, `pa-${year}.csv`);

  if (!distillOnly) {
    const exists = await stat(paFile).then(() => true).catch(() => false);
    if (exists) console.log(`ℹ️  Overwriting existing PA cache at ${paFile}`);
    console.log(`⚾ Fetching ${year} pitch data from Baseball Savant...`);
    await fetchSeason(year, 4);
  }
  console.log(`\n✅ Stage 1 complete. Run the distiller next.`);
}
