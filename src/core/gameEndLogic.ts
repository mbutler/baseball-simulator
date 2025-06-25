// Pure helpers for game end logic (no DOM/browser dependencies)

/**
 * GameEndContext is no longer necessary for core logic, 
 * but you may retain it for UI/display purposes.
 */
export interface GameEndContext {
  justEndedTopHalf?: boolean
  justEndedBottomHalf?: boolean
}

/**
 * Represents the minimal state needed to determine if a game should end.
 */
export interface GameStateLike {
  inning: number           // 1-based inning number (starts at 1)
  top: boolean             // true if top half of inning, false if bottom half
  score: [number, number]  // [Away, Home]
  outs: number             // 0 to 3
  isHalfInningOver: boolean  // used to determine transition boundaries
  runsScoredThisHalf: number // used to determine walk-off wins
}

/**
 * Evaluates whether the game should end due to a walk-off condition.
 * This only applies in the bottom of the 9th inning or later.
 * Returns true if game ended immediately due to walk-off.
 */
export function checkWalkoff(
  gameState: GameStateLike,
  endGameFn: (winner: 'Home', score: number[], inning: number, lastWasTop: boolean) => void
): boolean {
  if (!gameState) return false

  const { inning, top, score, runsScoredThisHalf } = gameState
  const [awayScore, homeScore] = score

  if (!top && inning >= 9 && runsScoredThisHalf > 0 && homeScore > awayScore) {
    // Home team took the lead during the bottom half — walk-off
    endGameFn('Home', score, inning, false)
    return true
  }

  return false
}

/**
 * Checks whether the game should end after a half-inning concludes.
 * Should be called after a half-inning ends (e.g., after 3 outs).
 * It accounts for regulation and extra-inning scenarios.
 */
export function checkGameEnd(
  gameState: GameStateLike,
  endGameFn: (winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean) => void
): void {
  if (!gameState || !gameState.isHalfInningOver) return;

  const { inning, top, score } = gameState;
  const [awayScore, homeScore] = score;

  // Only evaluate end conditions starting from the 9th inning
  if (inning < 9) return;

  // Never end the game at the start of the top of the 9th
  if (inning === 9 && top) return;

  // Only check for a winner at the start of a top half in extra innings
  if (inning > 9 && top) {
    if (homeScore > awayScore) {
      endGameFn('Home', score, inning, true);
      return;
    }
    if (awayScore > homeScore) {
      endGameFn('Away', score, inning, true);
      return;
    }
    // If tied, continue to next inning
    return;
  }
  // Never end the game at the start of the bottom half of any inning 9 or later
  // (handled by walk-off logic or after the bottom half is completed)
}

