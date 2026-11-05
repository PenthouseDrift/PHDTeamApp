/** Tour Rating: an Elo-style number that goes up with wins, and more when the opponent was strong. */

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/** Rating points gained (positive) or lost (negative) for one Round. */
export function roundRatingDelta(rating: number, opponentRating: number, won: boolean, k: number): number {
  return k * ((won ? 1 : 0) - expectedScore(rating, opponentRating));
}

export const MIN_RATING = 100;

export function applyRatingDelta(rating: number, delta: number): number {
  return Math.max(MIN_RATING, Math.round(rating + delta));
}

/** Ladder points for a finished Tour. */
export function ladderPoints(wins: number, finishedAllRounds: boolean): number {
  return wins * 10 + (finishedAllRounds ? 5 : 0);
}
