# Baseball Simulator

A browser-based baseball game simulator that uses MLB stats from [Baseball Reference](https://www.baseball-reference.com/). It simulates at-bats, baserunning, steals, pickoffs, and defense.

### 📊 Data Attribution

This project uses data from [Baseball Reference](https://www.baseball-reference.com/). All data remains the property of Sports Reference LLC. This project is non-commercial and uses the data under fair use for educational and simulation purposes. Please visit their site for the most up-to-date and official statistics.

*This project is not affiliated with or endorsed by Baseball Reference or Sports Reference LLC.*

### Quick Start

```sh
bun install
bun start          # Compile and watch
bun test           # Run unit tests
```

Then open `dist/index.html` in a browser to play. The app loads team data from `dist/complete-dataset-2025.json`.

### Updating the Dataset (Current Year)

To refresh teams and rosters with the latest Baseball Reference data:

```sh
# Update all teams for the default year (2025)
bun run update-dataset

# Update for a specific year (e.g. 2026)
bun run update-dataset 2026

# Update only specific teams for a year
bun run src/scripts/updateDataset.ts 2026 CHC MIL
```

**Where the year is set:** The year is configured in `src/scripts/updateDataset.ts` (default `2025`) and passed as the first CLI argument. The output file is `dist/complete-dataset-2025.json`. The data loader in `src/utils/dataLoader.ts` expects this filename—if you fetch a different year, you’ll need to update the loader to use the new file or rename it.

**Data availability:** Baseball Reference typically publishes team pages for a season once games begin. Check `https://www.baseball-reference.com/teams/CHC/2026.shtml` (or your year) to confirm data exists before running the update.

### Main Flow

1. **Parsing**: Raw HTML from Baseball Reference team pages is parsed to extract batting, pitching, and fielding tables (`src/scripts/updateDataset.ts`).
2. **Normalization**: Player stats are normalized into a consistent format for simulation (`updateDataset.ts`).
3. **Roster Building**: A team roster is built from selected player IDs and normalized stats (`src/core/rosterBuilder.ts`).
4. **Matchup Preparation**: Each batter is paired with the opposing pitcher, and outcome probabilities are computed (`src/core/matchupPreparer.ts`, `src/core/probabilityModel.ts`).
5. **Simulation**: The game engine simulates each at-bat, baserunning, steals, and defense (`src/core/gameEngine.ts`).

### Type Safety

- The project uses TypeScript with `tsconfig.json`.
- Run `npx tsc --noEmit` (or `bunx tsc --noEmit`) to check types.

### Testing

Tests are in the `test/` directory and cover core logic, probability model, game engine, and model updates.

```sh
bun test
```

### Extending or Debugging

Add new stat sources or simulation logic by following the modular structure. All functions and types are documented with JSDoc.

### Stats Used in the Probability Model

The simulation uses the following player stats to determine at-bat outcomes, fielding plays, baserunning, and pitcher fatigue:

#### **Batting**
- **PA**: Plate Appearances
- **H**: Hits
- **HR**: Home Runs
- **BB**: Walks
- **SO**: Strikeouts
- **SF**: Sacrifice Flies
- **HBP**: Hit By Pitch
- **singles**: Singles
- **doubles**: Doubles
- **triples**: Triples
- **sb**: Stolen Bases
- **cs**: Caught Stealing
- **kRate**: Strikeout Rate (K/PA)
- **bbRate**: Walk Rate (BB/PA)
- **hrRate**: Home Run Rate (HR/PA)
- **BABIP**: Batting Average on Balls in Play

#### **Pitching**
- **TBF**: Total Batters Faced
- **IP**: Innings Pitched
- **H**: Hits Allowed
- **HR**: Home Runs Allowed
- **BB**: Walks Allowed
- **SO**: Strikeouts
- **HBP**: Hit By Pitch
- **kRate**: Strikeout Rate (K/TBF)
- **bbRate**: Walk Rate (BB/TBF)
- **hrRate**: Home Run Rate (HR/TBF)
- **BABIP**: Batting Average on Balls in Play Allowed

#### **Fielding**
- **position**: Defensive Position
- **G**: Games Played
- **Inn**: Innings Played
- **PO**: Putouts
- **A**: Assists
- **E**: Errors
- **DP**: Double Plays Turned
- **FP**: Fielding Percentage
- **RF**: Range Factor
- **TZ**: Total Zone Runs

#### **Catching**
- **sbAllowed**: Stolen Bases Allowed
- **cs**: Caught Stealing
- **csPct**: Caught Stealing Percentage
- **pickoffs**: Pickoffs
- **armStrength**: Arm Strength
- **PB**: Passed Balls

#### **Baserunning**
- **runsBaserunning**: Baserunning Value
- **speed**: Speed Rating

#### **Fatigue**
- **battersFaced**: Batters faced by current pitcher (used for fatigue effects)

These stats are used in combination to determine:
- At-bat outcome probabilities (K, BB, HR, 1B, 2B, 3B, Out)
- Double/triple play chances (fielding stats)
- Error rates (fielding stats)
- Steal and pickoff success (baserunning, catcher, pitcher stats)
- Passed ball/wild pitch rates (catcher stats)
- Baserunner advancement (speed, baserunning value)
- Pitcher fatigue effects (batters faced)

---
For more details, see the JSDoc comments in each source file.

### Commands

| Command | Description |
|---------|-------------|
| `bun start` | Compile source and watch |
| `bun test` | Run unit tests |
| `bun run update-dataset` | Update team/roster data from Baseball Reference |
| `bun run docs` | Generate docs from JSDoc comments |