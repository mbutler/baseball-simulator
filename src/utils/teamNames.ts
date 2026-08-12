// The dataset identifies clubs by Baseball Reference abbreviation only, so
// full names for display live here. Alternate abbreviations are included
// because the scraped source has used more than one code for some clubs.
const TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Diamondbacks',
  ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs',
  CHW: 'Chicago White Sox',
  CWS: 'Chicago White Sox',
  CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies',
  DET: 'Detroit Tigers',
  HOU: 'Houston Astros',
  KCR: 'Kansas City Royals',
  KC: 'Kansas City Royals',
  LAA: 'Los Angeles Angels',
  LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers',
  MIN: 'Minnesota Twins',
  NYM: 'New York Mets',
  NYY: 'New York Yankees',
  ATH: 'Athletics',
  OAK: 'Athletics',
  PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates',
  SDP: 'San Diego Padres',
  SD: 'San Diego Padres',
  SEA: 'Seattle Mariners',
  SFG: 'San Francisco Giants',
  SF: 'San Francisco Giants',
  STL: 'St. Louis Cardinals',
  TBR: 'Tampa Bay Rays',
  TB: 'Tampa Bay Rays',
  TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays',
  WSN: 'Washington Nationals',
  WSH: 'Washington Nationals'
};

/**
 * Full club name for a dataset team code such as "CHC-2026".
 * @param teamCode - Team code, with or without the trailing year
 * @returns The club's name, or the code itself if it is not a known club
 */
export function formatTeamName(teamCode: string | undefined | null): string {
  const code = String(teamCode ?? '').trim();
  if (!code) return '';
  return TEAM_NAMES[code.split('-')[0].toUpperCase()] ?? code;
}
