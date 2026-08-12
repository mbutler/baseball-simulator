// Player names come from Baseball Reference, which decorates them with
// handedness markers ("Carlos Santana#", "Matt Olson*") and roster notes
// ("Pavin Smith (10-day IL)"). Those need stripping before a name is shown,
// and shortening a name to a surname has to account for suffixes ("Bobby Witt
// Jr.") and multi-word surnames ("Elly De La Cruz").

const ROSTER_NOTE = /\s*\([^)]*\)/g;
const HANDEDNESS = /[*#+?]+$/;
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const SURNAME_PARTICLES = new Set([
  'da', 'das', 'de', 'del', 'della', 'des', 'di', 'do', 'dos', 'du',
  'la', 'las', 'le', 'los', 'san', 'santa', 'st.', 'van', 'von', 'y'
]);

/**
 * Strip Baseball Reference's decorations from a name so it can be displayed.
 * @param name - Raw name, e.g. "Pavin Smith (10-day IL)*"
 * @returns The plain name, e.g. "Pavin Smith"
 */
export function formatPlayerName(name: string | undefined | null): string {
  return String(name ?? '')
    .replace(ROSTER_NOTE, '')
    .replace(HANDEDNESS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The surname alone, keeping particles ("De La Cruz") and dropping generational
 * suffixes ("Witt Jr." -> "Witt").
 * @param name - Raw or already formatted name
 */
export function surname(name: string | undefined | null): string {
  const parts = formatPlayerName(name).split(' ').filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/\.$/, ''))) {
    parts.pop();
  }
  let start = parts.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(parts[start - 1].toLowerCase())) start--;
  return parts.slice(Math.max(start, 0)).join(' ');
}

/**
 * Two-letter initials from the given name and surname, so "Ronald Acuña Jr."
 * reads as RA rather than picking up the suffix.
 * @param name - Raw or already formatted name
 */
export function playerInitials(name: string | undefined | null): string {
  const parts = formatPlayerName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (surname(name)[0] ?? '')).toUpperCase();
}

/**
 * Surname for a cramped label, truncated with an ellipsis if it is too long.
 * @param name - Raw or already formatted name
 * @param maxLength - Longest string the label can hold
 */
export function shortName(name: string | undefined | null, maxLength = 12): string {
  const last = surname(name);
  return last.length > maxLength ? `${last.slice(0, maxLength - 1)}…` : last;
}
