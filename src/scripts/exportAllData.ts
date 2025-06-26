import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { parseTables } from '../utils/parseTables.js';
import { parseStatTable } from '../utils/statParser.js';
import { normalizeBattingStats, normalizePitchingStats, normalizeFieldingStats } from '../utils/statNormalizer.js';
import { JSDOM } from 'jsdom';
import path from 'path';

// Setup JSDOM for Node.js environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

interface NormalizedPlayer {
  name: string;
  player_id: string;
  team: string;
  year: string;
  // Batting stats
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
  // Pitching stats
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
  // Fielding stats
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
      // Catcher-specific stats
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

function extractTeamInfo(filename: string): { team: string; year: string } {
  // Extract team code and year from filename like "CHC-2025.html"
  const match = filename.match(/^([A-Z]{3})-(\d{4})\.html$/);
  if (!match) {
    throw new Error(`Invalid filename format: ${filename}`);
  }
  return { team: match[1], year: match[2] };
}

function processTeamFile(filepath: string): TeamData {
  console.log(`Processing: ${filepath}`);
  
  const filename = path.basename(filepath);
  const { team, year } = extractTeamInfo(filename);
  
  // Read and parse HTML
  const html = readFileSync(filepath, 'utf8');
  const { batting, pitching, fielding } = parseTables(html);
  
  // Parse raw data
  const battersRaw = batting ? parseStatTable(batting) : [];
  const pitchersRaw = pitching ? parseStatTable(pitching) : [];
  const fieldersRaw = fielding ? parseStatTable(fielding) : [];
  
  // Normalize data
  const batters = normalizeBattingStats(battersRaw as any[]);
  const pitchers = normalizePitchingStats(pitchersRaw as any[]);
  const fielders = normalizeFieldingStats(fieldersRaw as any[]);
  
  // Create player map for easy lookup
  const players = new Map<string, NormalizedPlayer>();
  
  // Add batters
  batters.forEach(batter => {
    players.set(batter.player_id, {
      name: batter.name,
      player_id: batter.player_id,
      team,
      year,
      batting: {
        PA: batter.PA,
        stats: batter.stats,
        rates: batter.rates,
        baserunning: batter.baserunning
      }
    });
  });
  
  // Add pitchers
  pitchers.forEach(pitcher => {
    const existing = players.get(pitcher.player_id);
    if (existing) {
      existing.pitching = {
        TBF: pitcher.TBF,
        stats: pitcher.stats,
        rates: pitcher.rates
      };
    } else {
      players.set(pitcher.player_id, {
        name: pitcher.name,
        player_id: pitcher.player_id,
        team,
        year,
        pitching: {
          TBF: pitcher.TBF,
          stats: pitcher.stats,
          rates: pitcher.rates
        }
      });
    }
  });
  
  // Add fielders
  fielders.forEach(fielder => {
    const existing = players.get(fielder.player_id);
    if (existing) {
      existing.fielding = {
        position: fielder.position,
        stats: fielder.stats
      };
    } else {
      players.set(fielder.player_id, {
        name: fielder.name,
        player_id: fielder.player_id,
        team,
        year,
        fielding: {
          position: fielder.position,
          stats: fielder.stats
        }
      });
    }
  });
  
  return {
    team,
    year,
    players: Array.from(players.values())
  };
}

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

async function main() {
  console.log('🚀 Starting comprehensive data export...');
  
  const dataDir = '../../dist/data';
  const outputFile = '../../dist/complete-dataset-2025.json';
  
  // Get all team files
  const files = readdirSync(dataDir)
    .filter(file => file.endsWith('.html'))
    .sort();
  
  console.log(`📁 Found ${files.length} team files`);
  
  // Process all teams
  const teams: TeamData[] = [];
  for (const file of files) {
    try {
      const filepath = path.join(dataDir, file);
      const teamData = processTeamFile(filepath);
      teams.push(teamData);
      console.log(`✅ Processed ${teamData.team}: ${teamData.players.length} players`);
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error);
    }
  }
  
  // Generate metadata
  const metadata = generateMetadata(teams);
  
  // Create complete dataset
  const dataset: CompleteDataset = {
    metadata,
    teams
  };
  
  // Write to file
  console.log(`💾 Writing ${teams.length} teams with ${metadata.totalPlayers} total players...`);
  writeFileSync(outputFile, JSON.stringify(dataset, null, 2));
  
  console.log(`✅ Complete dataset saved to: ${outputFile}`);
  console.log(`📊 Summary:`);
  console.log(`   Teams: ${metadata.totalTeams}`);
  console.log(`   Total Players: ${metadata.totalPlayers}`);
  console.log(`   Batters: ${metadata.totalBatters}`);
  console.log(`   Pitchers: ${metadata.totalPitchers}`);
  console.log(`   Fielders: ${metadata.totalFielders}`);
  console.log(`   File Size: ${(JSON.stringify(dataset).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error); 