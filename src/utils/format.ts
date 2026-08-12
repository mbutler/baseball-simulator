// Display formatting helpers.

/**
 * Format a rate stat the way baseball writes them, without the leading zero:
 * .313 rather than 0.313. Values of 1 or more keep their whole number (1.000).
 * @param value - The rate, or null when the player has no qualifying data
 * @param digits - Decimal places to show
 * @returns The formatted rate, or an empty string when there is nothing to show
 */
export function formatAverage(value: number | null | undefined, digits = 3): string {
  const num = Number(value);
  if (value === null || value === undefined || !Number.isFinite(num)) return '';
  return num.toFixed(digits).replace(/^(-?)0\./, '$1.');
}
