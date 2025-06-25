/**
 * @fileoverview Fetches a Baseball Reference team page over HTTPS.
 * Designed to be used server-side (e.g. in Bun) to avoid browser CORS limitations.
 * @module fetchHtml
 */

/**
 * Fetch the full HTML content of a Baseball Reference team page.
 * @param url - The full team URL (e.g., "https://www.baseball-reference.com/teams/CHC/2025.shtml")
 * @returns Promise that resolves with raw HTML content
 * @throws Error if the fetch fails or returns a non-OK status
 */
export async function fetchHtml(url: string): Promise<string> {
  if (!url.startsWith('https://www.baseball-reference.com/teams/')) {
    throw new Error(`Invalid team URL: ${url}`);
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status} (${response.statusText})`);
    }

    const html = await response.text();
    return html;
  } catch (err) {
    const msg = (err && typeof err === 'object' && 'message' in err) ? (err as Error).message : String(err);
    throw new Error(`Failed to fetch team page: ${msg}`);
  }
} 