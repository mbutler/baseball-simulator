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
 *   overlay  Matchup-specific batter pages for one team against one named
 *            starter, laid out to slot into that team's binder section.
 *
 *   game     Both overlays for tonight — each team's batters against the other
 *            team's starter — in one document. This is the one you want before
 *            a game; overlay is for printing a single side.
 *
 * Usage:
 *   bun run print-cards binder CHC-2025 MIL-2025
 *   bun run print-cards binder --all 2025
 *   bun run print-cards overlay CHC-2025 MIL-2025 --sp Priester
 *   bun run print-cards game CHC-2025 MIL-2025 --sp1 Boyd --sp2 Woodruff
 *   bun run print-cards scoresheet CHC-2025 MIL-2025   # lineups filled in
 *   bun run print-cards scoresheet --copies 6          # blanks to photocopy
 */

import { loadTeamFile, loadDataset } from '../utils/dataLoader.js';
import {
  getCountCards, tallyFor, applyApproach, BUCKETS, OUTCOMES
} from '../core/countCards.js';
import { getOutTypes, outTypeLine } from '../core/countCards.js';
import type { Bucket, CountProfiles, Tally } from '../core/countCards.js';
import type { AtBatProbabilities } from '../core/probabilityModel.js';
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import { convertPositionCode } from '../utils/describeOutcome.js';
import { formatPlayerName } from '../utils/playerName.js';
import path from 'path';

const MEDIAN_BF_PER_START = 23.1;
const ENDURANCE_SCALE = 18 / MEDIAN_BF_PER_START;
const SHIFT_COST = { AHEAD: 2, EVEN: 1 };
/** Three resolution tables fit a Letter page at print size with the strip above each. */
const BATTERS_PER_PAGE = 3;
/** Mean |Δ| wOBA above which a generic page misrepresents a pitcher enough to reprint (§9). */
const OVERLAY_THRESHOLD = 0.015;
/** Batters sampled when scoring a pitcher's generic-set error. */
const COVERAGE_SAMPLE = 50;
/** Mean batters faced in a relief outing, for netting swingmen's relief work out of BF/GS. */
const RELIEF_BF = 4.3;
/** A start-heavy pitcher; below this, BF/GS is too polluted by relief work to use. */
const MIN_START_SHARE = 0.7;
/** Least work a pitcher must have done to earn a line on the staff page. */
const MIN_STAFF_TBF = 40;
/** Headroom over a reliever's typical outing before he fades. */
const RELIEF_HEADROOM = 1;
/** Batters a starter faces in a game, and the wOBA-to-runs divisor. Used only to
 *  restate the generic-page error as runs, which a baseball fan can read. */
const STARTER_BF = 25, WOBA_SCALE = 1.2;
const runsOf = (dWoba: number) => dWoba / WOBA_SCALE * STARTER_BF;
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
  context: string, outTypes: number[] | null
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
      <div class="foot">OUTS — ones digit of your roll: ${outTypeLine(outTypes)}</div>
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

type Role = 'starter' | 'reliever';

/**
 * ENDURANCE, derived differently by role because the number means different
 * things. For a starter it is a FADE point that arrives before he is pulled:
 * the league median is 23.1 BF/start against an 18-batter fade, so starters
 * routinely finish while tired. A reliever is pulled at his limit rather than
 * past it, so his endurance sits just above a normal outing — median 4.1
 * batters, hence 5. That also hands him proportionally more stamina to spend
 * than a starter gets, which is right: relievers air it out.
 *
 * Swingmen are the trap either way. Ben Brown made 25 appearances and 15 starts,
 * so raw BF/GS read 31.5 and he printed as the most durable arm in baseball.
 */
