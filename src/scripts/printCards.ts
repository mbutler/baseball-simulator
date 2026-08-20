/**
 * @fileoverview Binder pages for the count game (design doc §3, §7.9, §9).
 *
 * Emits print-paginated, three-hole-punchable pages rather than loose cards.
 * A binder is the only format that carries the hybrid architecture §9 settles
 * on: permanent generic pages for the ~60% of starters a generic set covers,
 * plus matchup overlay pages slipped in for the outliers it does not. A glued
 * spine cannot accept the overlay; loose cards mean sorting 270 of them.
 *
 * Two modes:
 *
 *   binder   Permanent section per team — batters built against a league-average
 *            pitcher, then that team's starters with ENDURANCE, leverage grade,
 *            and a flag saying whether that pitcher needs an overlay.
 *
 *   overlay  Matchup-specific batter pages for one team against one starter,
 *            laid out to slot into that team's binder section.
 *
 * Usage:
 *   bun run print-cards binder CHC-2025 MIL-2025
 *   bun run print-cards binder --all 2025
 *   bun run print-cards overlay CHC-2025 MIL-2025     # CHC batters vs MIL's ace
 */

import { loadTeamFile, loadDataset } from '../utils/dataLoader.js';
import {
  getCountCards, tallyFor, applyApproach, BUCKETS, OUTCOMES
} from '../core/countCards.js';
import type { Bucket, CountProfiles, Tally } from '../core/countCards.js';
import type { AtBatProbabilities } from '../core/probabilityModel.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import { convertPositionCode } from '../utils/describeOutcome.js';
import { formatPlayerName } from '../utils/playerName.js';
import path from 'path';

const MEDIAN_BF_PER_START = 23.1;
const ENDURANCE_SCALE = 18 / MEDIAN_BF_PER_START;
const SHIFT_COST = { AHEAD: 2, EVEN: 1 };
const OUT_TYPE_LINE = '0-4 GB · 5-7 FB · 8 LD · 9 POP';
/** Three resolution tables fit a Letter page at print size with the strip above each. */
const BATTERS_PER_PAGE = 3;
/** Mean |Δ| wOBA above which a generic page misrepresents a pitcher enough to reprint (§9). */
const OVERLAY_THRESHOLD = 0.015;
/** Batters sampled when scoring a pitcher's generic-set error. */
const COVERAGE_SAMPLE = 50;
/** Mean batters faced in a relief outing, for netting swingmen's relief work out of BF/GS. */
const RELIEF_BF = 4.3;
/** A start-heavy pitcher; below this, BF/GS is too polluted by relief work to use. */
const MIN_START_SHARE = 0.8;
/** Observed pure-starter range was 15–20; clamp with a little headroom. */
const ENDURANCE_MIN = 13, ENDURANCE_MAX = 21;

const BUCKET_LABEL: Record<Bucket, string> = {
  early: 'EARLY', ahead: 'AHEAD', even: 'EVEN', behind: 'BEHIND'
};
const WOBA: Record<string, number> = {
  K: 0, BB: .69, HBP: .72, HR: 2.10, '1B': .89, '2B': 1.27, '3B': 1.62, Out: 0
};
const wobaOf = (r: AtBatProbabilities) => OUTCOMES.reduce((a, o) => a + r[o] * WOBA[o], 0);
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

/** Largest-remainder rounding onto exactly 100 boxes, asserted. */
function boxes(dist: number[], where: string): number[] {
  const raw = dist.map(v => v * 100);
  const ints = raw.map(Math.floor);
  const short = 100 - ints.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, f: v - ints[i] })).sort((x, y) => y.f - x.f)
    .slice(0, Math.max(0, short)).forEach(({ i }) => ints[i]++);
  const total = ints.reduce((a, b) => a + b, 0);
  if (total !== 100) throw new Error(`${where}: boxes sum to ${total}, not 100`);
  if (ints.some(n => n < 0)) throw new Error(`${where}: negative box count`);
  return ints;
}

