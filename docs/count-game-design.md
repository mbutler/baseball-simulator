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

Two rolls and two decisions, in strict sequence. Every plate appearance:

1. **Pitcher rolls LEVERAGE** — one d100 on the batter's leverage strip, which resolves *which
   count bucket the PA reaches*: early contact / 2-0 / 1-1 / 0-2. **No strikeout, no walk, no
   hit.** Just: who won the first two pitches.
2. **Pitcher decides** whether to spend stamina to shift the bucket one rung in his favour —
   bear down now, pay for it in the seventh. There is no pool of tokens: spending advances his
   own fatigue track, so the price is batters off his outing (§7.8).
3. **Batter declares** *protect* (shrink the strikeout, shrink the power) or *sit dead-red*
   (the reverse), knowing the bucket he is about to hit in.
4. **Batter rolls RESOLUTION** — one d100 on that bucket's column of his contact card.
   Strikeouts and walks live *here*, emerging from the count rather than being printed as flat
   season rates.

**Nothing tracks balls and strikes.** One roll lands in one box and the PA resolves from there.
`2-0 / 1-1 / 0-2` are only the §2 pivot's description of how each bucket was cut from the data.

**The printed labels are `AHEAD` / `EVEN` / `BEHIND`, not the counts.** Two reasons, and the
first is the one that will come up at the table:

- **Printing "1-1" claims the PA *is* at 1-1.** It is not — it *passed through* 1-1 on the third
  pitch and will travel on from there. The first question anyone asks a card labelled with
  counts is "where is the full count?", and the answer is that 3-2 is not a bucket and cannot
  be one: a PA passes through many counts, so bucketing on any later count double-counts and
  destroys the clean partition §2 depends on. **3-2 lives inside the columns** — a PA that goes
  2-0 → 3-1 → 3-2 → walk is already sitting in the AHEAD column's BB boxes, which is most of
  why that column walks 29% of the time. The full count is in the game; it is resolved rather
  than displayed.
- **The pivot is still open** (§8). Moving it to the 4th pitch changes which counts are even
  reachable, so counts printed on physical cards would be wrong the day the profiles are
  re-distilled. `AHEAD / EVEN / BEHIND` names the leverage state itself and survives a re-cut.

**Early contact is not on the ladder.** It is the ball already put in play inside two pitches,
so a shift cannot move a PA into or out of it. It still takes a resolution roll — it is the
hitter's best bucket at .543 SLG — but it can produce neither a K nor a BB, which is why that
column reads 0% for both.

### Why sequential, and why the cup is retired

The face-off in §1 rolled both dice at once, and the cup existed to solve a problem it created:
the batter's die was ignored ~30% of the time, so hiding it bought drama that the structure
otherwise wasted. This design has no such waste, and three things now argue against
simultaneity:

- **The math only ever wanted one leverage roll.** §4 combines the batter's and pitcher's
  bucket distributions with log5 into a *single* distribution. Two dice would be re-deriving by
  hand what the card already prints.
- **The chain is strictly ordered anyway.** The pitcher cannot price a shift before seeing the
  bucket, and the batter cannot choose an approach before seeing the spend. There is nothing
  left over to resolve simultaneously.
- **Each seat gets its own moment** — pitcher acts, batter answers — instead of both players
  rolling into a shared shrug.

The tension the cup used to supply now comes from step 2 into step 3: shifting a hitter from
1-1 to 0-2 does not merely worsen his column, it **takes his decision away**, because dead-red
against a 0-2 column is indefensible. The pitcher is spending stamina to strip the batter of
agency, and the batter watches him do it.

### What this changes

The pitcher's card **stops being an outcome card entirely**, and the pitching seat becomes an
active resource game across nine innings rather than a lookup chart someone reads on the
hitter's behalf. That part survives.

> ⚠️ **This section used to claim that "a pitcher's identity becomes *how often do I get you to
> 0-2*." That claim is false, and a playtest caught it before the measurement did — the pitcher
> did not feel unique.** Leverage carries roughly a tenth of a pitcher; resolution carries the
> rest. See **§9**, which supersedes this paragraph and settles the card architecture.

### Where the modules still fit

Everything in §6 of the brief about Strat's icon trick survives intact, and gets better: modules can now key off the *count column* as well as the icons. `TIRED` becomes "shift one leverage box toward the hitter," which is exactly what the digital engine's fatigue rule does. `CLUTCH` can bias the leverage roll instead of the outcome roll, which is closer to how RISP actually works.