function enduranceOf(raw: Record<string, unknown> | undefined): {
  value: number; estimated: boolean; role: Role;
} {
  const g = Number(raw?.p_g ?? 0), gs = Number(raw?.p_gs ?? 0), bfp = Number(raw?.p_bfp ?? 0);
  if (g <= 0 || bfp <= 0) return { value: 18, estimated: true, role: 'starter' };

  if (gs / g >= MIN_START_SHARE) {
    const perStart = (bfp - RELIEF_BF * (g - gs)) / gs;
    const scaled = Math.round(perStart * ENDURANCE_SCALE);
    return {
      value: Math.min(ENDURANCE_MAX, Math.max(ENDURANCE_MIN, scaled)),
      estimated: false, role: 'starter',
    };
  }
  // Relievers and swingmen: endurance tracks a typical outing, plus headroom.
  const perOuting = Math.round(bfp / g) + RELIEF_HEADROOM;
  return {
    value: Math.min(12, Math.max(3, perOuting)),
    estimated: gs > 0, role: 'reliever',
  };
}

interface PitcherLine {
  name: string; endurance: number; estimated: boolean; role: Role; grade: number;
  era: number; fip: number; err: number; ip: number; g: number;
}

function pitcherPageHtml(team: string, year: string, lines: PitcherLine[]): string {
  const rotation = lines.filter(l => l.role === 'starter');
  const pen = lines.filter(l => l.role === 'reliever');

  const rotRows = rotation.map(p => {
    const needs = p.err > OVERLAY_THRESHOLD;
    return `<tr class="${needs ? 'flag' : ''}">
      <th class="pn">${esc(formatPlayerName(p.name))}</th>
      <td class="num"><strong>${p.endurance}</strong>${p.estimated ? '<span class="est">est</span>' : ''}</td>
      <td class="num">${p.grade >= 0 ? '+' : ''}${p.grade}</td>
      <td class="num">${p.era.toFixed(2)}</td>
      <td class="num">${p.fip.toFixed(2)}</td>
      <td class="num">${runsOf(p.err).toFixed(2)}</td>
      <td class="ov">${needs ? 'PRINT OVERLAY' : 'standard is fine'}</td></tr>`;
  }).join('');

  const penRows = pen.map(p => `<tr>
      <th class="pn">${esc(formatPlayerName(p.name))}</th>
      <td class="num"><strong>${p.endurance}</strong></td>
      <td class="num">${p.grade >= 0 ? '+' : ''}${p.grade}</td>
      <td class="num">${p.era.toFixed(2)}</td>
      <td class="num">${p.g}</td>
      <td class="num">${p.ip.toFixed(0)}</td></tr>`).join('');

  return `
    <section class="blk wide">
      <header><h3>${esc(team)} ${year} — rotation</h3>
        <div class="meta">roll two dice, add GRADE, read the batter's strip · "off by" is runs per game</div></header>
      <table class="pit">
        <thead><tr><th class="pn">starter</th><th>END</th><th>GRADE</th><th>ERA</th><th>FIP</th>
          <th>off by</th><th class="ov">standard page</th></tr></thead>
        <tbody>${rotRows}</tbody>
      </table>
    </section>
    <section class="blk wide">
      <header><h3>${esc(team)} ${year} — bullpen</h3>
        <div class="meta">the standard page always fits a reliever — see front matter</div></header>
      <table class="pit">
        <thead><tr><th class="pn">reliever</th><th>END</th><th>GRADE</th><th>ERA</th><th>G</th><th>IP</th></tr></thead>
        <tbody>${penRows}</tbody>
      </table>
    </section>
    <section class="blk wide">
      <header><h3>Pitching</h3><div class="meta">see the Pitching page in front matter for why</div></header>
      <ul class="rules">
        <li>Track advances <strong>+1 per batter faced</strong>, <strong>+1 more per stamina point spent</strong>.</li>
        <li>Shift one rung toward you: <strong>AHEAD→EVEN costs ${SHIFT_COST.AHEAD}</strong>, <strong>EVEN→BEHIND costs ${SHIFT_COST.EVEN}</strong>. EARLY cannot be shifted.</li>
        <li>Past ENDURANCE → <strong>TIRED</strong>: every later leverage roll shifts one rung toward the hitter.</li>
        <li><strong>A TIRED pitcher may not spend.</strong> Nothing left to bear down with.</li>
        <li><strong>Change pitchers before any plate appearance.</strong> The reliever starts a fresh track at zero. A pitcher who leaves does not return, and the bullpen above is all you have — that is the only thing rationing changes.</li>
        <li>Nothing refills. A starter's budget is his start; a reliever's is his outing.</li>
      </ul>
    </section>`;
}

