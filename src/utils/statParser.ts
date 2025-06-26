/**
 * @fileoverview Converts a Baseball Reference stats table into structured player objects.
 * @module utils/statParser
 */

/**
 * @typedef {Object} ParsedPlayer
 * @property {string} name - Player's name
 * @property {string} player_id - Player's unique ID (from link or fallback)
 * @property {Object.<string, number|string>} [stats] - Additional stat fields (e.g., PA, HR, Team, etc.)
 */
export interface ParsedPlayer {
  name: string;
  player_id: string;
  stats?: Record<string, number | string>;
}

/**
 * Extracts Baseball Reference player ID from an anchor tag.
 * @param link - Anchor element with player link
 * @returns Player ID or null if not found
 */
function extractPlayerId(link: HTMLAnchorElement | null): string | null {
  if (!link || !link.href) return null;
  const match = link.href.match(/\/players\/.\/([^/.]+)\.shtml/);
  return match ? match[1] : null;
}

/**
 * Generates a fallback ID from player name if link is missing.
 * @param name - Player's name
 * @returns Fallback player ID
 */
function fallbackIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove punctuation/spaces
    .slice(0, 12);
}

/**
 * Converts a Baseball Reference stats table to an array of player objects.
 * Handles cases where <th> contains row numbers, and name is in first <td>.
 * @param table - Table element to parse
 * @returns Parsed player stat rows
 */
export function parseStatTable(table: HTMLTableElement | null): ParsedPlayer[] {
  if (!table) return [];

  // Debug logs
  console.log('Table id:', table?.id);
  const theadRows = Array.from(table.querySelectorAll('thead tr'));
  console.log('Header rows:', theadRows.map(tr => tr.textContent));
  const headerRow = theadRows[theadRows.length - 1]; // Use the last header row
  const headerCells = Array.from(headerRow.querySelectorAll('th')).map(
    th => (th.textContent ?? '').trim()
  );
  console.log('Header cells:', headerCells);

  const rows = Array.from(table.querySelectorAll('tbody > tr')).filter(
    tr => !tr.classList.contains('thead')
  );
  console.log('First data row:', rows[0]?.innerHTML);

  const result: ParsedPlayer[] = [];

  for (const row of rows) {
    const cells = [row.querySelector('th'), ...row.querySelectorAll('td')];
    if (cells.length !== headerCells.length) continue;

    const stat: Record<string, any> = {};

    for (let i = 0; i < headerCells.length; i++) {
      const key = headerCells[i];
      const cell = cells[i];

      if (i === 0) {
        let name = cell?.textContent?.trim() || '';
        let link = cell?.querySelector?.('a') as HTMLAnchorElement | null;
        let id = extractPlayerId(link);

        // If cell is just a row number, get name/link from next <td>
        if (/^\d+$/.test(name)) {
          const altCell = row.querySelector('td');
          name = altCell?.textContent?.trim() || '(unknown)';
          link = altCell?.querySelector?.('a') as HTMLAnchorElement | null;
          id = extractPlayerId(link) || id;
        }

        stat.name = name;
        stat.player_id = id || fallbackIdFromName(name);
      } else {
        const text = cell?.textContent?.trim() || '';
        const num = Number(text.replace(/,/g, ''));
        stat[key] = isNaN(num) ? text : num;
      }
    }

    result.push(stat as ParsedPlayer);
  }

  return result;
} 