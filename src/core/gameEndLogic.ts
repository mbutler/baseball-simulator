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
  endGameFn: (winner: 'Home' | 'Away', score: [number, number], inning: number, lastWasTop: boolean) => void
): boolean {
  const { inning, top, outs, score } = gameState
  const [awayScore, homeScore] = score

  // No game-ending logic applies before the 9th inning
  if (inning < 9) return false

  // --- Case 1: Top half just ended (outs === 3 and top was true) ---
  if (top && outs === 3) {
    if (homeScore > awayScore) {
      endGameFn('Home', score, inning, true) // lastWasTop = true
      return true
    }
    return false // game continues to bottom half
  }

  // --- Case 2: Bottom half just ended (outs === 3 and top was false) ---
  if (!top && outs === 3) {
    if (awayScore > homeScore) {
      endGameFn('Away', score, inning, false)
      return true
    } else if (homeScore > awayScore) {
      endGameFn('Home', score, inning, false)
      return true
    } else {
      return false // tied, game continues to next inning
    }
  }

  // --- Case 3: Bottom half in progress and home team is ahead (walk-off) ---
  if (!top && outs < 3 && homeScore > awayScore) {
    endGameFn('Home', score, inning, false)
    return true
  }

  return false
}