const RULES_PAGE = `
    <section class="blk wide">
      <header><h3>How to play</h3><div class="meta">everything you need is on these two pages</div></header>
      <p class="note"><strong>You need:</strong> this binder, two ten-sided dice read together as 1–100,
      and a pencil.</p>
      <p class="note"><strong>The one surprise:</strong> you never count balls and strikes. A single roll
      settles how the first few pitches went, and that is the whole count.</p>
      <ol class="rules">
        <li><strong>The pitcher rolls</strong> 1–100 and adds his GRADE — the small plus or minus on his
        staff page. He says the total out loud.</li>
        <li><strong>The batting manager reads that number</strong> on his hitter's strip, the four boxes
        across the top of the card. It lands on EARLY, AHEAD, EVEN or BEHIND. That is how the at-bat is
        going.</li>
        <li><strong>The pitcher may bear down</strong> — spend stamina to drag the at-bat one box his way
        (AHEAD→EVEN, or EVEN→BEHIND). It costs him: every point spent is a batter off his outing. Skip
        this on EARLY.</li>
        <li><strong>The batter picks an approach and rolls.</strong> PROTECT or DEAD-RED, then 1–100 on
        that row of his card. Read across to the outcome.</li>
      </ol>
      <p class="note"><strong>An at-bat, start to finish.</strong> Peralta faces Crow-Armstrong. Peralta
      rolls 63, adds his +5, and says "68." PCA's strip shows 39–75 is EVEN, so the at-bat is even. There
      is a runner on second with two out, so Peralta spends 1 stamina to make it BEHIND. Now PCA has to
      protect — swinging for the fences down 0-2 against Peralta is asking to strike out. He rolls 88 on
      the BEHIND / protect row: groundout. Inning over. Peralta marks two boxes on his track, one for the
      batter and one for the stamina.</p>
      <p class="note"><strong>The four boxes.</strong>
      <strong>EARLY</strong> — he jumped on an early pitch and it is already in play, so there is no
      bearing down and no approach to choose; just roll. About a quarter of all at-bats, and the best
      contact in baseball.
      <strong>AHEAD</strong> — hitter's count: walks and damage.
      <strong>EVEN</strong> — the ordinary at-bat, the most common one, and where your choices matter most.
      <strong>BEHIND</strong> — pitcher's count: strikeouts everywhere.</p>
    </section>`;

const PITCHING_PAGE = `
    <section class="blk wide">
      <header><h3>What the words mean</h3><div class="meta">read once, then ignore</div></header>
      <dl class="gloss">
        <dt>LEVERAGE strip</dt><dd>The four boxes on top of a batter's card. Where the pitcher's roll lands.</dd>
        <dt>RESOLUTION</dt><dd>The seven rows underneath — what actually happened.</dd>
        <dt>PROTECT</dt><dd>Choke up and shorten the swing. Fewer strikeouts, less power. Best when a ball
          in play scores a run: runner on third with under two out, or on second with two out.</dd>
        <dt>DEAD-RED</dt><dd>Sitting on a fastball. More home runs, more strikeouts. Best with the bases
          empty, or down late when a single will not help. <em>Neither approach is better on average —
          that is deliberate. The situation is what decides.</em></dd>
        <dt>GRADE</dt><dd>How good a pitcher is at getting ahead of hitters. Added to his roll. Runs about
          −7 to +6.</dd>
        <dt>ENDURANCE</dt><dd>How many batters he is good for. Pencil a tick per batter faced, and one more
          per stamina point spent. Past the number, he is TIRED.</dd>
        <dt>TIRED</dt><dd>Every roll from here slides one box toward the hitter, and he cannot bear down any
          more. Time to go to the bullpen.</dd>
        <dt>Stamina</dt><dd>There are no chips to hand out. Bearing down simply burns ENDURANCE faster — a
          starter's whole budget is his start, and nothing refills.</dd>
        <dt>Changing pitchers</dt><dd>Before any batter. The new man starts a fresh track. Whoever leaves is
          out for good, and your bullpen page is all you have.</dd>
        <dt>"off by"</dt><dd>How far the standard page misses this particular pitcher, in runs per game.
          Under about 0.3 you would never notice it across a game. Over that, the page says PRINT OVERLAY.</dd>
        <dt>OVERLAY</dt><dd>A replacement page for a lineup, built against one specific pitcher. Aces and
          disasters are far enough from ordinary that a standard page flatters the ace and punishes the
          scuffler; the overlay puts it right. <strong>Relievers never need one</strong> — they face about
          four hitters, so even a bad miss is worth a fifth of a run.</dd>
      </dl>
      <p class="note"><strong>Why ENDURANCE looks small for relievers.</strong> A starter's number is where
      he starts to fade, not where he gets pulled — real starters usually finish while tired. A reliever is
      taken out at his limit instead, so his number sits just above a normal outing. A closer at 5 is good
      for a clean inning with a little left to bear down with, and fades if the inning goes long.</p>
      <p class="note"><span class="est">est</span> beside an ENDURANCE means the pitcher both started and
      relieved that year, so neither measure fits him cleanly and the figure is a rough one.</p>
    </section>`;