### Fractal detail — layers on one roll

Strat gets very fine-grained if you want it, and that "dig in only when you care" quality is
worth stealing. The rule that makes it cheap here:

> **A layer reads more of the roll that already happened. It costs nothing when unused.**

`Out` is always the *last* band in every column, so nested sub-bands would have to be printed
per column (54-100 in one, 61-100 in another). The **ones digit** of the same d100 avoids that
entirely — it is near-uniform whichever band you landed in, so a single line serves all seven
columns:

```
OUTS — ones digit of your roll:   0-4 GB · 5-7 FB · 8 LD · 9 POP
```

Roll 73 → Out → ends in 3 → groundout. No second die, no cross-reference, and a basic player
never looks at the line. That maps 50/30/10/10 against the engine's 48/32/12/8. (The digits are
not *perfectly* uniform — in a 47-box band some appear 5 times and others 4, a ±11% wobble, and
exactly zero when the band length is a multiple of 10. Acceptable for out type; do not price
anything else on it.)

**Where free ends.** The fielder cannot come from the same roll: the tens digit is not
independent, since it is what put the roll in the Out band to begin with. That is the honest
place to draw the advanced-game line.

| Layer | Reads | Cost |
|---|---|---|
| Out | the band | basic |
| Groundout | ones digit of the same roll | **free** |
| 6-3 | a d6 | a die |

The same trick answers the `early` question in §8: if early contact resolves on the leverage
strip itself, the 1-28 range prints `HR / 1B / 2B / Out` directly and 27% of PAs become a
genuine one-roll affair.

**A layer must unlock a module, not add a name.** A line that only says "groundout" instead of
"out" is ink. But GB is the trigger for the brief's Defense module (*GB + runner on 1st → GDP
check*) and FB is the trigger for the sac fly the engine already models — so out type makes two
modules printable that currently are not. That is what earns the line.

**Blocked on data, and it is a re-fetch not a re-distill.** [`describeOutcome.ts`](../src/utils/describeOutcome.ts)
takes only the outcome string — no player — so every hitter in the game grounds out 48% of the
time. Printed as-is, all nine Cubs get an identical out-type line, which fails the §8 bar that
personality must survive flattening. The PA cache holds `batter,pitcher,batTeam,fldTeam,path,outcome`
and the fetcher requests seven Savant columns, none of them `bb_type`; Baseball Reference's
`rawBatting` has no GB/FB either, only `b_gidp`, which is confounded by how often men were on
first. See §7 item 6. **Do this after the paper playtest, not before** — a season re-pull is not
worth spending on a layer that might get cut.

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

⚠️ **The same hazard recurred outside the pipeline on 2026-08-21.** `printCards.ts` built its
raw-stat lookups keyed by `player_id` alone, so for the **120 pitcher ids that appear on more
than one team in 2025** it silently kept whichever stint was iterated last. Rico García's Mets
line printed his one-game Yankees stint: ENDURANCE 12 instead of 7, ERA 10.13 instead of 2.13.
Nothing errored. Any new code touching the dataset must key on `(player_id, team)` — the
dataset splits a traded player's season by stint, and an id is not a player. All 731 rendered
pitcher rows are now audited against the dataset on every full-league build.

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
6. ~~**Incremental writes in the fetcher — and add `bb_type` in the same pass.**~~ **DONE.**
   The fetcher writes per chunk against a `.progress` marker and resumes from it, and discards a
   cache whose header predates a schema change rather than mixing schemas. `bb_type` is carried
   as a 7th field. The refetch returned **182,840 PA — the same count as before** — and the
   rebuilt profiles reproduce the §2 bucket table and the 0.91pp calibration exactly, which is
   the regression check that the added column changed nothing else. **99.3% of outs carry a
   batted-ball class.**

   **What it bought, and what it did not.** League out-type shares come out **47.0% GB / 29.4% FB
   / 13.2% LD / 10.4% POP**, against the 48/32/12/8 that `describeOutcome.ts` had been guessing —
   the original estimate was good. But **out type barely separates hitters**: across 113 batters
   with 250+ tallied outs, the grounder allocation is 4 or 5 boxes of 10 for **94% of them**, with
   one hitter at 3 and six at 6. Michael Harris II and Yandy Díaz sit at the top, Cal Raleigh at
   the bottom, and everyone else prints one of two lines. Out type earns its place by *unlocking
   the fielding module* (§10), not by adding personality — the same shape as ENDURANCE in §7.8:
   genuinely derived, effectively coarse, because the sport is.

