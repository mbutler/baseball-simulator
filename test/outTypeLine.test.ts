import { test, expect } from 'bun:test';
import { outTypeLine, LEAGUE_OUT_TYPE_LINE } from '../src/core/countCards.js';

/** Every printed band must tile the ten digits exactly once — a gap is unplayable. */
function tiles(line: string): boolean {
  const seen = new Set<number>();
  for (const part of line.split('·').map(x => x.trim())) {
    const range = part.split(' ')[0];
    const [a, b] = range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
    if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) return false;
    for (let i = a; i <= b; i++) { if (seen.has(i)) return false; seen.add(i); }
  }
  return seen.size === 10 && Math.min(...seen) === 0 && Math.max(...seen) === 9;
}

const CASES: [string, number[]][] = [
  ['league average', [0.48, 0.32, 0.12, 0.08]],
  ['extreme groundballer', [0.70, 0.18, 0.08, 0.04]],
  ['extreme flyballer', [0.28, 0.50, 0.12, 0.10]],
  ['no grounders at all', [0.00, 0.70, 0.20, 0.10]],
  ['tiny grounder share', [0.12, 0.60, 0.18, 0.10]],
  ['nothing but grounders', [1.00, 0.00, 0.00, 0.00]],
];

for (const [label, dist] of CASES) {
  test(`ones-digit bands tile 0-9: ${label}`, () => {
    expect(tiles(outTypeLine(dist))).toBe(true);
  });
}

test('falls back to the league line when batted-ball data is absent', () => {
  expect(outTypeLine(null)).toBe(LEAGUE_OUT_TYPE_LINE);
  expect(tiles(LEAGUE_OUT_TYPE_LINE)).toBe(true);
});

test('the special grounder boxes appear only when there are grounders to spare', () => {
  expect(outTypeLine([1.0, 0, 0, 0])).toContain('DP');
  expect(outTypeLine([1.0, 0, 0, 0])).toContain('THRU');
  // One grounder box cannot also be a DP and a THRU box.
  expect(outTypeLine([0.12, 0.60, 0.18, 0.10])).not.toContain('THRU');
});