/** Ticks on a fatigue track: enough for a complete game even with heavy spending. */
const TRACK_BOXES = 28;
/** Pitcher slots on a scoresheet. The filled rows double as the record of who has been used. */
const TRACK_ROWS = 6;
const SCORE_INNINGS = 9;

/**
 * A scoresheet for one team: their lineup grid on offence and their pitchers'
 * fatigue tracks on defence, so a manager scores entirely within his own page —
 * the same principle the binder sections follow.
 *
 * The fatigue track is the part no existing scorecard has. Boxes are plain
 * numbers rather than pre-marked, because ENDURANCE runs 3 for a short reliever
 * to 21 for a workhorse; you circle your number first, then tick one box per
 * batter faced and one more per stamina point spent.
 */
function scoresheetPage(team?: string, lineup?: NormalizedBatter[]): string {
  const innings = Array.from({ length: SCORE_INNINGS }, (_, i) => i + 1);
  const head = `<tr><th class="sn">#</th><th class="sb">batter</th>` +
    innings.map(i => `<th>${i}</th>`).join('') + `<th>X</th><th class="st">ab h r bi</th></tr>`;

  const rows = Array.from({ length: 9 }, (_, i) => {
    const name = lineup?.[i] ? esc(formatPlayerName(lineup[i].name)) : '';
    return `<tr><th class="sn">${i + 1}</th><td class="sb">${name}</td>` +
      innings.map(() => `<td class="ab"><span class="dia"></span></td>`).join('') +
      `<td class="ab"><span class="dia"></span></td><td class="st"></td></tr>`;
  }).join('');

  const totals = ['RUNS', 'HITS', 'LOB'].map(l =>
    `<tr class="tot"><th class="sn"></th><th class="sb">${l}</th>` +
    innings.map(() => '<td></td>').join('') + '<td></td><td class="st"></td></tr>').join('');

  const boxes = Array.from({ length: TRACK_BOXES }, (_, i) =>
    `<span class="bx">${i + 1}</span>`).join('');
  const tracks = Array.from({ length: TRACK_ROWS }, () =>
    `<div class="trk"><span class="tn"></span><span class="te">END</span>` +
    `<div class="bxs">${boxes}</div></div>`).join('');

  return `
    <section class="blk wide">
      <header><h3>${team ? esc(team) + ' — scoresheet' : 'Scoresheet'}</h3>
        <div class="meta">vs ______________ &nbsp; date ____________ &nbsp; final ______</div></header>
      <table class="score">
        <thead>${head}</thead>
        <tbody>${rows}${totals}</tbody>
      </table>
    </section>
    <section class="blk wide">
      <header><h3>Pitchers</h3>
        <div class="meta">circle ENDURANCE first · tick one box per batter faced, one more per stamina point</div></header>
      ${tracks}
      <p class="note">Past the circled number he is <strong>TIRED</strong>: every leverage roll slides one
      box toward the hitter and he can no longer bear down. A pitcher who leaves does not return, so these
      rows are also your record of who has been used.</p>
    </section>`;
}