/** Inclusive d100 ranges from box counts. A gap here is an unplayable page. */
function ranges(counts: number[]): (string | null)[] {
  let lo = 1;
  return counts.map(n => {
    if (n <= 0) return null;
    const hi = lo + n - 1;
    const label = lo === hi ? `${lo}` : `${lo}–${hi}`;
    lo = hi + 1;
    return label;
  });
}

interface Row { label: string; sub: string; cells: (string | null)[] }

function rowsFor(res: Record<Bucket, AtBatProbabilities>, who: string): Row[] {
  const asArr = (r: AtBatProbabilities) => OUTCOMES.map(o => r[o]);
  const out: Row[] = [
    { label: 'EARLY', sub: 'no choice', cells: ranges(boxes(asArr(res.early), `${who} EARLY`)) }
  ];
  for (const b of ['ahead', 'even', 'behind'] as Bucket[]) {
    out.push({ label: BUCKET_LABEL[b], sub: 'protect',
      cells: ranges(boxes(asArr(applyApproach(res[b], 'protect')), `${who} ${BUCKET_LABEL[b]}/pr`)) });
    out.push({ label: '', sub: 'dead-red',
      cells: ranges(boxes(asArr(applyApproach(res[b], 'deadRed')), `${who} ${BUCKET_LABEL[b]}/dr`)) });
  }
  return out;
}

const handOf = (n: string) => n.includes('*') ? 'L' : n.includes('#') ? 'S' : 'R';

