/**
 * @fileoverview Computes derived statistics and normalization for batter and pitcher stat tables.
 * @module utils/statNormalizer
 */

/**
 * @typedef {Object} NormalizedBatter
 * @property {string} name
 * @property {string} player_id
 * @property {number} PA
 * @property {Object} stats
 * @property {number} stats.H
 * @property {number} stats.HR
 * @property {number} stats.BB
 * @property {number} stats.SO
 * @property {number} stats.SF
 * @property {number} stats.HBP
 * @property {number} stats.singles
 * @property {number} stats.doubles
 * @property {number} stats.triples
 * @property {Object} rates
 * @property {number|null} rates.kRate
 * @property {number|null} rates.bbRate
 * @property {number|null} rates.hrRate
 * @property {number|null} rates.BABIP
 * @property {Object} baserunning
 * @property {number|null} baserunning.runsBaserunning
 * @property {number|null} baserunning.speed
 */
export interface NormalizedBatter {
  name: string;
  player_id: string;
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
}

/**
 * @typedef {Object} NormalizedPitcher
 * @property {string} name
 * @property {string} player_id
 * @property {number} TBF
 * @property {Object} stats
 * @property {number} stats.IP
 * @property {number} stats.H
 * @property {number} stats.HR
 * @property {number} stats.BB
 * @property {number} stats.SO
 * @property {number} stats.HBP
 * @property {Object} rates
 * @property {number|null} rates.kRate
 * @property {number|null} rates.bbRate
 * @property {number|null} rates.hrRate
 * @property {number|null} rates.BABIP
 */
export interface NormalizedPitcher {
  name: string;
  player_id: string;
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
}

interface RawBatter {
  name: string;
  player_id: string;
  PA: any;
  AB: any;
  H: any;
  HR: any;
  BB: any;
  SO: any;
  SF?: any;
  HBP?: any;
  '2B'?: any;
  '3B'?: any;
  b_runs_baserunning?: any;
}

interface RawPitcher {
  name: string;
  player_id: string;
  IP: any;
  TBF: any;
  H: any;
  HR: any;
  BB: any;
  SO: any;
  HBP?: any;
}

interface RawFielder {
  name: string;
  player_id: string;
  Pos: any;
  G: any;
  Inn: any;
  PO: any;
  A: any;
  E: any;
  DP?: any;
  FP?: any;
  RF?: any;
  TZ?: any;
  f_sb_catcher_only?: any;
  f_cs_catcher_only?: any;
  f_cs_perc_catcher_only?: any;
  f_pickoffs_catcher_only?: any;
}

/**
 * Extracts and normalizes batting outcomes into rate-based stats for simulation use.
 * @param batters - Array of raw batter stat objects
 * @returns Normalized batters with outcome probabilities and breakdowns
 */
export function normalizeBattingStats(batters: RawBatter[]): NormalizedBatter[] {
    return batters.map(b => {
      const PA = Number(b.PA) || 0;
      const AB = Number(b.AB) || 0;
      const H = Number(b.H) || 0;
      const HR = Number(b.HR) || 0;
      const BB = Number(b.BB) || 0;
      const SO = Number(b.SO) || 0;
      const SF = Number(b.SF) || 0;
      const HBP = Number(b.HBP) || 0;
      const doubles = Number(b['2B']) || 0;
      const triples = Number(b['3B']) || 0;
      const singles = H - doubles - triples - HR;
  
      const babipDenom = AB - SO - HR + SF;
      const BABIP = babipDenom > 0 ? (H - HR) / babipDenom : null;
  
      const kRate = PA > 0 ? SO / PA : null;
      const bbRate = PA > 0 ? BB / PA : null;
      const hrRate = PA > 0 ? HR / PA : null;

      // Baserunning stats
      const runsBaserunning = Number(b.b_runs_baserunning) || null;
      // Convert baserunning runs to a speed rating (0-100 scale)
      // Positive baserunning runs = faster than average, negative = slower
      // If no baserunning data, use a default speed based on other stats
      let speed = null;
      if (runsBaserunning !== null) {
        speed = Math.max(0, Math.min(100, 50 + (runsBaserunning * 10)));
      } else {
        // Fallback: estimate speed from triples and stolen bases (if available)
        const triples = Number(b['3B']) || 0;
        const doubles = Number(b['2B']) || 0;
        // More triples = faster runner
        speed = Math.max(30, Math.min(80, 50 + (triples * 5) + (doubles * 1)));
      }
  
      return {
        name: b.name,
        player_id: b.player_id,
        PA,
        stats: {
          H, HR, BB, SO, SF, HBP, singles, doubles, triples
        },
        rates: {
          kRate,
          bbRate,
          hrRate,
          BABIP
        },
        baserunning: {
          runsBaserunning,
          speed
        }
      };
    });
}
  
