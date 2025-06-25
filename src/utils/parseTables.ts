/**
 * @fileoverview Parses Baseball Reference stat tables (batting, pitching, fielding).
 * Uses both direct DOM and comment block parsing.
 * @module utils/parseTables
 */

/**
 * Extracts all HTML comment blocks from a full HTML string.
 * @param html - Raw HTML string
 * @returns Array of comment block contents
 */
function extractCommentBlocks(html: string): string[] {
  const commentRegex = /<!--([\s\S]*?)-->/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Searches comment blocks for a specific table ID and parses it to DOM.
 * @param blocks - Comment blocks
 * @param tableId - ID of table to find
 * @returns The found table element or null
 */
function parseTableFromComments(blocks: string[], tableId: string): HTMLTableElement | null {
  const parser = new DOMParser();
  for (const block of blocks) {
    if (block.includes(`id="${tableId}"`)) {
      const doc = parser.parseFromString(block, 'text/html');
      return doc.querySelector(`table#${tableId}`) as HTMLTableElement | null;
    }
  }
  return null;
}

/**
 * Parses the team page HTML and extracts major tables.
 * @param html - Raw HTML of the team page
 * @returns Object with batting, pitching, and fielding tables (may be null)
 */
export function parseTables(html: string): {
  batting: HTMLTableElement | null;
  pitching: HTMLTableElement | null;
  fielding: HTMLTableElement | null;
} {
  const container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);
  container.innerHTML = html;

  const batting = container.querySelector('table#players_standard_batting') as HTMLTableElement | null;
  const pitching = container.querySelector('table#players_standard_pitching') as HTMLTableElement | null;

  const commentBlocks = extractCommentBlocks(html);
  const fielding = parseTableFromComments(commentBlocks, 'players_standard_fielding');

  container.remove();

  return {
    batting,
    pitching,
    fielding
  };
} 