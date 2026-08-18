# The count game — design doc

**Status:** working design. Pipeline built on the full 2025 season; **calibration passes**. Ready for a paper playtest.
**Supersedes:** §6 ("Ideas we've liked") of [`tabletop-game-brief.md`](./tabletop-game-brief.md). Everything else in that brief still stands — especially §5 (what not to clone), §8 (constraints and taste), and §10 (glossary).

Data is from [Baseball Reference](https://www.baseball-reference.com/) and [Baseball Savant](https://baseballsavant.mlb.com/) (Statcast). Both remain the property of their owners. Non-commercial / educational use only. Not affiliated with or endorsed by Baseball Reference, Sports Reference, MLB Advanced Media, or Strat-O-Matic.

---

## 1. Why the previous design changed

The brief's face-off design was: pitcher card resolves K/BB/HBP or "in play," then the batter's contact card resolves the ball in play. Two cards, two rolls, cup over the batter's die.

Two problems surfaced when we looked hard at it:

1. **It is structurally Strat.** Two cards, roll, find the row, read the result. The novelty ("you only meet the hitter if the pitcher fails to finish the PA") is real in the math but nearly invisible at the table. A Strat player would experience the same physical act.
2. **Neither player makes a decision.** The batter's die is ignored ~30% of the time and is never *chosen*. Strat survives a decisionless PA because its manager layer carries the game; if our basic loop is decisionless and the modules are optional, the basic game is a randomizer with good flavor.

The fix turned out to be the thing every dice baseball game throws away.

## 2. The core insight

Every mainstream dice baseball game — Strat, APBA, Statis Pro, Replay, Dynasty League, Deadball — resolves **one plate appearance per roll**. None of them model the count.

The count is the single most baseball thing they discard, and it is enormous. From **the complete 2025 regular season — 182,840 plate appearances of Statcast pitch data** — bucketing each PA by **the count it faced on the 3rd pitch**:

| After 2 pitches | % of PA | K% | BB% | OBP | SLG |
|---|---|---|---|---|---|
| Put in play early (≤2 pitches) | 26.8% | 0.0% | 0.0% | .336 | .543 |
| 2-0 — hitter ahead | 13.0% | 14.1% | 29.0% | .476 | .446 |
| 1-1 — even | 39.0% | 27.3% | 9.4% | .301 | .360 |
| 0-2 — hitter behind | 21.3% | 45.9% | 3.1% | .198 | .254 |

A **278-point OBP spread** and a **32-point K% spread** between ahead and behind. That is a bigger separation than exists between any two hitters you would ever print on a card. (A 1,153-PA pilot on a single day predicted these within a percentage point on every bucket, so the effect is stable, not a full-season artifact.)

> **The count is a bigger lever than the players are.**

That is the whole design thesis. It is also why the game feels like baseball rather than like a lookup table: a 3-1 count genuinely is a different sport than 0-2, and no game on the shelf lets you feel that.

The 0.0% K and 0.0% BB in the early bucket are not sampling noise — you cannot strike out in under 3 pitches or walk in under 4. Their appearance is a parsing correctness check.

### Why this pivot definition

"The count faced on the 3rd pitch" was chosen because it is the only pivot that is simultaneously:

- **A clean partition.** Every PA lands in exactly one bucket, so the four columns compose into a valid probability distribution. The standard "OPS after 3-1" style split does *not* have this property — a PA passes through many counts and would be counted several times.
- **Non-circular.** Bucketing by the *terminal* count is meaningless: every walk ends on a 3-ball count and every strikeout ends with 2 strikes, so the correlation would be mechanical.
- **Naturally trichotomous.** After exactly 2 pitches the only reachable counts are 2-0, 1-1, and 0-2 — ahead, even, behind. The design's three columns fall out of the structure of baseball rather than being imposed on it.

The full count path is preserved in the data cache, so this definition can be revised without re-fetching a season. See §5.

## 3. The core loop

Two rolls, one decision, every plate appearance.

**Roll 1 — LEVERAGE.** Both players roll at once. The pitcher's card and the batter's card resolve to *which count bucket the PA reaches*: early contact / ahead / even / behind. **No strikeout, no walk, no hit.** Just: who won the first two pitches.

**The decision point.** The pitcher may spend from a stamina pool to shift the count one step in their favor — bear down now, pay for it in the seventh. The batter may choose to *protect* (shrink the strikeout, shrink the power) or *sit dead-red* (the reverse). One choice, a few seconds, real tension.

**Roll 2 — RESOLUTION.** The batter's contact card has four columns, one per bucket. Roll on the column roll 1 selected. Strikeouts and walks live *here*, emerging from the count rather than being printed as flat season rates.

The cup still works: the batter rolls under it and lifts only when the count column is known.

### What this changes

The pitcher's card **stops being an outcome card entirely.** A pitcher's identity becomes "how often do I get you to 0-2." That is both true to baseball and something no dice game currently expresses. It also makes the pitching seat an active resource game across nine innings rather than a lookup chart someone reads on the hitter's behalf.

### Where the modules still fit

Everything in §6 of the brief about Strat's icon trick survives intact, and gets better: modules can now key off the *count column* as well as the icons. `TIRED` becomes "shift one leverage box toward the hitter," which is exactly what the digital engine's fatigue rule does. `CLUTCH` can bias the leverage roll instead of the outcome roll, which is closer to how RISP actually works.

## 4. The math

Both stages reuse the machinery already in [`probabilityModel.ts`](../src/core/probabilityModel.ts) — no new statistics were invented.

**Roll 1 (leverage).** Per-player bucket distribution. Sample size is excellent: every PA is one observation, so a 600-PA hitter contributes 600. Batter and pitcher distributions are combined per-bucket with `log5` against the league bucket rate, then normalized.

**Roll 2 (resolution).** Per-player outcome distribution *within* each bucket. Sample size is thin here — a hitter's 2-0 column holds roughly 12% of their PA, so ~72 for a full season. This is precisely what `regressRate` exists for: each cell is shrunk toward the league distribution *for that same bucket* before log5 combines batter and pitcher.

Priors, in [`countCards.ts`](../src/core/countCards.ts):

| Prior | Value | Rationale |
|---|---|---|
| `PRIOR_LEVERAGE` | 100 | Matches `PRIOR_PA`; leverage is observed once per PA |
| `PRIOR_RESOLUTION` | 60 | A single column holds far fewer PA, so regress harder |

Both are tunable without rebuilding data, because the profile file stores **raw counts, not rates** (§5).

### The calibration test

`getCountCards()` returns a third value alongside the two cards: `blended`, the marginal outcome distribution the two-roll system implies —

```
P(outcome) = Σ_bucket  P(bucket) × P(outcome | bucket)
```

**This is the test that decides whether any card gets printed.** If `blended` for a given matchup lands on what `getAtBatProbabilities()` already produces for that same matchup, then the tabletop game is calibrated to the digital sim you have already validated against 2025 MLB, and the count columns are a *redistribution* of a known-good run environment rather than a new and unvalidated one.

If they diverge, the priors are wrong and must be fixed before anything is printed. Divergence in K% and BB% is the most likely failure mode, since those are the outcomes the count moves hardest.

### Result — PASS

`bun run src/scripts/validateCountCards.ts 2025`, over 180 batter-vs-starter pairs across 10 matchups, with 100% profile coverage on both sides:

| Outcome | mean Δ | mean \|Δ\| | max \|Δ\| |
|---|---|---|---|
| K | −0.31pp | 0.91pp | 2.98pp |
| BB | −0.24pp | 0.50pp | 3.32pp |
| HBP | −0.00pp | 0.13pp | 1.32pp |
| HR | −0.10pp | 0.26pp | 1.27pp |
| 1B | +0.22pp | 0.56pp | 1.55pp |
| 2B | +0.16pp | 0.43pp | 1.76pp |
| 3B | −0.19pp | 0.25pp | 1.41pp |
| Out | +0.46pp | 0.91pp | 4.94pp |

Worst mean \|Δ\| is **0.91pp**, inside the 2pp threshold, and the signed means are near zero — so there is no systematic drift, just per-matchup noise. **The two-roll card system reproduces the digital sim's run environment.**

### The personality test, on real cards

Top Cubs batters vs Freddy Peralta, leverage distribution and K% by column:

| Batter | early | ahead | even | behind | K% by column |
|---|---|---|---|---|---|
| Ian Happ | 17.4% | 16.7% | 45.3% | 20.6% | 0 / 16 / 31 / 52 |
| Seiya Suzuki | 17.2% | 13.1% | 44.6% | 25.1% | 0 / 18 / 30 / 54 |
| Nico Hoerner | 28.5% | 12.9% | 37.5% | 21.1% | 0 / 12 / **18** / **31** |
| Pete Crow-Armstrong | 27.7% | 10.2% | 37.1% | 25.0% | 0 / 16 / **37** / **54** |

This is the result that matters. Hoerner and Crow-Armstrong are **equally aggressive** — 28.5% vs 27.7% early contact — but when they fall behind, Hoerner strikes out 31% and PCA strikes out 54%. Same behaviour on the leverage roll, completely different consequence on the resolution roll. Happ and Suzuki are the patient mirror image: they reach 2-0 more often and see far fewer early-contact PAs.

Personality survives the flattening, and it survives it in a way a single K-rate box could not express.

## 5. The data pipeline

Three new pieces, each independently re-runnable.

| Piece | Path | Role |
|---|---|---|
| Pitch fetch | `src/scripts/fetchCountData.ts` | Savant CSV → compact per-PA cache |
| Distiller | `src/scripts/buildCountProfiles.ts` | PA cache → `dist/count-profiles-2025.json` |
| Card math | `src/core/countCards.ts` | Profiles + log5/shrinkage → the two cards |

```sh
bun run src/scripts/fetchCountData.ts 2025          # ~50 requests, several minutes
bun run src/scripts/buildCountProfiles.ts 2025      # local, fast
```

### Design decisions worth preserving

**Two stages, cached separately.** The fetch writes a compact per-PA cache (`dist/data/statcast/pa-2025.csv`) rather than ~700MB of raw CSV. Each line is one plate appearance: batter, pitcher, both teams, **the full count path**, and the outcome. Keeping the whole path means the §2 pivot definition can be revised — or replaced entirely — with a fast local re-distill and no re-download.

Count paths are packed one base-36 char per pitch (`balls * 3 + strikes`), so `0367a` reads 0-0 → 1-0 → 2-0 → 2-1 → 3-1 → walk.

**Raw counts, not rates.** `count-profiles-2025.json` stores integer tallies. Shrinkage and log5 happen at model time, so priors stay tunable forever without touching the data.

**Regular season only** (`game_type == 'R'`), to match the Baseball Reference season stats the main dataset holds.

**What is and is not in git.** Derived data is committed on purpose — `complete-dataset-*.json`,
`count-profiles-*.json`, and the `pa-*.csv` cache (~6MB) — so a clone on another machine can
re-distill profiles, and re-tune the pivot definition, without re-scraping or spending ten
minutes re-fetching a season.

The scraped `dist/data/*.html` pages are **untracked and gitignored** as of 2026-08-18. They are
verbatim Baseball Reference content, which remains Sports Reference's property under
non-commercial/educational use, and this is a public repo. They are regenerable
(`bun run update-dataset <year>`) and nothing reads them back — only the scraper writes them.

⚠️ **They remain in git history**, having been committed in `c7a0ee8`. Untracking stops future
publication but does not remove the existing copies. Genuinely removing them requires a history
rewrite (`git filter-repo`) plus a force-push — a deliberate, disruptive decision, deferred rather
than done. Note that repo size is *not* an argument for it: the whole packed history is ~1.3 MiB,
because near-identical HTML compresses extremely well.

**Row-cap guard.** The Savant CSV endpoint caps at 25,000 rows. Four-day chunks run 14–16k in peak season; the fetcher narrows the window automatically if a chunk approaches the cap, so pitches are never silently dropped.

### Player identity — the part that needed care

The main dataset keys players by a name slug (`gabrielmoreno`) built as `name.toLowerCase().replace(/[^a-z0-9]/g,'')`. Statcast keys by MLBAM id. Bridging them uses the [Chadwick Bureau register](https://github.com/chadwickbureau/register), cached locally.

Naive slug matching hit **92%**. Folding diacritics and generational suffixes on *both* sides took it to **96.6%**. The residual broke down as:

- **The entire Athletics roster** — a genuine bug in the main dataset, see §6.
- **Nickname disagreements** — Statcast/Chadwick say `Enrique Hernández`, BR says `Kiké Hernández`. Handled by a small `NAME_ALIASES` table in the distiller; extend it as the audit surfaces more.
- **Marginal callups** absent from BR's team pages entirely. Acceptable loss.

**The dangerous case, and why the join is on `(slug, team)`:** seven slugs map to multiple *active* MLBAM ids — three different `luisgarcia`, plus `willsmith`, `maxmuncy`, `luiscastillo`, `luisortiz`, `loganallen`, `josefermin`. Name-only matching would **silently merge two different players into one card** — a reliever's count profile folded into a catcher's, with no error raised.

The fix: Statcast rows carry `home_team`, `away_team`, and `inning_topbot`, so the batter's and pitcher's teams are derivable per PA. Profiles are therefore keyed `<player_id>|<TEAM>`. This also matches how Baseball Reference splits a traded player's season, which is how the main dataset is already organized — 189 slugs appear on more than one team. Statcast team abbreviations are canonicalized to repo codes first (`AZ`→`ARI`, `CWS`→`CHW`, `KC`→`KCR`, `SD`→`SDP`, `SF`→`SFG`, `TB`→`TBR`, `WSH`→`WSN`, `ATH`→`OAK`).

The distiller prints a match-rate audit and the top unmatched players by PA lost. **Read it after every rebuild** — a silent drop in match rate means players are quietly getting league-average cards.

## 6. Data bug found and fixed: the Athletics

**`dist/complete-dataset-2025.json` had zero Athletics players.** All 30 teams were present; OAK's roster was empty. The digital sim could not simulate the A's at all, and would have generated no A's cards.

**Root cause.** The Athletics dropped "Oakland" for 2025, and Baseball Reference moved them to `/teams/ATH/` that season — not 2026, as `brSeasonPageSlug()` assumed. `/teams/OAK/2025.shtml` still returns **HTTP 200 with the correct `<title>` of "2025 Athletics Statistics"**, but it is a 416KB stub containing none of the stat tables (`ATH/2025` is 759KB and has all three). The scraper fetched it happily, parsed no tables, found no players, and wrote an empty roster without complaint.

**Fixed:** cutover year corrected to 2025. OAK now returns 61 players; the dataset went from 1,720 to **1,781** players.

**Hardening added to [`updateDataset.ts`](../src/scripts/updateDataset.ts)** so this class of failure cannot recur silently:

- `fetchHtml` retries 4× with exponential backoff (2s/4s/8s) and sends a real User-Agent.
- A page must contain `players_standard_batting`, `players_standard_pitching`, and `players_standard_fielding` or it is treated as a retryable failure — a 200 with the right title is not enough.
- Parsing 0 players from a page that passed the table check is a hard error.
- **A partial-team run now merges into the existing file.** Previously `bun run update-dataset 2025 OAK` would have written a dataset containing *only* OAK, silently destroying the other 29 teams.
- The script refuses to write an empty dataset, reports any team with 0 players, and exits nonzero on failure.

## 7. Remaining work

### Data — must happen before any card is printed

1. ~~**Finish the season fetch and distill.**~~ **DONE.** 182,840 PA cached; profiles built at **100% match on both batters and pitchers** after five `NAME_ALIASES` entries (BR nicknames and middle initials: Kiké/Enrique, Michael A. Taylor, Matthew Boyd, Michael King, Matt Bowman, José A. Ferrer). Re-read the audit after any dataset refresh.
2. ~~**Run the §4 calibration test.**~~ **DONE — passes at 0.91pp.** Re-run it after any prior change.
3. **Re-run Monte Carlo on the repaired dataset.** The 4,000-game validation in the brief's §4 was run *without the Athletics*. Those numbers should be regenerated now that OAK exists — the league-wide rates will shift slightly.
4. **Verify the other 29 teams are complete.** OAK failed loudly only because it was empty; a team that lost *some* players to a partial parse would not have been caught. Cross-check roster sizes and total PA against known 2025 team totals.
5. **Decide on the scraped-HTML history rewrite.** See the note in §5 — the pages are untracked
   going forward but still present in history. Either accept that, or plan a `git filter-repo`
   pass and force-push at a moment when no other machine has outstanding work.
6. **Incremental writes in the fetcher.** `fetchSeason()` currently writes `pa-<year>.csv`
   once, after all ~50 chunks. A crash at chunk 45 loses the entire run. Write per chunk and
   resume from what is already cached.

### Design — before building the card generator

7. **Play three innings on paper.** Nine Cubs batters plus Peralta/Boyd. The test is not accuracy: **can someone who does not know the stats tell Hoerner, Crow-Armstrong, and Peralta apart after three at-bats?** A design that flattens PCA into Hoerner is dead regardless of how well it validates.
8. **Specify the stamina economy.** How large is the pool, what does a shift cost, how does it refill (or not), and how does it map to real pitcher stamina — the brief's "18 batters faced" fatigue threshold is the obvious anchor.
9. **Specify the batter's protect / sit-dead-red choice.** It must be a real trade-off in both directions, not a strictly-better option. Probably: protect trades power for contact on the resolution roll, dead-red the reverse.
10. **Pick the die.** The brief recommends d100 or 2d10 so rare events (3B, HBP) survive. The four-column structure makes this more pressing — a d20 column has only 20 boxes to spend across eight outcomes.
11. **Decide generic vs. matchup-specific cards.** Unchanged from the brief's open question, but note the leverage card makes generic cards more defensible: a generic pitcher leverage card is a much better approximation than a generic outcome card.

### Deferred

12. `src/scripts/printCards.ts` — print-ready HTML. Do not build this until item 7 feels right — item 2 already passes.
13. Park sheets, reliever cards, the module set from the brief's §6.

## 8. Open questions

- Is the pivot right at the 3rd pitch, or should it move to the 4th (more PAs resolve early, columns get thinner but more differentiated)? Cheap to test — re-distill only.
- Should the `early` bucket be a column at all, or should first-pitch contact resolve on the leverage roll itself? It is 26.5% of PA and has a .669 SLG, so it is doing real work either way.
- Does the pitcher's *resolution* profile matter, or is the pitcher fully expressed by leverage? If the latter, pitcher cards get much simpler and generic pitcher cards become nearly lossless.
- How much of a hitter's leverage tendency is a real skill versus noise? Worth a split-half correlation before committing to per-player leverage cards.
