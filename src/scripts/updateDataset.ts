#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const dataDir = path.resolve(projectRoot, 'dist/data');
const outputFile = path.resolve(projectRoot, 'dist/complete-dataset-2025.json');

// Setup JSDOM for Node.js environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

// Types
interface NormalizedPlayer {
  name: string;
  player_id: string;
  team: string;
  year: string;
  batting?: {
    PA: number;
    stats: {
      H: number;
      HR: number;
      BB: number;
      SO: number;
      SF: number;
      HBP: number;
      singles: number;
      doubles: number;
      triples: number;
    };
    rates: {
      kRate: number | null;
      bbRate: number | null;
      hrRate: number | null;
      BABIP: number | null;
    };
    baserunning: {
      runsBaserunning: number | null;
      speed: number | null;
    };
  };
  pitching?: {
    TBF: number;
    stats: {
      IP: number;
      H: number;
      HR: number;
      BB: number;
      SO: number;
      HBP: number;
    };
    rates: {
      kRate: number | null;
      bbRate: number | null;
      hrRate: number | null;
      BABIP: number | null;
    };
  };
  fielding?: {
    position: string;
    stats: {
      G: number;
      Inn: number;
      PO: number;
      A: number;
      E: number;
      DP: number;
      FP: number | null;
      RF: number | null;
      TZ: number | null;
      sbAllowed: number;
      cs: number;
      csPct: number | null;
      pickoffs: number;
      armStrength: number | null;
    };
  };
}

interface TeamData {
  team: string;
  year: string;
  players: NormalizedPlayer[];
}

interface CompleteDataset {
  metadata: {
    totalTeams: number;
    totalPlayers: number;
    totalBatters: number;
    totalPitchers: number;
    totalFielders: number;
    year: string;
    generatedAt: string;
  };
  teams: TeamData[];
}

// List of all MLB teams
const MLB_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL', 'DET',
  'HOU', 'KCR', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK',
  'PHI', 'PIT', 'SDP', 'SEA', 'SFG', 'STL', 'TBR', 'TEX', 'TOR', 'WSN'
];

/**
 * Fetch HTML from Baseball Reference
 */
