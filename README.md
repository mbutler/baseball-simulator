# Baseball Simulator

## How this Codebase Works

This project simulates baseball games using real or mock team stats from Baseball Reference. The codebase is modular and type-safe (via JSDoc), and is fully covered by robust tests.

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