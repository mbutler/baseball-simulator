// Data loader for JSON dataset
import type { LoadedTeam } from '../game/state';

// Types matching the JSON dataset structure
export interface NormalizedPlayer {
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

export interface TeamData {
  team: string;
  year: string;
  players: NormalizedPlayer[];
}

export interface CompleteDataset {
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

// Cache for the loaded dataset
let datasetCache: CompleteDataset | null = null;

/**
 * Load the complete dataset from JSON file
 */
export async function loadDataset(): Promise<CompleteDataset> {
  if (datasetCache) {
    return datasetCache;
  }

  try {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      // Browser environment - use fetch
      const response = await fetch('./complete-dataset-2025.json');
      if (!response.ok) {
        throw new Error(`Failed to load dataset: ${response.status} ${response.statusText}`);
      }
      
      const dataset: CompleteDataset = await response.json();
      datasetCache = dataset;
      return dataset;
    } else {
      // Node.js environment - use file system
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'dist', 'complete-dataset-2025.json');
      const data = fs.readFileSync(filePath, 'utf8');
      const dataset: CompleteDataset = JSON.parse(data);
      datasetCache = dataset;
      return dataset;
    }
  } catch (error) {
    console.error('Error loading dataset:', error);
    throw new Error('Failed to load baseball dataset. Please ensure complete-dataset-2025.json is available.');
  }
}

/**
 * Get available teams from the dataset
 */
export async function getAvailableTeams(): Promise<string[]> {
  const dataset = await loadDataset();
  return dataset.teams.map(team => `${team.team}-${team.year}.html`);
}

/**
 * Load team data by filename (maintains compatibility with existing code)
 */
export async function loadTeamFile(filename: string): Promise<LoadedTeam> {
  const dataset = await loadDataset();
  
  // Extract team code from filename (e.g., "CHC-2025.html" -> "CHC")
  const teamCode = filename.replace('.html', '').split('-')[0];
  
  // Find the team in the dataset
  const teamData = dataset.teams.find(team => team.team === teamCode);
  if (!teamData) {
    throw new Error(`Team ${teamCode} not found in dataset`);
  }

  // Separate players by type to match existing LoadedTeam interface
  const batters: any[] = [];
  const pitchers: any[] = [];
  const fielders: any[] = [];

  teamData.players.forEach(player => {
    // Create base player object
    const basePlayer = {
      name: player.name,
      player_id: player.player_id,
      team: player.team,
      year: player.year
    };

    // Add batters
    if (player.batting) {
      batters.push({
        ...basePlayer,
        PA: player.batting.PA,
        stats: player.batting.stats,
        rates: player.batting.rates,
        baserunning: player.batting.baserunning
      });
    }

    // Add pitchers
    if (player.pitching) {
      pitchers.push({
        ...basePlayer,
        TBF: player.pitching.TBF,
        stats: player.pitching.stats,
        rates: player.pitching.rates
      });
    }

    // Add fielders
    if (player.fielding) {
      fielders.push({
        ...basePlayer,
        position: player.fielding.position,
        stats: player.fielding.stats
      });
    }
  });

  return {
    batters,
    pitchers,
    fielders
  };
}

/**
 * Get dataset metadata
 */
export async function getDatasetMetadata(): Promise<CompleteDataset['metadata']> {
  const dataset = await loadDataset();
  return dataset.metadata;
} 