async function fetchHtml(url: string): Promise<string> {
  if (!url.startsWith('https://www.baseball-reference.com/teams/')) {
    throw new Error(`Invalid team URL: ${url}`);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status} (${response.statusText})`);
    }
    return await response.text();
  } catch (err) {
    const msg = (err && typeof err === 'object' && 'message' in err) ? (err as Error).message : String(err);
    throw new Error(`Failed to fetch team page: ${msg}`);
  }
}

/**
 * Parse HTML tables from Baseball Reference, including tables inside HTML comments
 */
function parseTables(html: string): { batting: string | null; pitching: string | null; fielding: string | null; valueBatting: string | null } {
  console.log('   Looking for tables...');

  // Use regex to find table content
  const battingMatch = html.match(/<table[^>]*id="players_standard_batting"[^>]*>.*?<\/table>/s);
  const pitchingMatch = html.match(/<table[^>]*id="players_standard_pitching"[^>]*>.*?<\/table>/s);
  let fieldingMatch = html.match(/<table[^>]*id="players_standard_fielding"[^>]*>.*?<\/table>/s);
  const valueBattingMatch = html.match(/<table[^>]*id="players_value_batting"[^>]*>.*?<\/table>/s);

  // If not found, look inside HTML comments (Baseball Reference sometimes does this)
  if (!fieldingMatch) {
    const commentMatches = html.match(/<!--.*?-->/gs);
    if (commentMatches) {
      for (const comment of commentMatches) {
        const fieldingInComment = comment.match(/<table[^>]*id="players_standard_fielding"[^>]*>.*?<\/table>/s);
        if (fieldingInComment) {
          fieldingMatch = fieldingInComment;
          console.log('   Found fielding table inside HTML comment');
          break;
        }
      }
    }
  }

  console.log(`   Found tables: batting=${!!battingMatch}, pitching=${!!pitchingMatch}, fielding=${!!fieldingMatch}, valueBatting=${!!valueBattingMatch}`);

  return {
    batting: battingMatch ? battingMatch[0] : null,
    pitching: pitchingMatch ? pitchingMatch[0] : null,
    fielding: fieldingMatch ? fieldingMatch[0] : null,
    valueBatting: valueBattingMatch ? valueBattingMatch[0] : null
  };
}

/**
 * Parse raw stat table data
 */
function parseStatTable(tableHtml: string): any[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(tableHtml, 'text/html');
  const rows = doc.querySelectorAll('tbody tr');
  
  const players: any[] = [];
  
  rows.forEach(row => {
    const cells = row.querySelectorAll('td, th');
    if (cells.length === 0) return;
    
    const player: any = {};
    
    cells.forEach(cell => {
      const stat = cell.getAttribute('data-stat');
      if (stat) {
        const text = cell.textContent?.trim() || '';
        const num = parseFloat(text);
        player[stat] = isNaN(num) ? text : num;
      }
    });
    
    if (player.name_display) {
      players.push(player);
    }
  });
  
  return players;
}

/**
 * Normalize batting stats
 */
function normalizeBattingStats(batters: any[]): any[] {
  return batters
    .filter(batter => batter.name_display && batter.name_display !== 'Player')
    .map(batter => {
      const PA = batter.b_pa || 0;
      const H = batter.b_h || 0;
      const HR = batter.b_hr || 0;
      const BB = batter.b_bb || 0;
      const SO = batter.b_so || 0;
      const SF = batter.b_sf || 0;
      const HBP = batter.b_hbp || 0;
      const doubles = batter.b_doubles || 0;
      const triples = batter.b_triples || 0;
      
      const singles = H - doubles - triples - HR;
      
      // Calculate rates
      const kRate = PA > 0 ? SO / PA : null;
      const bbRate = PA > 0 ? BB / PA : null;
      const hrRate = PA > 0 ? HR / PA : null;
      const BABIP = (PA - BB - SO - HR - SF) > 0 ? (H - HR) / (PA - BB - SO - HR - SF) : null;
      
      // Baserunning stats (simplified)
      const runsBaserunning = batter.b_runs_baserunning || null;
      const speed = runsBaserunning ? 50 + runsBaserunning * 10 : null;
      
      return {
        name: batter.name_display,
        player_id: batter.name_display?.toLowerCase().replace(/[^a-z0-9]/g, '') || '',
        PA,
        stats: { H, HR, BB, SO, SF, HBP, singles, doubles, triples },
        rates: { kRate, bbRate, hrRate, BABIP },
        baserunning: { runsBaserunning, speed }
      };
    });
}

/**
 * Normalize pitching stats
 */
function normalizePitchingStats(pitchers: any[]): any[] {
  return pitchers
    .filter(pitcher => pitcher.name_display && pitcher.name_display !== 'Player')
    .map(pitcher => {
      const TBF = pitcher.p_bfp || 0;
      const IP = pitcher.p_ip || 0;
      const H = pitcher.p_h || 0;
      const HR = pitcher.p_hr || 0;
      const BB = pitcher.p_bb || 0;
      const SO = pitcher.p_so || 0;
      const HBP = pitcher.p_hbp || 0;
      
      // Calculate rates
      const kRate = TBF > 0 ? SO / TBF : null;
      const bbRate = TBF > 0 ? BB / TBF : null;
      const hrRate = TBF > 0 ? HR / TBF : null;
      const BABIP = (TBF - BB - SO - HR - HBP) > 0 ? (H - HR) / (TBF - BB - SO - HR - HBP) : null;
      
      return {
        name: pitcher.name_display,
        player_id: pitcher.name_display?.toLowerCase().replace(/[^a-z0-9]/g, '') || '',
        TBF,
        stats: { IP, H, HR, BB, SO, HBP },
        rates: { kRate, bbRate, hrRate, BABIP }
      };
    });
}

/**
 * Normalize fielding stats
 */
function normalizeFieldingStats(fielders: any[]): any[] {
  return fielders
    .filter(fielder => fielder.name_display && fielder.name_display !== 'Player')
    .map(fielder => {
      const G = fielder.f_games_distinct || 0;
      const Inn = fielder.f_innings || 0;
      const PO = fielder.f_po || 0;
      const A = fielder.f_assists || 0;
      const E = fielder.f_errors || 0;
      const DP = fielder.f_dp || 0;
      const FP = (PO + A) > 0 ? (PO + A) / (PO + A + E) : null;
      const RF = Inn > 0 ? (PO + A) * 9 / Inn : null;
      const TZ = fielder.f_tz_runs_total || null;
      
      // Catcher-specific stats
      const sbAllowed = fielder.f_sb_catcher_only || 0;
      const cs = fielder.f_cs_catcher_only || 0;
      const csPct = (sbAllowed + cs) > 0 ? cs / (sbAllowed + cs) : null;
      const pickoffs = fielder.f_pickoffs_catcher_only || 0;
      const armStrength = csPct ? 50 + csPct * 100 : null;
      
      // Determine primary position
      let pos = fielder.pos;
      if (typeof pos !== 'string') pos = '';
      const position = pos.includes('*') ? pos.split('*')[1] : pos;
      
      return {
        name: fielder.name_display,
        player_id: fielder.name_display?.toLowerCase().replace(/[^a-z0-9]/g, '') || '',
        position,
        stats: {
          G, Inn, PO, A, E, DP, FP, RF, TZ,
          sbAllowed, cs, csPct, pickoffs, armStrength
        }
      };
    });
}

/**
 * Download HTML for a single team
 */
async function downloadTeamHtml(teamCode: string, year: string): Promise<string> {
  const url = `https://www.baseball-reference.com/teams/${teamCode}/${year}.shtml`;
  const outPath = path.resolve(dataDir, `${teamCode}-${year}.html`);
  
  console.log(`🌐 Fetching: ${url}`);
  const html = await fetchHtml(url);
  
  console.log(`💾 Saving to: ${outPath}`);
  await writeFile(outPath, html);
  
  return html;
}