function batterBlockHtml(
  b: NormalizedBatter, pos: string,
  leverage: Record<Bucket, number>, res: Record<Bucket, AtBatProbabilities>,
  context: string
): string {
  const who = formatPlayerName(b.name);
  const lev = boxes(BUCKETS.map(x => leverage[x]), `${who} leverage`);
  let lo = 1;
  const strip = BUCKETS.map((bk, i) => {
    const hi = lo + lev[i] - 1;
    const cell = `<div class="lev"><span class="levr">${lo}–${hi}</span><span class="levb">${BUCKET_LABEL[bk]}</span></div>`;
    lo = hi + 1;
    return cell;
  }).join('');

  const body = rowsFor(res, who).map(r => `
        <tr class="${r.sub === 'dead-red' ? 'dr' : ''}${r.sub === 'no choice' ? ' early' : ''}">
          <th class="bk">${r.label}</th><th class="ap">${r.sub}</th>
          ${r.cells.map(c => `<td>${c ?? '<span class="none">·</span>'}</td>`).join('')}
        </tr>`).join('');

  return `
    <section class="blk">
      <header><h3>${esc(who)}</h3>
        <div class="meta">${pos} · bats ${handOf(b.name)} · ${b.PA} PA · ${esc(context)}</div></header>
      <div class="striplab">LEVERAGE — pitcher rolls d100, adding his grade</div>
      <div class="strip">${strip}</div>
      <table>
        <thead><tr><th colspan="2" class="rl">RESOLUTION</th>
          ${OUTCOMES.map(o => `<th>${o}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="foot">OUTS — ones digit of your roll: ${OUT_TYPE_LINE}</div>
    </section>`;
}

/** A pitcher's leverage identity as one additive d100 modifier (§9, 0.0037 wOBA). */
function leverageGrade(solo: Record<Bucket, number>, leagueLev: number[]): number {
  const cum = (q: number[]) => { const c: number[] = []; let t = 0; for (const x of q) { t += x; c.push(t); } return c; };
  const target = BUCKETS.map(b => solo[b]);
  let best = 0, bestErr = Infinity;
  for (let k = -25; k <= 25; k++) {
    const c = cum(leagueLev).map(x => Math.min(1, Math.max(0, x - k / 100)));
    const g = [c[0]]; for (let i = 1; i < 4; i++) g.push(c[i] - c[i - 1]);
    const err = g.reduce((a, x, i) => a + Math.abs(x - target[i]), 0);
    if (err < bestErr) { bestErr = err; best = k; }
  }
  return best;
}

/**
 * How far a generic page misrepresents this pitcher, in mean |Δ| wOBA across a
 * sample of real batters. Above OVERLAY_THRESHOLD the binder page says so, which
 * is what makes "print only what you need" an instruction rather than a guess.
 */
function coverageError(
  pit: Tally, sample: { tally: Tally; generic: ReturnType<typeof getCountCards> }[],
  profiles: CountProfiles, grade: number, leagueLev: number[]
): number {
  const cum = (q: number[]) => { const c: number[] = []; let t = 0; for (const x of q) { t += x; c.push(t); } return c; };
  const shifted = (q: number[]) => {
    const c = cum(q).map(x => Math.min(1, Math.max(0, x - grade / 100)));
    const o = [c[0]]; for (let i = 1; i < 4; i++) o.push(c[i] - c[i - 1]);
    return o;
  };
  let sum = 0;
  for (const s of sample) {
    const truth = getCountCards(s.tally, pit, profiles);
    const lev = shifted(BUCKETS.map(x => s.generic.leverage[x]));
    const app = Object.fromEntries(OUTCOMES.map(o => [o, 0])) as unknown as AtBatProbabilities;
    BUCKETS.forEach((bk, i) => { for (const o of OUTCOMES) app[o] += lev[i] * s.generic.resolution[bk][o]; });
    sum += Math.abs(wobaOf(app) - wobaOf(truth.blended));
  }
  return sum / Math.max(1, sample.length);
}

/**
 * ENDURANCE from batters faced per start. Swingmen are the trap: Ben Brown made
 * 25 appearances and 15 starts, so his raw BF/GS reads 31.5 and he prints as the
 * most durable arm in baseball. Relief work is netted out first, and a pitcher
 * who is not predominantly a starter falls back to the league median rather than
 * being derived from a number that does not mean what it looks like.
 */
function enduranceOf(raw: Record<string, unknown> | undefined): { value: number; estimated: boolean } {
  const g = Number(raw?.p_g ?? 0), gs = Number(raw?.p_gs ?? 0), bfp = Number(raw?.p_bfp ?? 0);
  if (gs <= 0 || bfp <= 0 || g <= 0 || gs / g < MIN_START_SHARE) return { value: 18, estimated: true };
  const perStart = (bfp - RELIEF_BF * (g - gs)) / gs;
  const scaled = Math.round(perStart * ENDURANCE_SCALE);
  return { value: Math.min(ENDURANCE_MAX, Math.max(ENDURANCE_MIN, scaled)), estimated: false };
}

interface PitcherLine {
  name: string; endurance: number; estimated: boolean; grade: number;
  era: number; fip: number; err: number;
}

function pitcherPageHtml(team: string, year: string, lines: PitcherLine[]): string {
  const rows = lines.map(p => {
    const needs = p.err > OVERLAY_THRESHOLD;
    return `<tr class="${needs ? 'flag' : ''}">
      <th class="pn">${esc(formatPlayerName(p.name))}</th>
      <td class="num"><strong>${p.endurance}</strong>${p.estimated ? '<span class="est">est</span>' : ''}</td>
      <td class="num">${p.grade >= 0 ? '+' : ''}${p.grade}</td>
      <td class="num">${p.era.toFixed(2)}</td>
      <td class="num">${p.fip.toFixed(2)}</td>
      <td class="num">${p.err.toFixed(4)}</td>
      <td class="ov">${needs ? 'PRINT OVERLAY' : 'generic OK'}</td></tr>`;
  }).join('');

  return `
    <section class="blk wide">
      <header><h3>${esc(team)} ${year} — starting pitchers</h3>
        <div class="meta">roll d100, add GRADE, read the batter's leverage strip</div></header>
      <table class="pit">
        <thead><tr><th class="pn">pitcher</th><th>END</th><th>GRADE</th><th>ERA</th><th>FIP</th>
          <th>gen. Δ wOBA</th><th class="ov">generic page</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <ul class="rules">
        <li>Track advances <strong>+1 per batter faced</strong>, <strong>+1 more per stamina point spent</strong>.</li>
        <li>Shift one rung toward you: <strong>AHEAD→EVEN costs ${SHIFT_COST.AHEAD}</strong>, <strong>EVEN→BEHIND costs ${SHIFT_COST.EVEN}</strong>. EARLY cannot be shifted.</li>
        <li>Past ENDURANCE → <strong>TIRED</strong>: every later leverage roll shifts one rung toward the hitter.</li>
        <li><strong>A TIRED pitcher may not spend.</strong> Nothing left to bear down with.</li>
        <li>Nothing refills. The budget is the start.</li>
      </ul>
      <p class="note"><span class="est">est</span> ENDURANCE means the pitcher was not predominantly a starter,
      so batters-faced-per-start does not describe him; the league median is used instead.</p>
      <p class="note"><strong>PRINT OVERLAY</strong> means a generic page misrepresents this pitcher by more than
      ${OVERLAY_THRESHOLD} wOBA — roughly half a run a game. Run
      <code>print-cards overlay &lt;batting-team&gt; ${esc(team)}-${year}</code> and slot those pages in.</p>
    </section>`;
}

const RULES_PAGE = `
    <section class="blk wide">
      <header><h3>The plate appearance</h3><div class="meta">two rolls, two decisions, in order</div></header>
      <ol class="rules">
        <li><strong>Pitcher rolls LEVERAGE</strong> (d100), adds his GRADE, and announces the number.</li>
        <li>The batting manager reads it on his own batter's strip → EARLY / AHEAD / EVEN / BEHIND.</li>
        <li><strong>Pitcher decides</strong> whether to spend stamina to shift one rung toward himself.</li>
        <li><strong>Batter declares</strong> protect or dead-red, then <strong>rolls RESOLUTION</strong> (d100) on that row.</li>
      </ol>
      <p class="note"><strong>EARLY skips steps 3 and 4's choice</strong> — the ball is already in play. Roll the EARLY row and move on.</p>
      <p class="note">Nothing tracks balls and strikes. AHEAD / EVEN / BEHIND is the whole count state; a full count is already resolved inside the columns.</p>
      <p class="note"><strong>Protect</strong> trades power for contact, <strong>dead-red</strong> the reverse. They are worth the same on average, so the situation decides. Dead-red on BEHIND is indefensible.</p>
      <p class="note">Neither manager leaves his own team's section. The pitcher announces his number; the batting manager reads it.</p>
    </section>`;

const NOTES_BLOCK = '<section class="blk wide"><header><h3>Notes</h3>' +
  '<div class="meta">scoring, lineups, house rules</div></header></section>';

const CSS = `
  *{box-sizing:border-box}
  body{font:11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
       margin:0;padding:0;background:#e9e9e6;color:#111}
  .page{background:#fff;width:8.5in;min-height:11in;margin:0 auto 12px;
        padding:0.5in 0.5in 0.55in 0.9in;display:flex;flex-direction:column}
  .phead{display:flex;justify-content:space-between;align-items:baseline;
         border-bottom:1.5px solid #111;padding-bottom:3px;margin-bottom:8px}
  .phead .t{font:700 13px sans-serif;letter-spacing:.3px}
  .phead .s{font-size:9.5px;color:#555}
  .pbody{flex:1}
  .pfoot{border-top:1px solid #ccc;margin-top:8px;padding-top:3px;
         font:8.5px ui-monospace,Menlo,Consolas,monospace;color:#777;
         display:flex;justify-content:space-between}
  .blk{border:1px solid #bbb;border-radius:4px;padding:7px 9px;margin-bottom:7px}
  .blk header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
              border-bottom:1.5px solid #111;padding-bottom:3px;margin-bottom:5px}
  h3{font-size:12.5px;margin:0;letter-spacing:.2px}
  .meta{font-size:9px;color:#555;text-align:right}
  .striplab,.rl{font-size:8px;letter-spacing:.6px;color:#666;text-transform:uppercase}
  .strip{display:flex;gap:3px;margin:2px 0 6px}
  .lev{flex:1;border:1px solid #999;border-radius:3px;padding:2px;text-align:center;background:#fafafa}
  .levr{display:block;font:600 11px ui-monospace,Menlo,Consolas,monospace}
  .levb{display:block;font-size:7.5px;letter-spacing:.5px;color:#555}
  table{width:100%;border-collapse:collapse;font:10px ui-monospace,Menlo,Consolas,monospace}
  thead th{font:9px sans-serif;letter-spacing:.3px;color:#666;border-bottom:1px solid #999;
           padding:1px 3px;text-align:center}
  thead th.rl{text-align:left}
  td{text-align:center;padding:1.5px 3px;border-bottom:1px solid #eee;white-space:nowrap}
  th.bk{text-align:left;font:600 9px sans-serif;letter-spacing:.4px;padding:1.5px 4px 1.5px 0;width:42px}
  th.ap{text-align:left;font:400 8.5px sans-serif;color:#666;padding-right:5px;width:44px}
  tr.dr{background:#fbf7f2}
  tr.early{background:#f2f6fb}
  .none{color:#ccc}
  .foot{margin-top:4px;font:9px ui-monospace,Menlo,Consolas,monospace;color:#555;
        border-top:1px dashed #ccc;padding-top:3px}
  table.pit td.num{text-align:right;padding-right:10px}
  table.pit th.pn{text-align:left;font:600 10px sans-serif;padding-right:8px;white-space:nowrap}
  table.pit td.ov{text-align:left;font:9px sans-serif;color:#666}
  table.pit tr.flag{background:#fdf3ef}
  table.pit tr.flag td.ov{color:#a33;font-weight:600}
  .est{font:8px sans-serif;color:#888;margin-left:3px;vertical-align:super}
  .rules{margin:6px 0 0;padding-left:16px}
  .rules li{margin-bottom:2px}
  .note{margin:5px 0 0;color:#444;font-size:10px}
  code{font:10px ui-monospace,Menlo,Consolas,monospace;background:#f2f2f0;padding:1px 3px;border-radius:2px}
  @page{size:letter portrait;margin:0.5in 0.5in 0.55in 0.9in}
  @page :left{margin:0.5in 0.9in 0.55in 0.5in}
  @media print{
    body{background:#fff}
    .page{width:auto;min-height:0;margin:0;padding:0;page-break-after:always}
    .page:last-child{page-break-after:auto}
    .blk{page-break-inside:avoid}
  }`;

interface PageSpec { team: string; section: string; body: string }

function renderPage(p: PageSpec, year: string, stamp: string, n: number, total: number): string {
  return `
  <div class="page">
    <div class="phead"><span class="t">${esc(p.team)} ${year}</span><span class="s">${esc(p.section)}</span></div>
    <div class="pbody">${p.body}</div>
    <div class="pfoot"><span>${esc(p.team)} ${year} · ${esc(p.section)}</span>
      <span>${esc(stamp)} · page ${n}/${total}</span></div>
  </div>`;
}

const isRoster = (n: string) => !/team totals|rank in finals|player/i.test(n);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = (argv[0] === 'overlay' || argv[0] === 'binder') ? argv.shift()! : 'binder';
  const all = argv.includes('--all');
  const codes = argv.filter(a => !a.startsWith('--'));
  const year = (codes[0]?.split('-')[1]) ?? '2025';

  const profiles = await Bun.file(
    path.resolve(process.cwd(), `dist/count-profiles-${year}.json`)).json() as CountProfiles;
  const rawDataset = await Bun.file(
    path.resolve(process.cwd(), `dist/complete-dataset-${year}.json`)).json();
  const rawTeams = Array.isArray(rawDataset) ? rawDataset : (rawDataset.teams ?? Object.values(rawDataset));
  const rawPitching = new Map<string, Record<string, unknown>>();
  const rawPos = new Map<string, string>();
  const isCatcher = new Set<string>();
  for (const t of rawTeams) for (const p of (t.players ?? [])) {
    if (p.rawPitching) rawPitching.set(p.player_id, p.rawPitching);
    if (p.rawFielding?.pos != null && p.rawFielding.pos !== '') rawPos.set(p.player_id, String(p.rawFielding.pos));
    if (p.fielding?.stats?.armStrength != null) isCatcher.add(p.player_id);
  }
  const posOf = (b: NormalizedBatter): string => {
    const code = (rawPos.get(b.player_id) ?? '').replace(/^\*/, '');
    if (code.startsWith('D')) return 'DH';
    const d = code.match(/\d/)?.[0];
    if (d) return convertPositionCode(d);
    return isCatcher.has(b.player_id) ? 'C' : 'DH';
  };

  const leagueLev = (() => {
    const bk = profiles.league.buckets as number[];
    const t = bk.reduce((a, b) => a + b, 0);
    return bk.map(x => x / t);
  })();

  const teamCodes = all
    ? (await loadDataset()).teams.map(t => `${t.team}-${t.year}`).filter(c => c.endsWith(`-${year}`))
    : (codes.length ? codes : ['CHC-2025', 'MIL-2025']);

  const dataStamp = String((profiles.metadata as Record<string, unknown>).generatedAt ?? '').slice(0, 10);
  const stamp = `profiles ${dataStamp || year} · printed ${new Date().toISOString().slice(0, 10)}`;

  // Sample of real batters for scoring each pitcher's generic-page error.
  const sample: { tally: Tally; generic: ReturnType<typeof getCountCards> }[] = [];
  for (const t of rawTeams) for (const p of (t.players ?? [])) {
    if (sample.length >= COVERAGE_SAMPLE) break;
    if ((p.batting?.PA ?? 0) >= 450 && isRoster(p.name)) {
      const tl = tallyFor(profiles, 'batters', p.player_id, p.team);
      if (tl) sample.push({ tally: tl, generic: getCountCards(tl, null, profiles) });
    }
  }

  const pages: PageSpec[] = [];

  if (mode === 'overlay') {
    const [batCode, pitCode] = teamCodes;
    if (!pitCode) throw new Error('overlay needs two teams: <batting-team> <pitching-team>');
    const batting = await loadTeamFile(batCode);
    const pitching = await loadTeamFile(pitCode);
    const el = pitching.pitchers.filter(p => isRoster(p.name) && p.TBF > 0);
    const st = el.filter(p => (p.stats?.IP ?? 0) >= 50);
    const starter = [...(st.length ? st : el)].sort((a, b) => b.TBF - a.TBF)[0];
    const pitTally = tallyFor(profiles, 'pitchers', starter.player_id, pitCode.split('-')[0]);
    const lineup = [...batting.batters].filter(b => isRoster(b.name) && b.PA > 0)
      .sort((a, b) => b.PA - a.PA).slice(0, 9);
    const label = `OVERLAY vs ${formatPlayerName(starter.name)}`;
    console.log(`\n${batCode} overlay — vs ${formatPlayerName(starter.name)} (${pitCode})\n`);
    for (let i = 0; i < lineup.length; i += BATTERS_PER_PAGE) {
      const chunk = lineup.slice(i, i + BATTERS_PER_PAGE);
      const body = chunk.map(b => {
        const cc = getCountCards(tallyFor(profiles, 'batters', b.player_id, batCode.split('-')[0]), pitTally, profiles);
        console.log(`  ${formatPlayerName(b.name)}`);
        return batterBlockHtml(b, posOf(b), cc.leverage, cc.resolution, `vs ${formatPlayerName(starter.name)}`);
      }).join('');
      pages.push({ team: batCode.split('-')[0], section: `${label} · ${i + 1}–${i + chunk.length}`, body });
    }
  } else {
    pages.push({ team: 'COUNT GAME', section: 'rules', body: RULES_PAGE });
    for (const code of teamCodes) {
      const team = code.split('-')[0];
      // A section must open on a recto so no team shares a sheet with the previous
      // one — that is what lets a team be pulled and reprinted as a unit.
      if (pages.length % 2 !== 0) {
        pages.push({ team, section: 'notes', body: NOTES_BLOCK });
      }
      const td = await loadTeamFile(code);
      const lineup = [...td.batters].filter(b => isRoster(b.name) && b.PA > 0)
        .sort((a, b) => b.PA - a.PA).slice(0, 9);
      console.log(`\n${team} ${year} — ${lineup.length} batters`);

      for (let i = 0; i < lineup.length; i += BATTERS_PER_PAGE) {
        const chunk = lineup.slice(i, i + BATTERS_PER_PAGE);
        const body = chunk.map(b => {
          const cc = getCountCards(tallyFor(profiles, 'batters', b.player_id, team), null, profiles);
          return batterBlockHtml(b, posOf(b), cc.leverage, cc.resolution, 'generic — any pitcher');
        }).join('');
        pages.push({ team, section: `batters ${i + 1}–${i + chunk.length}`, body });
      }

      const lines: PitcherLine[] = [];
      for (const p of td.pitchers) {
        const raw = rawPitching.get(p.player_id);
        const gs = Number(raw?.p_gs ?? 0), bfp = Number(raw?.p_bfp ?? 0);
        if (!isRoster(p.name) || gs < 10) continue;
        const tl = tallyFor(profiles, 'pitchers', p.player_id, team);
        if (!tl) continue;
        const end = enduranceOf(raw);
        const grade = leverageGrade(getCountCards(null, tl, profiles).leverage, leagueLev);
        lines.push({
          name: p.name, endurance: end.value, estimated: end.estimated, grade,
          era: Number(raw?.p_earned_run_avg ?? 0), fip: Number(raw?.p_fip ?? 0),
          err: coverageError(tl, sample, profiles, grade, leagueLev),
        });
      }
      lines.sort((a, b) => a.fip - b.fip);
      pages.push({ team, section: 'pitchers', body: pitcherPageHtml(team, year, lines) });
      for (const l of lines) {
        console.log(`  ${formatPlayerName(l.name).padEnd(22)} END ${String(l.endurance).padStart(2)}${l.estimated ? '*' : ' '} ` +
          `grade ${l.grade >= 0 ? '+' : ''}${String(l.grade).padEnd(2)}  Δ ${l.err.toFixed(4)}  ` +
          (l.err > OVERLAY_THRESHOLD ? 'PRINT OVERLAY' : ''));
      }
    }
  }

  const total = pages.length;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(teamCodes.join(', '))} — count game binder</title><style>${CSS}</style></head><body>
${pages.map((p, i) => renderPage(p, year, stamp, i + 1, total)).join('\n')}
</body></html>`;

  const tag = mode === 'overlay' ? `overlay-${teamCodes.join('-vs-')}` : `binder-${all ? `all-${year}` : teamCodes.join('-')}`;
  const outPath = path.resolve(process.cwd(), `dist/${tag}.html`);
  await Bun.write(outPath, html);
  console.log(`\n${total} pages → ${path.relative(process.cwd(), outPath)}`);
  console.log(`stamp: ${stamp}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