/**
 * Extracts and normalizes pitcher stats for simulation use.
 * @param pitchers - Array of raw pitcher stat objects
 * @returns Normalized pitchers with outcome rates
 */
export function normalizePitchingStats(pitchers: RawPitcher[]): NormalizedPitcher[] {
    return pitchers.map(p => {
      const IP = Number(p.IP) || 0;
      const TBF = Number(p.TBF) || 0;
      const H = Number(p.H) || 0;
      const HR = Number(p.HR) || 0;
      const BB = Number(p.BB) || 0;
      const SO = Number(p.SO) || 0;
      const HBP = Number(p.HBP) || 0;
  
      const kRate = TBF > 0 ? SO / TBF : null;
      const bbRate = TBF > 0 ? BB / TBF : null;
      const hrRate = TBF > 0 ? HR / TBF : null;
  
      // estimate BABIP from hits, HR, SO
      const BIP = TBF - SO - HR - BB - HBP;
      const BABIP = BIP > 0 ? (H - HR) / BIP : null;
  
      return {
        name: p.name,
        player_id: p.player_id,
        TBF,
        stats: {
          IP, H, HR, BB, SO, HBP
        },
        rates: {
          kRate,
          bbRate,
          hrRate,
          BABIP
        }
      };
    });
}
  
/**
 * Extracts and normalizes fielding stats for simulation use.
 * @param fielders - Array of raw fielder stat objects
 * @returns Normalized fielders with defensive stats
 */
export function normalizeFieldingStats(fielders: RawFielder[]): any[] {
    return fielders.map(f => {
      // Catcher-specific stats
      const sbAllowed = Number(f.f_sb_catcher_only) || 0;
      const cs = Number(f.f_cs_catcher_only) || 0;
      const csPct = Number(f.f_cs_perc_catcher_only) || null;
      const pickoffs = Number(f.f_pickoffs_catcher_only) || 0;

      // Calculate arm strength from CS% (higher CS% = better arm)
      // Convert to 0-100 scale where 50 is average
      let armStrength = null;
      if (csPct !== null) {
        armStrength = Math.max(0, Math.min(100, 50 + (csPct - 25) * 2));
      } else {
        // Fallback: estimate arm strength from caught stealing vs stolen bases allowed
        if (sbAllowed > 0 || cs > 0) {
          const csRate = sbAllowed > 0 ? cs / (cs + sbAllowed) : 0.25;
          armStrength = Math.max(20, Math.min(80, 50 + (csRate - 0.25) * 100));
        } else {
          // Default arm strength for catchers without CS data
          armStrength = 50;
        }
      }

      return {
        name: f.name,
        player_id: f.player_id,
        position: f.Pos || '',
        stats: {
          G: Number(f.G) || 0,
          Inn: Number(f.Inn) || 0,
          PO: Number(f.PO) || 0,
          A: Number(f.A) || 0,
          E: Number(f.E) || 0,
          DP: Number(f.DP) || 0,
          FP: typeof f.FP === 'string' ? Number(f.FP) : (typeof f.FP === 'number' ? f.FP : null),
          RF: typeof f.RF === 'string' ? Number(f.RF) : (typeof f.RF === 'number' ? f.RF : null),
          TZ: typeof f.TZ === 'string' ? Number(f.TZ) : (typeof f.TZ === 'number' ? f.TZ : null),
          // Catcher stats
          sbAllowed,
          cs,
          csPct,
          pickoffs,
          armStrength
        }
      };
    });
} 