7. **Play three innings on paper.** (The economy no longer needs the table's help — see
   item 8's validation. What is left for paper is whether the decision is *interesting*, not
   whether it is *balanced*.) Nine Cubs batters plus Peralta/Boyd. The test is not accuracy: **can someone who does not know the stats tell Hoerner, Crow-Armstrong, and Peralta apart after three at-bats?** A design that flattens PCA into Hoerner is dead regardless of how well it validates.
8. ~~**Specify the stamina economy.**~~ **SPEC BELOW — needs playtest tuning, not more design.**

   **There is no pool and no tokens. There is one counter.** Every pitcher card prints an
   **ENDURANCE** number. A fatigue track advances **+1 for every batter faced** and **+1 more
   for every stamina point spent**. When the track passes ENDURANCE the pitcher is **TIRED**:
   every subsequent leverage roll shifts one rung toward the hitter, permanently. Spending is
   therefore not a separate resource at all — it is *burning batters off your own outing*, and
   the decision reads as **how many batters am I willing to give up to win this one?**

   Shift costs are priced off the §2 value of each rung:

   | Shift | Worth | Cost |
   |---|---|---|
   | AHEAD → EVEN | 175 points of OBP | **2** |
   | EVEN → BEHIND | 103 points of OBP | **1** |
   | Both, one PA | | 3 |

   **ENDURANCE is derived, and the derivation is `round(0.779 × BF/GS)`** — batters faced per
   start, from `p_bfp / p_gs` in the raw pitching table, scaled so the median starter lands on
   the digital sim's 18-BF fade point. But the honest finding is that **real 2025 usage barely
   varies**: across 105 qualified starters (GS ≥ 20, ≥90% of appearances as starts) BF/start
   runs 18.9 to 25.9 with an interquartile range of just 22.4–23.8. Modern bullpen management
   pulls everyone at roughly the same point regardless of quality, so the derived spread is
   only six integers wide and **88% of starters land on 17, 18, or 19**:

   | ENDURANCE | 15 | 16 | 17 | 18 | 19 | 20 |
   |---|---|---|---|---|---|---|
   | starters | 3 | 3 | 24 | 47 | 22 | 6 |

   Valdez, Crochet and Webb print 20; Peralta 17; Kershaw 16; Rasmussen 15. So the number is
   genuinely per-pitcher rather than tiered, but it is *effectively* coarse because reality is
   coarse — do not go looking for a cleverer formula, and do not print tiers either, since the
   tails are exactly where the interesting pitchers live.

   Sizing check: a start is ~25 batters. At ENDURANCE 18 with no spending a pitcher is tired
   for the last ~7; spend 6 early and he is tired for the last ~13. Nothing refills. The budget
   is the start, which is what a pitch count already is.

   **A TIRED pitcher may not spend.** This rule is load-bearing, and it was found by simulation
   rather than by design. TIRED is capped at one rung however far past ENDURANCE the track runs,
   so without this rule the *marginal* cost of the 40th point is zero — once gassed, a pitcher
   spends freely and blanket spending becomes correct. [`shiftPolicySim.ts`](../src/scripts/shiftPolicySim.ts)
   measured the hole at **2.50 runs per game** on a complete game: spend-on-everything allowed
   2.80 against 5.29 for never spending. Capping it is also the thematically right answer — a
   gassed pitcher has nothing left to bear down *with* — and it needs no new numbers, because it
   caps lifetime spending near ENDURANCE on its own.

   **Validation — PASS.** `bun run shift-policy 40000` plays whole games under six spending
   policies, with the home pitcher on the policy under test and the away pitcher held at
   `never` as a control. The bar is not "spending wins": a fairly priced resource is
   **break-even in blanket use**, and only *judgement* profits.

   | Regime | blanket spend vs never | best selective (`risp+late`) | verdict |
   |---|---|---|---|
   | Complete game | −0.022 runs | **−0.169 runs** | fair, rewards judgement |
   | Hooked at ENDURANCE+6 | +0.063 runs | **−0.120 runs** | fair, rewards judgement |

   Blanket spending lands inside ±0.07 runs of not spending at all in both regimes — break-even
   — while spending only with runners in scoring position or late saves a consistent 0.12–0.17.
   **Costs of 2 and 1 are correctly priced.** Two regimes are run because the bullpen assumption
   otherwise carries the result: with a free, never-tiring, infinitely deep pen, burning a
   starter costs nothing and every price looks too cheap. Neither regime is the truth; the price
   holding in both is what makes it trustworthy.

   Note the effect-size floor. At 40,000 games a 0.05-run difference is *statistically*
   significant and completely meaningless at a table, so the script judges break-even against a
   ±0.15 run band (~3% of the run environment) rather than against its own standard errors.

