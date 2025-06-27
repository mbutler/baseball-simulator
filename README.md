# Baseball Simulator

### 📊 Data Attribution

This project uses data from [Baseball Reference](https://www.baseball-reference.com/). All data remains the property of Sports Reference LLC. This project is non-commercial and uses the data under fair use for educational and simulation purposes. Please visit their site for the most up-to-date and official statistics.

*This project is not affiliated with or endorsed by Baseball Reference or Sports Reference LLC.*


### Main Flow
1. **Parsing**: Raw HTML from Baseball Reference team pages is parsed to extract batting and pitching tables (`parseTables.js`, `statParser.js`).
2. **Normalization**: Player stats are normalized into a consistent format for simulation (`statNormalizer.js`).
3. **Roster Building**: A team roster is built from selected player IDs and normalized stats (`rosterBuilder.js`).
4. **Matchup Preparation**: Each batter is paired with the opposing pitcher, and outcome probabilities are computed (`matchupPreparer.js`, `probabilityModel.js`).
5. **Simulation**: The game engine simulates each at-bat, updating the game state and score (`gameEngine.js`).

### Type Safety
- All modules use JSDoc for type annotations and documentation.
- Type checking is enabled via `jsconfig.json` with `checkJs: true`.
- You get autocompletion and static analysis in editors like VS Code.

### Testing
- Tests are in the `test/` directory and cover all core logic and edge cases.
- To run all tests:
  ```sh
  bun test
  ```
- To check type safety (if TypeScript is installed):
  ```sh
  npx tsc --noEmit
  ```

### Extending or Debugging
- Add new stat sources or simulation logic by following the modular structure.
- All functions and types are documented with JSDoc for easy navigation.

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

# roll
A no-fillings bun starter project

`bun start` - compile source and watch

`bun test` - run unit tests

`bun document` - generate docs for all comments in valid JSDoc format

`bun run downloadHtml.js CHC 2025`