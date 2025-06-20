/**
 * @fileoverview Fetches a Baseball Reference team page over HTTPS.
 * Designed to be used server-side (e.g. in Bun) to avoid browser CORS limitations.
 * @module fetchHtml
 */

/**
 * Fetch the full HTML content of a Baseball Reference team page.
 * @param {string} url - The full team URL (e.g., "https://www.baseball-reference.com/teams/CHC/2025.shtml")
 * @returns {Promise<string>} - Resolves with raw HTML content
 * @throws {Error} - If the fetch fails or returns a non-OK status
 */
export async function fetchHtml(url) {
  if (!url.startsWith('https://www.baseball-reference.com/teams/')) {
    throw new Error(`Invalid team URL: ${url}`)
  }

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status} (${response.statusText})`)
    }

    const html = await response.text()
    return html
  } catch (err) {
    const msg = (err && typeof err === 'object' && 'message' in err) ? /** @type {any} */ (err).message : String(err);
    throw new Error(`Failed to fetch team page: ${msg}`);
  }
}