9. ~~**Specify the batter's protect / sit-dead-red choice.**~~ **SPEC BELOW — needs playtest
   tuning, not more design.**

   **The choice exists only on AHEAD / EVEN / BEHIND.** On early contact the ball is already in
   play, so a leverage roll into `early` skips steps 2 and 3 of §3 entirely and resolves in a
   single roll — **27% of plate appearances carry no decisions at all**, which is what keeps
   the loop from becoming a decision every six seconds.

   There is no neutral third option. A neutral would be taken by default and the mechanic would
   die.

   Each approach fixes three "flavour" rates and then **solves the power scale λ** — applied to
   HR / 3B / 2B — so the column's wOBA exactly matches the neutral column's, with Out absorbing
   the mass balance:

   | | K | BB | 1B | power |
   |---|---|---|---|---|
   | **PROTECT** | ×0.80 | — | ×1.08 | λ solved, ≈0.91–0.97 |
   | **DEAD-RED** | ×1.20 | ×0.88 | ×0.85 | λ solved, ≈1.10–1.22 |

   Dead-red walks less because a hitter hunting a fastball swings at more of them.

   **Solve λ, not the 1B/Out split.** The first version of this fixed the power multipliers and
   solved the split instead. It drained Crow-Armstrong's singles to *zero* on EVEN — a dead-red
   swing that can never produce a single — and still missed neutrality by 27 points of wOBA in
   the modal bucket. Capping the drain only traded one failure for the other. Solving λ reaches
   Δ0.000 on all six columns with every outcome staying positive.

   **wOBA neutrality is the generation constraint, and it is the whole point.** The pitcher's
   shift is *allowed* to be plainly good because scarcity prices it. The batter's choice is
   free, so if either option were better in a vacuum it would not be a decision — it would be
   the correct answer printed on a card. Neutrality forces the **situation** to break the tie:
   protect with a runner on 3rd and fewer than 2 out, or on 2nd with 2 out, or down 1 late —
   anywhere a ball in play is worth more than a big one. Dead-red with the bases empty or down
   2+ late, where a single is nearly worthless.

   **The tie is broken by the one thing wOBA cannot see.** K and Out are both worth zero, so the
   solver trades them freely — and it trades a *lot* of them. On BEHIND, Crow-Armstrong's
   dead-red column converts 20 outs into strikeouts to buy one extra double. In a vacuum that is
   neutral. At the table it is nothing of the kind: a ball in play scores the runner from third,
   advances the runner from second, and can be booted. **That gap is the decision**, and it is
   why dead-red on 0-2 is indefensible while the same choice on 2-0 is close. The mechanic
   reproduces the baseball instinct instead of asking the player to supply it.

   **Card cost: 7 columns per batter** — 1 early + (3 buckets × 2 approaches). Print all 7 for
   the paper playtest rather than inventing a compression rule that has not been tested.
10. ~~**Pick the die.**~~ **DONE — d100.** Two d10 read as tens/ones. The four-column structure
    settled it: a d20 column has only 20 boxes to spend across eight outcomes, so 3B and HBP
    round away entirely and every column starts looking alike. At d100 a box is one percentage
    point, which means card generation is a direct read of the probability table — no rounding
    policy, no "roll d6 for rare events" escape hatch. Both the leverage strip and each
    resolution column are 100 boxes.

    **Triples still do not survive, and should not be printed.** League 3B rate per bucket runs
    0.23%–0.47%, so it rounds to **zero boxes out of 100 in every bucket** — d100 is not fine
    enough, and d1000 is not a die anyone rolls. Triples should come from the brief's **LEGS**
    module instead (SPEED converts a hit into an extra base), which is where a triple actually
    comes from in baseball: a fast man on a ball in the gap, not a distinct batted-ball class.
    Same for the rarest HBP columns. This is an argument *for* the module structure, not a
    defect in it.
11. ~~**Decide generic vs. matchup-specific cards.**~~ **DECIDED — split by channel.** The
    hunch that "a generic pitcher leverage card is a much better approximation than a generic
    outcome card" was exactly right, and §9 measures how right: leverage decomposes into a
    generic strip plus a single additive grade at 0.0037 wOBA error, while resolution does not
    decompose at all. **Leverage generic, resolution matchup-specific.** The consequence is that
    this is a *series-set* game, not a season-set game — see §9.

