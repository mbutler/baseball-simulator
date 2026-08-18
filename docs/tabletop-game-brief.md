# Tabletop baseball brief

> **Status note (2026-08-18).** The working design in §6 has been superseded by the
> count-based two-roll design in [`count-game-design.md`](./count-game-design.md), which is
> grounded in real Statcast pitch data. §5 (what not to clone), §8 (constraints and taste),
> and §10 (glossary) are unchanged and still authoritative. Figures in §2 and §4 below were
> computed **before** the Athletics data bug was fixed — see the inline notes.

A handoff for another designer/agent. This repo is a **digital MLB at-bat simulator**. The owner also plays Strat-O-Matic and wants to explore a **dice/tabletop game** that uses this data and model, feels like baseball, feels *new* relative to Strat/APBA, and grows by **optional modules** rather than a thick rulebook.

The likely implementation path is: **this app generates cards** (and maybe park/module sheets) from the same probability engine. Other physicalizations are still in play.

Data is from [Baseball Reference](https://www.baseball-reference.com/). It remains Sports Reference’s property. Non-commercial / educational use only. Not affiliated with or endorsed by Baseball Reference, Sports Reference, MLB, or Strat-O-Matic.

---

## 1. What this repo is

Browser baseball sim (Bun + TypeScript). You pick two teams, a lineup and starter for each, and play at-bats. The engine also runs headless for thousands of games.

**Playable app:** `bun start`, then open `dist/index.html`.  
**Dataset the app loads:** `dist/complete-dataset-2025.json` (currently **full 2025 MLB season**, fetched 2026-08-18).  
**Backup of the previous in-season 2026 scrape:** `dist/complete-dataset-2026.json` (tiny samples; April 2, 2026).

### Core code

| Piece | Path | Role |
|---|---|---|
| Probability model | `src/core/probabilityModel.ts` | Batter + pitcher → 8 outcome probabilities |
| Matchups | `src/core/matchupPreparer.ts` | Lineup vs *opposing* pitcher |
| Game engine | `src/core/gameEngine.ts` | One PA: sample outcome, bases, outs, defense, steals |
| Roster | `src/core/rosterBuilder.ts` | 9 batters + 1 pitcher from IDs |
| Dataset fetch | `src/scripts/updateDataset.ts` | Scrape BR team pages → JSON |
| Loader | `src/utils/dataLoader.ts` | Read `complete-dataset-2025.json` |
| Out flavor | `src/utils/describeOutcome.ts` | Out → GB/FB/LD/POP + fielder |
| Monte Carlo | `src/scripts/monteCarloValidate.ts` | League-rate validation |
| Types | `src/types/baseball.ts` | Normalized batter / pitcher |

```sh
bun run update-dataset 2025          # refresh full-season file (overwrites 2025 JSON)
bun run monte-carlo 2500 CHC-2025 MIL-2025
bun run monte-carlo-league           # 10 matchups × 400 games
```

The digital sim is considered **good enough** for run environment and event rates on 2025 data. Remaining bias is mostly **starters throwing complete games** (fatigue raises 1B/BB). Errors in the engine are **reached-on-error**, ~0.24/team/game, which matches ROE, not official E/G (~0.54).

---

## 2. Data we have

One JSON blob of **30 teams**, **1,781 players** for 2025.

> Was ~1,720 until 2026-08-18, when the Athletics were found missing entirely from the
> dataset (empty roster, no error). Fixed — see §6 of the count-game design doc.

Each team: `team`, `year`, `players[]`. A player may have batting, pitching, and/or fielding.

### Batting (per player)

- `PA`
- Counts: `H`, `HR`, `BB`, `SO`, `SF`, `HBP`, `singles`, `doubles`, `triples`, `sb`, `cs`
- Rates: `kRate` (SO/PA), `bbRate`, `hrRate`, `BABIP`
- Baserunning: `runsBaserunning` (from BR value batting when present), `speed` (0–100, mapped from baserunning runs, 50 = average)

### Pitching

- `TBF` (batters faced), `IP`
- Counts: `H`, `HR`, `BB`, `SO`, `HBP`
- Rates: `kRate` (SO/TBF), `bbRate`, `hrRate`, `BABIP` allowed

### Fielding

- `position` (often a BR code like `6`, `4/6`, `/2D` — converted in-engine to SS/2B/C)
- `G`, `Inn`, `PO`, `A`, `E`, `DP`, `FP`, `RF`, `TZ`
- Catcher: `sbAllowed`, `cs`, `csPct`, `pickoffs`, `armStrength`

**Lineup heuristic used in validation (not a real depth chart):** top 9 batters by PA; starter = pitcher with the most TBF among those with ≥ 50 IP.

Cards should probably use the same idea, or let the user pick a lineup in the existing UI and export that.

---

## 3. Definitions (the model)

### At-bat outcomes

Every PA samples **exactly one** of:

`K`, `BB`, `HBP`, `HR`, `1B`, `2B`, `3B`, `Out`

`Out` is later flavored as Groundout / Flyout / Lineout / Popout to a position (weights in `describeOutcome.ts`: GB 48%, FB 32%, LD 12%, POP 8%).

**Important split in the math (and the proposed dice game):**

- **Non-contact / “pitcher can end it”:** K, BB, HBP, and (in the *code*) HR  
- **Ball in play (BIP):** 1B, 2B, 3B, Out  
- HR is grouped with K/BB in the **code** because it is excluded from BABIP. At the **table**, HR should live on the batter’s contact roll (see §6). Do not print HR as a pitcher “success.”

### Log5

How a batter rate and a pitcher rate become one matchup probability, using a league average as the anchor (Bill James):

\[
P = \frac{(P_b P_p / P_L)}{(P_b P_p / P_L) + ((1-P_b)(1-P_p)/(1-P_L))}
\]

- If both are league average, P ≈ league average.  
- Elite K pitcher vs high-K hitter → very high K%.  
- Used independently for **K, BB, HBP, HR, and BABIP**.

League anchors in code: K 22%, BB 8%, HR 3%, HBP 1%, BABIP .290.

### BABIP

Batting average on balls in play: hits that are not homers, divided by balls in play (roughly AB − K − HR + SF). The model: after K/BB/HBP/HR, leftover PA is BIP; `BABIP × BIP` becomes 1B/2B/3B (mix from the batter’s single/double/triple shares); the rest is `Out`.

### Empirical-Bayes shrinkage (`regressRate`)

Tiny samples (0 HR in 20 PA, 0 HBP, 10% K in 10 IP) are pulled toward league:

`(observed × n + league × prior) / (n + prior)`

Priors: ~100 PA / 100 TBF / 80 BIP / 30 extra-base hits / 80 fielding chances. Full-season 600 PA barely moves.

### Reach cap

Combined BB+HBP+HR+1B+2B+3B is capped at **38%** of PA so OBP cannot explode. Strikeouts are outs and are **not** scaled down.

### Situational (digital only; natural tabletop modules)

- **RISP** (runner on 2B or 3B): +10 points BABIP; 10% of doubles shifted from singles (hits constant).  
- **Late and close** (8th+ and within 2 runs): BB × 1.10, K × 1.05.  
- **Two outs:** −10 points BABIP.

### Fatigue (digital; complete-game substitute)

After **18 batters faced**, each extra batter: +0.5% BB and 1B, −Out, max 5%. This is why Monte Carlo BABIP/BB run a bit high. A tabletop “Tired” module can copy “third time through → pitcher is worse.”

### Other engine chrome (modules, not basic)

GDP (grounder + force, ~25%+ by range), rare triple play, ROE, sac fly (fly + runner on 3B < 2 out), passed ball on K/BB, steals and pickoffs (UI-initiated in the digital game, not automatic in batch sims).

---

## 4. How well the digital sim matches MLB

On **2025 full-season data**, 10 matchups × 400 games (**4,000 games**):

> ⚠️ These were run on the dataset **without the Athletics**. Regenerate now that OAK exists.

| Rate | Sim | 2025 MLB |
|---|---|---|
| Runs / team / game | 4.71 | 4.45 |
| K% | 23.1% | 22.2% |
| BB% | 9.6% | 8.4% |
| HR/PA | 2.9% | 3.1% |
| BABIP | .320 | .291 |
| Extra-inning games | 8.5% | ~8.5% |
| ROE / team / game | 0.24 | ~0.25 ROE (not 0.54 E/G) |

**Calibration:** mean \|simulated K% − model K%\| ≈ **0.8 pp**. The engine samples the table it was given. \|sim K% − season K%\| is larger (~3.6 pp) because season stats are vs all pitchers, not this starter.

**Earlier April 2026 file** made K% look broken (14–20%) because of tiny samples and a bug where batters faced *their own* starter. Both are fixed. Do not generate cards from the 2026 backup unless you re-shrink and understand the noise.

Matchups spread like real teams (e.g. DET @ TEX ~3.4 R/G and 29% K; ARI @ SDP ~5.7 R/G).

---

## 5. What already exists in dice baseball (so we don’t clone it)

**Strat-O-Matic (owner plays this):** batter card + pitcher card; a d20 split is often ~50/50 whose card you read. 2–12 columns. Basic vs Super Advanced = more rules on the **same cards** (icons you ignore until you want them). That last idea we want to steal.

**APBA, Extra Innings, Statis Pro, etc.:** one roll (or 2d6) into a big lookup; pitcher grade as a chart shift.

**We should not do:** 2d6 as the main resolver (bell curve turns everyone into a 7), or a coin-flip “whose card?” — log5 already says pitcher and batter do not always matter equally.

---

## 6. Ideas we’ve liked (working design — SUPERSEDED)

> **Superseded by [`count-game-design.md`](./count-game-design.md).** The two-roll face-off
> below was the right instinct but structurally too close to Strat, and neither player made a
> decision. The replacement keeps the simultaneous roll and the cup, but roll 1 now resolves
> the **count**, not the outcome. The module ideas in this section survive intact and get
> better — read them, then read the new doc. Retained here for the reasoning and the
> Hoerner/Peralta worked example.

### Core loop — two questions, two dice, face-off

Baseball (and this codebase) asks:

1. Does the pitcher **end it without contact**?  
2. If not, what does the hitter do with the ball?

**Basic rules (one paragraph):**  
Both players roll at once (d20 or 2d10). Pitcher reads **Pitch card**: strikeout, walk, (optional HBP), or “in play.” Batter’s die is ignored unless the result is in play. Then read **Contact card**: out, 1B, 2B, 3B, HR.

Optional theater: batter rolls **under a cup**; lift only on in play. A punchout means you never see the swing. That is the duel.

**Do not put HR on the pitch card.** In code HR is non-BIP; at the table a homer is the batter winning. Pitcher “producing” = K / BB / maybe plunk.

### Why this is a fresh take

Strat: one roll, 50/50 whose card.  
This: **you only meet the hitter if the pitcher fails to finish the PA.** Peralta “wastes” a lot of great contact rolls. A junkballer almost never does. Matchup is visible without log5 at the table.

### Math → two cards

From `getAtBatProbabilities(batter, pitcher)` (or vs a league-average pitcher for generic cards):

- **Pitch card:** fold `K`, `BB`, `HBP` vs everything else as In Play.  
  `P(in play) = 1 − K − BB − HBP` (HR moved onto contact).  
- **Contact card:** redistribute `HR + 1B + 2B + 3B + Out` so they sum to 1 **conditional on in play**.

Example (2025, Nico Hoerner vs Freddy Peralta, full PA percentages from the engine, HR still in the raw table):

| | K | BB | HBP | HR | 1B | 2B | 3B | Out |
|---|---|---|---|---|---|---|---|---|
| % of PA | 12.3 | 7.1 | 1.3 | 1.3 | 16.7 | 3.6 | 0.6 | 57.1 |

Tabletop mapping: Peralta pitch card is mostly in-play with a real K/BB chunk; Hoerner contact card is singles-heavy. PCA vs the same pitcher: much more K on the pitch roll, more extra bases on contact.

**d20 vs d100:** d20 drops rare events (3B, HBP, some HR). 2d10 / d100 keeps them. Recommendation: **generate at d100 (or 20 boxes with some boxes meaning “roll d6 for rare”)** so one card set supports basic (ignore rares) and advanced.

### Strat’s idea to steal: icons on the basic card

Print GB / FB / SPEED / ARM / TIRED on day one. Basic game ignores them. Complexity = **module cards on the table**, one sentence each, not chapters:

- **Defense:** GB + runner on 1st → GDP check.  
- **Clutch:** RISP → one Out on contact becomes 1B (mirrors digital RISP).  
- **Legs:** SPEED on a single → extra base attempt.  
- **Tired:** third time through → pitcher loses an in-play box / gains a K or BB (mirrors fatigue).  
- **Park:** extra HR box at Coors, extra Out in a pitcher park.  
- **Same number:** both dice match → jammed GDP or squared-up extra base (optional spice).

Same physical cards; you add inventory, not a new edition.

### Card generation (most likely build)

A script (or UI button) that:

1. Loads `complete-dataset-2025.json` (or the lineup already in `gameStore`).  
2. For each batter: `getAtBatProbabilities(batter, leaguePitcher)` **or** vs a named starter.  
3. Splits into Pitch vs Contact ranges.  
4. Emits print-ready cards (HTML/PDF/SVG) plus GB/FB/speed icons from existing stats.

**Two product flavors:**

- **Generic cards:** one batter contact card + one pitcher pitch card, used vs anyone. Fast, slightly less matchup-true (like Strat).  
- **Series cards:** precompute each lineup vs *today’s* starter (true log5). More accurate, more paper, or a one-sheet “today’s overlays.”

The existing browser app is a natural place to pick lineups, then “Print cards.”

---

## 7. Other ideas (not the mainline, still useful)

- **Transparent overlays:** shared 10×10 grid; batter sheet + pitcher sheet; roll 2d10 as coordinates. Tactile, fiddly to print.  
- **Pitcher “covers” boxes** on a shared 1–20 strip (Peralta covers 1–6 as K). Face-up information war.  
- **Count module:** extra rolls for balls/strikes — different game; keep off the basic loop.  
- **Use the digital app as the “advanced engine”** and the cards as a travel/basic set of the *same* season. One data pipeline, two surfaces.  
- **Solo:** one player rolls both dice; cup still works.  
- **Do not chase official error rate** by turning more outs into singles; that would inflate scoring. Extra-base errors on hits are a separate module if desired.

---

## 8. Constraints and taste

- Owner wants it to **feel like baseball**, not a combat engine or a 2d6 cartoon.  
- **Modular complexity**, Strat-style, without Strat’s rulebook weight.  
- **New** relative to Strat/APBA: simultaneous face-off + pitcher-then-contact, not 50/50 card split.  
- Accuracy can be worse than the computer; personality (Hoerner vs PCA vs Peralta) must survive flattening.  
- Prefer generating from **2025 full season**, not the 2026 stub.  
- No bullpen in the digital sim yet; tabletop can still have a “reliever card” as a module (swap pitch card).

---

## 9. Suggested next experiments (for the receiving agent — SEE NEW DOC)

> Items 1 and 3 below are reframed by the count design; the current task list lives in
> §7 of [`count-game-design.md`](./count-game-design.md). Items 2, 4, and 5 still apply as written.

1. Specify exact d20 or 2d10 mappings for Pitch and Contact from `getAtBatProbabilities`, with HR on Contact only.  
2. Prototype 9 Cubs batters + Peralta/Boyd pitch cards; play three innings on paper.  
3. If that feels right, add a `src/scripts/printCards.ts` (or UI export) — HTML print stylesheet is enough.  
4. Design 4–5 module cards that only reference icons already on the player cards.  
5. Optional: park sheet from team scoring environment; tired overlay after 18 BF.

Open design questions: d20 vs 2d10; generic vs matchup-specific cards; whether HBP is its own box or folded into BB; how much GB/FB to print on a contact card vs a second “out type” die.

---

## 10. Tiny glossary

| Term | Meaning here |
|---|---|
| PA | Plate appearance |
| TBF | Total batters faced (pitcher) |
| BIP | Ball in play (not K/BB/HBP/HR in the *code*) |
| ROE | Reached on error (engine treats like a single, still an AB) |
| GDP | Grounded into double play |
| RISP | Runner in scoring position (2B or 3B) |
| Log5 | James matchup formula, §3 |
| Shrinkage | Regress small samples toward league |
| Pitch card | Tabletop: K / BB / in play |
| Contact card | Tabletop: Out / 1B / 2B / 3B / HR |

---

*Written from the baseball-simulator project after 2025-data Monte Carlo and a tabletop brainstorm (two-roll face-off, cup, modules as cards). Digital sim: `README.md` and JSDoc in the files listed above.*
