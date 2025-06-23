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

---
For more details, see the JSDoc comments in each source file.

# roll
A no-fillings bun starter project

`bun start` - compile source and watch

`bun test` - run unit tests

`bun document` - generate docs for all comments in valid JSDoc format

`bun run downloadHtml.js CHC 2025`