### Deferred

12. ~~`src/scripts/printCards.ts` — print-ready HTML.~~ **DONE**, built early because item 7
    needs cards to play with. `bun run print-cards [BATTING-TEAM] [PITCHING-TEAM]` emits a
    d100 leverage strip and seven resolution rows per batter, plus the opposing starter's card
    and a rules sheet, to `dist/cards-<team>-vs-<opp>.html`. Matchup-specific by default
    (true log5 vs the named starter); `--generic` builds against a league-average opponent, so
    the two flavours of §7.11 can be compared on paper rather than argued about.
    **Every row is asserted to tile 1–100 exactly** — a printed card with a gap at 47 is
    unplayable and silently so, which is the one defect that must never reach a table.
13. Park sheets, reliever cards, the module set from the brief's §6.

## 8. Open questions

- Is the pivot right at the 3rd pitch, or should it move to the 4th (more PAs resolve early, columns get thinner but more differentiated)? Cheap to test — re-distill only.
- Should the `early` bucket be a column at all, or should first-pitch contact resolve on the leverage roll itself? It is **26.8% of PA at a .336 OBP and .543 SLG** — the highest slugging of any bucket — so it is doing real work either way. (Earlier drafts of this line read 26.5% and .669 SLG, carried over from the single-day pilot; the full-season figures are the §2 table's, recomputed from the league tally.) Resolving it inline is a pure speed-vs-granularity trade — see the fractal-detail subsection in §3.
- ~~Does the pitcher's *resolution* profile matter, or is the pitcher fully expressed by leverage?~~ **ANSWERED in §9: resolution is ~90% of a pitcher and leverage ~10%.** Pitcher cards get *harder*, not simpler, and generic pitcher resolution cards are far from lossless.
- How much of a hitter's leverage tendency is a real skill versus noise? Worth a split-half correlation before committing to per-player leverage cards.

---

## 9. Where identity lives — and the architecture it forces

Added after the first paper playtest. The batters felt right; **the pitcher did not feel
unique**, and the table asked two questions the design had no answer for: why is the pitcher's
leverage roll printed on the batter's card, and does every batter need a separate card against
every pitcher?

They are one question, and the answer changes the architecture.

### The measurement

Each player's contribution splits into two channels — **leverage** (how often he wins the first
two pitches) and **resolution** (what happens once the count is set). Holding the opponent at
league average and measuring the spread across 105 qualified starters and 160 qualified batters,
in wOBA:

| | full | leverage only | resolution only |
|---|---|---|---|
| **pitchers** | 2.23pp | **0.48pp** | **2.02pp** |
| batters | 2.27pp | 0.44pp | 2.20pp |

**Resolution carries ~90% of a player. Leverage carries ~10%.** The basic loop handed the
pitcher only the leverage roll, so it handed him a tenth of himself.

