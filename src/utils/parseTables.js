/**
 * @fileoverview Parses Baseball Reference stat tables (batting, pitching, fielding).
 * Uses both direct DOM and comment block parsing.
 */

/**
 * Extracts all HTML comment blocks from a full HTML string.
 * @param {string} html
 * @returns {string[]} array of comment block contents
 */
function extractCommentBlocks(html) {
  const commentRegex = /<!--([\s\S]*?)-->/g
  const blocks = []
  let match
  while ((match = commentRegex.exec(html)) !== null) {
    blocks.push(match[1])
  }
  return blocks
}

/**
 * Searches comment blocks for a specific table ID and parses it to DOM.
 * @param {string[]} blocks - Comment blocks
 * @param {string} tableId - ID of table to find
 * @returns {HTMLTableElement|null}
 */
function parseTableFromComments(blocks, tableId) {
  const parser = new DOMParser()
  for (const block of blocks) {
    if (block.includes(`id="${tableId}"`)) {
      const doc = parser.parseFromString(block, 'text/html')
      return doc.querySelector(`table#${tableId}`) || null
    }
  }
  return null
}

/**
 * Parses the team page HTML and extracts major tables.
 * @param {string} html - Raw HTML of the team page
 * @returns {{
 *   batting: HTMLTableElement|null,
 *   pitching: HTMLTableElement|null,
 *   fielding: HTMLTableElement|null
 * }}
 */
export function parseTables(html) {
  const container = document.createElement('div')
  container.style.display = 'none'
  document.body.appendChild(container)
  container.innerHTML = html

  const batting = container.querySelector('table#players_standard_batting')
  const pitching = container.querySelector('table#players_standard_pitching')

  const commentBlocks = extractCommentBlocks(html)
  const fielding = parseTableFromComments(commentBlocks, 'players_standard_fielding')

  container.remove()

  return {
    batting,
    pitching,
    fielding
  }
}
