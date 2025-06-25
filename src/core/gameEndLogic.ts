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
 * Evaluates whether the game should end due to a walk-off.
 * Should be called immediately after the home team scores a run during
 * the bottom of the 9th inning or later.
 *
 * Returns true if the game ended immediately due to a walk-off.
 */
export function checkWalkoff(
  gameState: GameStateLike,
  endGameFn: (winner: 'Home', score: number[], inning: number, lastWasTop: boolean) => void
): boolean {
  if (!gameState) return false

  const { inning, top, score, runsScoredThisHalf } = gameState
  const [awayScore, homeScore] = score

  // Walk-offs only possible in bottom 9th or later
  if (top || inning < 9) return false

  // Home team must have taken the lead *this half-inning*
  const homeWasTiedOrBehindBeforeHalf = (homeScore - runsScoredThisHalf) <= awayScore
  const homeIsNowAhead = homeScore > awayScore

  if (homeWasTiedOrBehindBeforeHalf && homeIsNowAhead) {
    endGameFn('Home', score, inning, false) // lastWasTop = false
    return true
  }

  return false
}


/**
 * Evaluates whether the game should end after a half-inning concludes.
 * This should be called *only after* the 3rd out, when the half-inning has ended
 * and the game state has transitioned to the next inning half.
 *
 * Assumes checkWalkoff has already been called (if relevant) during the bottom half.
 */
export function checkGameEnd(
  gameState: GameStateLike,
  endGameFn: (winner: 'Home' | 'Away', score: number[], inning: number, lastWasTop: boolean) => void
): void {
  if (!gameState?.isHalfInningOver) return

  const { inning, top, score } = gameState
  const [awayScore, homeScore] = score

  // No evaluation before 9th inning
  if (inning < 9) return

  // -- Top of 9th or later just ended (bottom half about to start)
  if (!top) {
    if (homeScore > awayScore) {
      // Home team is already ahead — no need for bottom half → game over
      endGameFn('Home', score, inning, true) // lastWasTop = true
      return
    }
    // Game continues to bottom half
    return
  }

  // -- Bottom of 9th or later just ended (top half about to start)
  if (top) {
    if (awayScore > homeScore) {
      // Away team is ahead after full inning → game over
      endGameFn('Away', score, inning, false) // lastWasTop = false
      return
    }

    if (homeScore > awayScore) {
      // This is defensive — should have been handled as a walk-off
      // But if missed, enforce win now
      endGameFn('Home', score, inning, false)
      return
    }

    // Tie → continue to next inning
  }
}