/**
 * Process a team's HTML file and extract normalized data
 */
function processTeamHtml(html: string, teamCode: string, year: string): TeamData {
  console.log(`📊 Processing: ${teamCode}-${year}`);
  
  // Parse HTML tables
  const { batting, pitching, fielding, valueBatting } = parseTables(html);
  
  console.log(`   Tables found: batting=${!!batting}, pitching=${!!pitching}, fielding=${!!fielding}, valueBatting=${!!valueBatting}`);
  
  // Parse raw data
  const battersRaw = batting ? parseStatTable(batting) : [];
  const pitchersRaw = pitching ? parseStatTable(pitching) : [];
  const fieldersRaw = fielding ? parseStatTable(fielding) : [];
  const valueBattersRaw = valueBatting ? parseStatTable(valueBatting) : [];
  
  console.log(`   Raw data: ${battersRaw.length} batters, ${pitchersRaw.length} pitchers, ${fieldersRaw.length} fielders, ${valueBattersRaw.length} value batters`);
  
  // Merge baserunning data from value batting table
  const battersWithBaserunning = battersRaw.map(batter => {
    const valueBatter = valueBattersRaw.find(vb => vb.name_display === batter.name_display);
    if (valueBatter) {
      return {
        ...batter,
        b_runs_baserunning: valueBatter.b_runs_baserunning || null
      };
    }
    return batter;
  });

  // Normalize data
  const batters = normalizeBattingStats(battersWithBaserunning);
  const pitchers = normalizePitchingStats(pitchersRaw);
  const fielders = normalizeFieldingStats(fieldersRaw);
  
  console.log(`   Normalized: ${batters.length} batters, ${pitchers.length} pitchers, ${fielders.length} fielders`);
  
  // Create player map for easy lookup
  const players = new Map<string, NormalizedPlayer & any>();

  // Helper to find raw data by player_id or name_display
  function findRaw(rawArr: any[], player: any) {
    return rawArr.find(r => (r.player_id && player.player_id && r.player_id === player.player_id) || (r.name_display && player.name && r.name_display === player.name));
  }

  // Add batters
  batters.forEach(batter => {
    const rawBatting = findRaw(battersRaw, batter);
    const rawValueBatting = findRaw(valueBattersRaw, batter);
    players.set(batter.player_id, {
      name: batter.name,
      player_id: batter.player_id,
      team: teamCode,
      year,
      batting: {
        PA: batter.PA,
        stats: batter.stats,
        rates: batter.rates,
        baserunning: batter.baserunning
      },
      rawBatting: rawBatting || null,
      rawValueBatting: rawValueBatting || null
    });
  });
  
  // Add pitchers
  pitchers.forEach(pitcher => {
    const rawPitching = findRaw(pitchersRaw, pitcher);
    const existing = players.get(pitcher.player_id);
    if (existing) {
      existing.pitching = {
        TBF: pitcher.TBF,
        stats: pitcher.stats,
        rates: pitcher.rates
      };
      existing.rawPitching = rawPitching || null;
    } else {
      players.set(pitcher.player_id, {
        name: pitcher.name,
        player_id: pitcher.player_id,
        team: teamCode,
        year,
        pitching: {
          TBF: pitcher.TBF,
          stats: pitcher.stats,
          rates: pitcher.rates
        },
        rawPitching: rawPitching || null
      });
    }
  });
  
  // Add fielders
  fielders.forEach(fielder => {
    const rawFielding = findRaw(fieldersRaw, fielder);
    const existing = players.get(fielder.player_id);
    if (existing) {
      existing.fielding = {
        position: fielder.position,
        stats: fielder.stats
      };
      existing.rawFielding = rawFielding || null;
    } else {
      players.set(fielder.player_id, {
        name: fielder.name,
        player_id: fielder.player_id,
        team: teamCode,
        year,
        fielding: {
          position: fielder.position,
          stats: fielder.stats
        },
        rawFielding: rawFielding || null
      });
    }
  });
  
  const finalPlayers = Array.from(players.values());
  const finalFielders = finalPlayers.filter(p => p.fielding);
  console.log(`   Final players: ${finalPlayers.length} total, ${finalFielders.length} with fielding data`);
  
  return {
    team: teamCode,
    year,
    players: finalPlayers
  };
}