const FIELDING_PAGE = `
    <section class="blk wide">
      <header><h3>Fielding — optional</h3>
        <div class="meta">one declaration, no extra dice; ignore this page and the game still works</div></header>
      <p class="note">Everything here reads the <strong>ones digit of the roll you already made</strong>.
      Nothing needs a second die, and every special box turns back into an ordinary out when its
      situation is not on the board — so you can add this page mid-game and take it away again.</p>
      <dl class="gloss">
        <dt>DP</dt><dd>A grounder that is a double play, if there is a runner on first with fewer than
          two out. Otherwise just a grounder.</dd>
        <dt>THRU</dt><dd>A grounder, and the box the defence controls. With the infield <strong>IN</strong>
          it gets through for a single; with the infield <strong>BACK</strong> it is an ordinary out.</dd>
        <dt>FB</dt><dd>A fly ball. With a runner on third and fewer than two out, he tags and scores —
          a sacrifice fly.</dd>
        <dt>LD / POP</dt><dd>Outs, and nobody advances on either.</dd>
      </dl>
      <p class="note"><strong>INFIELD IN or BACK.</strong> The fielding manager declares it whenever there
      is a runner on third with fewer than two out — after the pitcher decides about stamina, before the
      batter declares his approach, because the defence sets up and the hitter reacts.
      <strong>BACK</strong> concedes the run: a grounder is an out and the runner scores.
      <strong>IN</strong> cuts the run off: on a grounder the runner holds — but THRU now goes to the
      outfield for a single, and the run scores anyway with nobody out.</p>
      <p class="note">That is the whole trade, and it is the real one: play in and you are buying a run
      with the chance of a bigger inning. It is right when the run beats the out — tie game late — and
      wrong when you simply need outs.</p>
      <p class="note"><strong>Runners on a hit.</strong> The ones digit does nothing on a hit, so use it:
      <strong>0–6</strong> the runner holds, <strong>7–9</strong> he takes the extra base — first to third
      on a single, second to home. There is no throw to resolve; he either went or he did not.</p>
      <p class="note"><em>Prototype.</em> The DP and THRU boxes are one box each, which is the number
      to argue with after a few games — they are the tuning knobs for how often the infield-in gamble bites.
      Runner speed does not modify the advance band yet.</p>
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
  dl.gloss{margin:4px 0 0;display:grid;grid-template-columns:118px 1fr;gap:2px 10px;font-size:10px}
  dl.gloss dt{font-weight:700;text-align:right;color:#222}
  dl.gloss dd{margin:0;color:#333}
  table.score{font-family:sans-serif;font-size:9px}
  table.score th,table.score td{border:1px solid #bbb;padding:0}
  table.score thead th{background:#f4f4f2;font-size:8.5px;padding:2px 0;border-color:#999}
  th.sn{width:16px;text-align:center;color:#666}
  td.sb,th.sb{width:104px;text-align:left;padding:0 4px;font-size:9px;font-weight:600}
  td.ab{height:46px;position:relative}
  span.dia{position:absolute;left:50%;top:50%;width:19px;height:19px;margin:-10px 0 0 -10px;
           border:1px solid #ddd;transform:rotate(45deg)}
  th.st,td.st{width:52px;border-left:2px solid #999}
  tr.tot td,tr.tot th{height:17px;background:#fafafa}
  tr.tot th.sb{font-size:8px;letter-spacing:.5px;color:#555}
  .trk{display:flex;align-items:center;gap:4px;margin-bottom:6px}
  .tn{flex:0 0 108px;border-bottom:1px solid #999;height:17px}
  .te{flex:0 0 34px;font:8px sans-serif;color:#666;border-bottom:1px solid #999;height:15px;
      display:flex;align-items:flex-end;justify-content:flex-end;padding-bottom:1px}
  .bxs{display:flex;gap:1px}
  .bx{width:17px;height:15px;border:1px solid #ccc;font:7px sans-serif;color:#bbb;
      display:flex;align-items:flex-start;justify-content:flex-start;padding-left:1px}
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

/**
 * Pick a starter, by name fragment when given and by workload otherwise. Naming
 * one matters: without it every matchup is the team's ace, and you could never
 * play the fourth starter you are actually facing tonight.
 */
function findStarter(pitchers: NormalizedPitcher[], query?: string): NormalizedPitcher {
  const eligible = pitchers.filter(p => isRoster(p.name) && p.TBF > 0);
  if (!query) {
    const st = eligible.filter(p => (p.stats?.IP ?? 0) >= 50);
    return [...(st.length ? st : eligible)].sort((a, b) => b.TBF - a.TBF)[0];
  }
  const q = query.toLowerCase();
  const hits = eligible.filter(p => formatPlayerName(p.name).toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  const listing = [...eligible].sort((a, b) => b.TBF - a.TBF).slice(0, 12)
    .map(p => `  ${formatPlayerName(p.name)} (${p.TBF} TBF)`).join('\n');
  if (!hits.length) throw new Error(`No pitcher matching "${query}". Most used:\n${listing}`);
  throw new Error(`"${query}" matches ${hits.length} pitchers: ` +
    `${hits.map(h => formatPlayerName(h.name)).join(', ')}. Be more specific.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = ['overlay', 'binder', 'game', 'scoresheet'].includes(argv[0]) ? argv.shift()! : 'binder';
  const flags: Record<string, string | boolean> = {};
  const codes: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { codes.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    // --all takes no value; the year that follows it is a positional.
    if (key !== 'all' && next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
  const all = flags.all === true;
  const year = (codes[0]?.split('-')[1]) ?? '2025';

  const profiles = await Bun.file(
    path.resolve(process.cwd(), `dist/count-profiles-${year}.json`)).json() as CountProfiles;
  const rawDataset = await Bun.file(
    path.resolve(process.cwd(), `dist/complete-dataset-${year}.json`)).json();
  const rawTeams = Array.isArray(rawDataset) ? rawDataset : (rawDataset.teams ?? Object.values(rawDataset));
  // Keyed by player_id AND team, never by id alone: 120 pitcher ids appear on more
  // than one team in 2025, and the dataset splits a traded player's season by stint.
  // An id-only key silently takes whichever stint was iterated last — Rico García's
  // NYM line printed his one-game NYY stint. Same hazard the count profiles avoid by
  // keying <player_id>|<TEAM> (design doc §5).
  const key = (id: string, team: string) => `${id}|${team}`;
  const rawPitching = new Map<string, Record<string, unknown>>();
  const rawPos = new Map<string, string>();
  const isCatcher = new Set<string>();
  for (const t of rawTeams) for (const p of (t.players ?? [])) {
    const k = key(p.player_id, t.team);
    if (p.rawPitching) rawPitching.set(k, p.rawPitching);
    if (p.rawFielding?.pos != null && p.rawFielding.pos !== '') rawPos.set(k, String(p.rawFielding.pos));
    if (p.fielding?.stats?.armStrength != null) isCatcher.add(k);
  }
  const posOf = (b: NormalizedBatter, team: string): string => {
    const code = (rawPos.get(key(b.player_id, team)) ?? '').replace(/^\*/, '');
    if (code.startsWith('D')) return 'DH';
    const d = code.match(/\d/)?.[0];
    if (d) return convertPositionCode(d);
    return isCatcher.has(key(b.player_id, team)) ? 'C' : 'DH';
  };

  const leagueLev = (() => {
    const bk = profiles.league.buckets as number[];
    const t = bk.reduce((a, b) => a + b, 0);
    return bk.map(x => x / t);
  })();

  // Blank scoresheets are a legitimate request with no teams at all, so the
  // convenience default must not apply there or it silently prints two lineups.
  const teamCodes = all
    ? (await loadDataset()).teams.map(t => `${t.team}-${t.year}`).filter(c => c.endsWith(`-${year}`))
    : (codes.length ? codes : (mode === 'scoresheet' ? [] : ['CHC-2025', 'MIL-2025']));

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

  /** Overlay pages for one batting team against one named starter. */
  const overlayPages = async (batCode: string, pitCode: string, spQuery?: string): Promise<PageSpec[]> => {
    const batting = await loadTeamFile(batCode);
    const pitching = await loadTeamFile(pitCode);
    const starter = findStarter(pitching.pitchers, spQuery);
    const pitTally = tallyFor(profiles, 'pitchers', starter.player_id, pitCode.split('-')[0]);
    if (!pitTally) throw new Error(`No count profile for ${formatPlayerName(starter.name)}`);
    const lineup = [...batting.batters].filter(b => isRoster(b.name) && b.PA > 0)
      .sort((a, b) => b.PA - a.PA).slice(0, 9);
    const spName = formatPlayerName(starter.name);
    const out: PageSpec[] = [];
    console.log(`\n${batCode} batters vs ${spName} (${pitCode})`);
    for (let i = 0; i < lineup.length; i += BATTERS_PER_PAGE) {
      const chunk = lineup.slice(i, i + BATTERS_PER_PAGE);
      const body = chunk.map(b => {
        const cc = getCountCards(
          tallyFor(profiles, 'batters', b.player_id, batCode.split('-')[0]), pitTally, profiles);
        const bt = tallyFor(profiles, 'batters', b.player_id, batCode.split('-')[0]);
        return batterBlockHtml(b, posOf(b, batCode.split('-')[0]), cc.leverage, cc.resolution,
          `vs ${spName}`, getOutTypes(bt, pitTally, profiles));
      }).join('');
      out.push({ team: batCode.split('-')[0], section: `OVERLAY vs ${spName} · ${i + 1}–${i + chunk.length}`, body });
    }
    return out;
  };

  if (mode === 'scoresheet') {
    const copies = Number(flags.copies ?? 0);
    if (teamCodes.length) {
      for (const code of teamCodes) {
        const team = code.split('-')[0];
        const td = await loadTeamFile(code);
        const lineup = [...td.batters].filter(b => isRoster(b.name) && b.PA > 0)
          .sort((a, b) => b.PA - a.PA).slice(0, 9);
        pages.push({ team, section: 'scoresheet', body: scoresheetPage(`${team} ${year}`, lineup) });
        console.log(`  ${team} scoresheet, lineup filled`);
      }
    }
    for (let i = 0; i < (copies || (teamCodes.length ? 0 : 4)); i++) {
      pages.push({ team: 'COUNT GAME', section: 'fielding', body: FIELDING_PAGE });
    pages.push({ team: 'COUNT GAME', section: 'scoresheet', body: scoresheetPage() });
    }
    if (!pages.length) throw new Error('nothing to print: give teams or --copies N');
  } else if (mode === 'overlay' || mode === 'game') {
    const [a, b] = teamCodes;
    if (!b) throw new Error(`${mode} needs two teams: <team> <team>`);
    if (mode === 'overlay') {
      pages.push(...await overlayPages(a, b, flags.sp as string | undefined));
    } else {
      // Each team's batters face the other team's starter.
      pages.push(...await overlayPages(a, b, flags.sp2 as string | undefined));
      if (pages.length % 2 !== 0) {
        pages.push({ team: pages[pages.length - 1].team, section: 'notes', body: NOTES_BLOCK });
      }
      pages.push(...await overlayPages(b, a, flags.sp1 as string | undefined));
    }
  } else {
    pages.push({ team: 'COUNT GAME', section: 'rules', body: RULES_PAGE });
    pages.push({ team: 'COUNT GAME', section: 'pitching', body: PITCHING_PAGE });
    // One blank scoresheet lives in the binder so a game can start without a
    // second print run; `scoresheet --copies N` makes a stack of them.
    pages.push({ team: 'COUNT GAME', section: 'fielding', body: FIELDING_PAGE });
    pages.push({ team: 'COUNT GAME', section: 'scoresheet', body: scoresheetPage() });
    for (const code of teamCodes) {
      const team = code.split('-')[0];
      // A section must open on a recto so no team shares a sheet with the previous
      // one — that is what lets a team be pulled and reprinted as a unit. The pad
      // belongs to the section it FOLLOWS, not the one it precedes: labelling it
      // with the incoming team makes that team look like it opens on a verso, and
      // a blank notes page is useful to the team you just finished.
      if (pages.length % 2 !== 0) {
        pages.push({ team: pages[pages.length - 1].team, section: 'notes', body: NOTES_BLOCK });
      }
      const td = await loadTeamFile(code);
      const lineup = [...td.batters].filter(b => isRoster(b.name) && b.PA > 0)
        .sort((a, b) => b.PA - a.PA).slice(0, 9);
      console.log(`\n${team} ${year} — ${lineup.length} batters`);

      for (let i = 0; i < lineup.length; i += BATTERS_PER_PAGE) {
        const chunk = lineup.slice(i, i + BATTERS_PER_PAGE);
        const body = chunk.map(b => {
          const bt = tallyFor(profiles, 'batters', b.player_id, team);
          const cc = getCountCards(bt, null, profiles);
          return batterBlockHtml(b, posOf(b, team), cc.leverage, cc.resolution,
            'standard — any pitcher', getOutTypes(bt, null, profiles));
        }).join('');
        pages.push({ team, section: `batters ${i + 1}–${i + chunk.length}`, body });
      }

      const lines: PitcherLine[] = [];
      for (const p of td.pitchers) {
        const raw = rawPitching.get(key(p.player_id, team));
        if (!isRoster(p.name) || (p.TBF ?? 0) < MIN_STAFF_TBF) continue;
        const tl = tallyFor(profiles, 'pitchers', p.player_id, team);
        if (!tl) continue;
        const end = enduranceOf(raw);
        const grade = leverageGrade(getCountCards(null, tl, profiles).leverage, leagueLev);
        lines.push({
          name: p.name, endurance: end.value, estimated: end.estimated, role: end.role, grade,
          era: Number(raw?.p_earned_run_avg ?? 0), fip: Number(raw?.p_fip ?? 0),
          ip: Number(raw?.p_ip ?? 0), g: Number(raw?.p_g ?? 0),
          err: coverageError(tl, sample, profiles, grade, leagueLev),
        });
      }
      lines.sort((a, b) => (a.role === b.role ? a.fip - b.fip : a.role === 'starter' ? -1 : 1));
      pages.push({ team, section: 'pitchers', body: pitcherPageHtml(team, year, lines) });
      for (const l of lines) {
        console.log(`  ${l.role === 'starter' ? 'SP' : 'RP'} ${formatPlayerName(l.name).padEnd(22)} ` +
          `END ${String(l.endurance).padStart(2)}${l.estimated ? '*' : ' '} ` +
          `grade ${l.grade >= 0 ? '+' : ''}${String(l.grade).padEnd(2)}  Δ ${l.err.toFixed(4)}  ` +
          (l.role === 'starter' && l.err > OVERLAY_THRESHOLD ? 'PRINT OVERLAY' : ''));
      }
    }
  }

  const total = pages.length;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(teamCodes.join(', '))} — count game binder</title><style>${CSS}</style></head><body>
${pages.map((p, i) => renderPage(p, year, stamp, i + 1, total)).join('\n')}
</body></html>`;

  const tag = mode === 'binder'
    ? `binder-${all ? `all-${year}` : teamCodes.join('-')}`
    : teamCodes.length ? `${mode}-${teamCodes.join('-vs-')}` : `${mode}-blank`;
  const outPath = path.resolve(process.cwd(), `dist/${tag}.html`);
  await Bun.write(outPath, html);
  console.log(`\n${total} pages → ${path.relative(process.cwd(), outPath)}`);
  console.log(`stamp: ${stamp}\n`);
}

main().catch(err => {
  // Usage errors here are things like an unmatched pitcher name; the message is
  // the useful part and a stack trace only buries it.
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
