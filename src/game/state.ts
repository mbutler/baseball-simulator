// Game state variables and state-resetting logic for Baseball Simulator
import type { NormalizedBatter, NormalizedPitcher } from '../types/baseball.js';
import type { Roster } from '../core/matchupPreparer';
import type { GameState } from '../core/gameEngine';

export interface LoadedTeam {
  batters: NormalizedBatter[];
  pitchers: NormalizedPitcher[];
  fielders: any[]; // Normalized fielding data
}

export interface AtBatLogEntry {
  batterName: string;
  outcome: string;
  outs: number;
  score: number[];
  bases: number[];
  inning: number;
  top: boolean;
}

export const gameStore = {
  loadedHome: null as LoadedTeam | null,
  loadedAway: null as LoadedTeam | null,
  homeRoster: null as Roster | null,
  awayRoster: null as Roster | null,
  homeFielders: null as any[] | null,
  awayFielders: null as any[] | null,
  homeMatchups: null as any[] | null,
  awayMatchups: null as any[] | null,
  gameState: null as GameState | null,
  lastRenderedInning: 1,
  lastRenderedTop: true,
  customHomeLineup: null as string[] | null,
  customHomePitcher: null as string | null,
  customAwayLineup: null as string[] | null,
  customAwayPitcher: null as string | null,
  editingTeam: null as 'home' | 'away' | null,
  atBatLog: [] as AtBatLogEntry[]
};

export function resetGameState() {
  gameStore.loadedHome = null;
  gameStore.loadedAway = null;
  gameStore.homeRoster = null;
  gameStore.awayRoster = null;
  gameStore.homeFielders = null;
  gameStore.awayFielders = null;
  gameStore.homeMatchups = null;
  gameStore.awayMatchups = null;
  gameStore.gameState = null;
  gameStore.lastRenderedInning = 1;
  gameStore.lastRenderedTop = true;
  gameStore.customHomeLineup = null;
  gameStore.customHomePitcher = null;
  gameStore.customAwayLineup = null;
  gameStore.customAwayPitcher = null;
  gameStore.editingTeam = null;
  gameStore.atBatLog = [];
} 