/**
 * Generate metadata for the dataset
 */
function generateMetadata(teams: TeamData[]): CompleteDataset['metadata'] {
  const totalTeams = teams.length;
  const totalPlayers = teams.reduce((sum, team) => sum + team.players.length, 0);
  const totalBatters = teams.reduce((sum, team) => 
    sum + team.players.filter(p => p.batting).length, 0);
  const totalPitchers = teams.reduce((sum, team) => 
    sum + team.players.filter(p => p.pitching).length, 0);
  const totalFielders = teams.reduce((sum, team) => 
    sum + team.players.filter(p => p.fielding).length, 0);
  
  return {
    totalTeams,
    totalPlayers,
    totalBatters,
    totalPitchers,
    totalFielders,
    year: teams[0]?.year || '2025',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Main function to update the dataset
 */
async function updateDataset(year: string = '2025', teams?: string[]) {
  console.log('🚀 Starting comprehensive dataset update...');
  console.log(`📅 Year: ${year}`);
  console.log(`📁 Data directory: ${dataDir}`);
  console.log(`📄 Output file: ${outputFile}`);
  
  // Ensure data directory exists
  await mkdir(dataDir, { recursive: true });
  
  // Use provided teams or all MLB teams
  const teamsToProcess = teams || MLB_TEAMS;
  console.log(`🏟️ Processing ${teamsToProcess.length} teams: ${teamsToProcess.join(', ')}`);
  
  const processedTeams: TeamData[] = [];
  const errors: string[] = [];
  
  // Process each team
  for (const teamCode of teamsToProcess) {
    try {
      console.log(`\n📋 Processing ${teamCode}...`);
      
      // Download HTML
      const html = await downloadTeamHtml(teamCode, year);
      
      // Process and normalize data
      const teamData = processTeamHtml(html, teamCode, year);
      processedTeams.push(teamData);
      
      console.log(`✅ ${teamCode}: ${teamData.players.length} players`);
      
      // Add a small delay to be respectful to Baseball Reference
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      const errorMsg = `❌ Error processing ${teamCode}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }
  
  // Generate metadata
  const metadata = generateMetadata(processedTeams);
  
  // Create complete dataset
  const dataset: CompleteDataset = {
    metadata,
    teams: processedTeams
  };
  
  // Write to file
  console.log(`\n💾 Writing dataset to: ${outputFile}`);
  await writeFile(outputFile, JSON.stringify(dataset, null, 2));
  
  // Summary
  console.log(`\n🎉 Dataset update complete!`);
  console.log(`📊 Summary:`);
  console.log(`   Teams: ${metadata.totalTeams}`);
  console.log(`   Total Players: ${metadata.totalPlayers}`);
  console.log(`   Batters: ${metadata.totalBatters}`);
  console.log(`   Pitchers: ${metadata.totalPitchers}`);
  console.log(`   Fielders: ${metadata.totalFielders}`);
  console.log(`   File Size: ${(JSON.stringify(dataset).length / 1024 / 1024).toFixed(2)} MB`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️ Errors encountered:`);
    errors.forEach(error => console.log(`   ${error}`));
  }
}

// CLI argument handling
function main() {
  const args = Bun.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: bun run src/scripts/updateDatasetMonolithic.ts [YEAR] [TEAMS...]

Arguments:
  YEAR    Year to fetch data for (default: 2025)
  TEAMS   Space-separated list of team codes (default: all MLB teams)

Examples:
  bun run src/scripts/updateDatasetMonolithic.ts                    # Update all teams for 2025
  bun run src/scripts/updateDatasetMonolithic.ts 2024               # Update all teams for 2024
  bun run src/scripts/updateDatasetMonolithic.ts 2025 CHC MIL       # Update only CHC and MIL for 2025

Team codes: ${MLB_TEAMS.join(', ')}
    `);
    process.exit(0);
  }
  
  const year = args[0] || '2025';
  const teams = args.length > 1 ? args.slice(1) : undefined;
  
  updateDataset(year, teams).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

main(); 