The sharpest case: **Paul Skenes reaches BEHIND 21.6% of the time against a league-average
batter. The league rate is 21.3%.** By leverage alone the best pitcher in baseball is
indistinguishable from a replacement arm; his identity is entirely in resolution (.271 wOBA
against Kochanowicz's .351). Skubal at 30.0% is the rare pitcher whose leverage really is his
game — which is why he cannot be the model for all of them.

**The reframe that matters: leverage is a *style* channel, resolution is a *quality* channel.**
That is precisely why the batters felt right and the pitcher did not. Hoerner versus Happ is a
difference of style, and leverage shows it beautifully. Ace versus rookie is a difference of
quality, and leverage cannot see it at all.

### Why the roll was on the batter's card

Because `getCountCards(batter, pitcher)` fuses both sides through log5 into one object. It was
never a batter card — **it is a matchup card**, and labelling it with the batter's name was a
convenience that misled the table. The same fact is the whole of the combinatorics problem: one
card per (batter, pitcher) pair is 9 × N.

### What decomposes, and what refuses to

Four ways of splitting a matchup card back into a batter card plus a pitcher card, each fitted
per pitcher and scored over 2,500 real batter × pitcher pairs:

| Architecture | Cards | Result |
|---|---|---|
| **Leverage — generic strip + one additive grade** | 9 + N | **mean Δ 0.0037 wOBA, max 0.0150** ✅ |
| Resolution — one additive grade | 9 + N | mean Δ 0.0144, max 0.0743 ❌ |
| Resolution — split read (Strat's move) | 9 + N | ordering holds (r = 0.969), **only 55% of spread** ❌ |
| Resolution — four per-bucket grades | 9 + N | full spread, but r falls to 0.792 ❌ |

**Leverage decomposes cleanly; resolution refuses to.** Leverage grades run −7 to +6 boxes and
the approximation sits comfortably inside the project's 2pp bar. Nothing works for resolution:
the split read collapses the matchup range from .233–.450 to .265–.378, turning the best
matchup in baseball into a merely good one — the exact "flattens PCA into Hoerner" failure the
brief calls fatal. The per-bucket grade keeps the range but shuffles which matchup gets which
value, which is worse, not better.

Worth noting because it reverses a premise: the brief's §5 rejected Strat's split read on the
grounds that "log5 already says pitcher and batter do not always matter equally." They matter
**almost exactly equally** — 2.23pp against 2.27pp. The split read is defensible on those
grounds after all; it fails on fidelity instead.

### The architecture

1. **The leverage strip moves onto the pitcher's card**, printed as nine rows, one per lineup
   slot. He rolls on his own card. This is pure relocation — the numbers are identical, the
   log5 fusion is unchanged — but it answers the table's complaint and gives the pitching seat
   something to hold.
2. **The batter's card keeps resolution only**, and stays matchup-specific, because resolution
   is the channel that cannot be factored without losing half the personality.
3. **Therefore this is a series-set game, not a season-set game.** Playing CHC at MIL means
   printing nine Cubs cards against Peralta and nine Brewers cards against Boyd — eighteen
   cards, about five sheets, generated in a second. That is fine for a game night and impossible
   for a 162-game replay. Decide it deliberately rather than discovering it later.

A permanent season set remains available at a known price: the split read, 9 + N cards forever,
ordering intact and magnitude halved. That is the Strat bargain, stated honestly.

---

## 10. Fielding — a decision layer, not a simulation layer

Added after the second playtest, where the batting felt good and the fielding felt absent.

The diagnosis was not missing detail. **The fielding manager had no decision.** The pitcher
chooses whether to spend stamina, the batter chooses protect or dead-red, and the defence chose
nothing — so defence could not feel like anything, however much detail were added.

### The constraint that shapes the mechanic

The ones digit of the resolution roll is **already spent** naming the batted-ball type (§3). It
cannot be re-read for a second question: a double-play check on the same digit would correlate
the two badly enough to make 60% of grounders double plays.

So the special cases get **their own boxes inside the same digit**:

```
OUTS — ones digit:  0 DP · 1-3 GB · 4 THRU · 5-7 FB · 8 LD · 9 POP
```

- **DP** — a grounder that is a double play, with a runner on first and fewer than two out.
- **THRU** — a grounder that gets through **for a single with the infield IN**, and is an
  ordinary out with the infield **BACK**.

**THRU is the mechanic.** The same box means different things depending on what the fielding
manager declared, which makes the declaration a decision rather than a lookup. Both special
boxes degrade to ordinary grounders when their situation is not on the board, so the basic game
never notices them and the page can be added or dropped mid-game.

`INFIELD IN or BACK` is declared with a runner on third and fewer than two out — after the
pitcher's stamina decision, before the batter's approach, because the defence sets up and the
hitter reacts. BACK concedes the run for the out; IN holds the runner but lets THRU through.

The hit case reuses the digit that does nothing on a hit: **0–6 the runner holds, 7–9 he takes
the extra base.**

### Where the line is

**In:** anything readable off the roll already made, plus at most one binary declaration —
double plays, sacrifice flies, the infield-in gamble, runners taking an extra base, errors.

**Out:** rundowns, relays and cutoffs, defensive shifts, per-position fielder ratings consulted
every play. All of them need sequencing or alignment state, and tracking where the shortstop is
standing is a different game.

### The caveat worth stating

Fielding will never carry personality the way hitters do, and that is true of baseball rather
than a defect in the design. A plate appearance is a duel between two named men; a ground ball
is diffuse, and goes to whoever it goes to. Expect a **team-level defensive number** nudging the
DP and advancement thresholds, the way a pitcher's GRADE nudges leverage — not nine fielders
with cards. The real exceptions are catcher arm on steals and a handful of elite gloves, and
both are one printed number.

**Still a prototype.** DP and THRU are one box each; those are the tuning knobs for how often the
infield-in gamble bites, and the numbers to argue with after a few games. Runner speed does not
yet modify the advance band.
