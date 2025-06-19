/**
 * @fileoverview Computes derived statistics and normalization for batter and pitcher stat tables.
 */

/**
 * Extracts and normalizes batting outcomes into rate-based stats for simulation use.
 * @param {Object[]} batters - Raw player batting stats
 * @returns {Object[]} Normalized batters with outcome probabilities and breakdowns
 */
export function normalizeBattingStats(batters) {
    return batters.map(b => {
      const PA = Number(b.PA) || 0
      const AB = Number(b.AB) || 0
      const H = Number(b.H) || 0
      const HR = Number(b.HR) || 0
      const BB = Number(b.BB) || 0
      const SO = Number(b.SO) || 0
      const SF = Number(b.SF) || 0
      const HBP = Number(b.HBP) || 0
      const doubles = Number(b['2B']) || 0
      const triples = Number(b['3B']) || 0
      const singles = H - doubles - triples - HR
  
      const babipDenom = AB - SO - HR + SF
      const BABIP = babipDenom > 0 ? (H - HR) / babipDenom : null
  
      const kRate = PA > 0 ? SO / PA : null
      const bbRate = PA > 0 ? BB / PA : null
      const hrRate = PA > 0 ? HR / PA : null
  
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
        }
      }
    })
  }
  
  /**
   * Extracts and normalizes pitcher stats for simulation use.
   * @param {Object[]} pitchers - Raw player pitching stats
   * @returns {Object[]} Normalized pitchers with outcome rates
   */
  export function normalizePitchingStats(pitchers) {
    return pitchers.map(p => {
      const IP = Number(p.IP) || 0
      const TBF = Number(p.TBF) || 0
      const H = Number(p.H) || 0
      const HR = Number(p.HR) || 0
      const BB = Number(p.BB) || 0
      const SO = Number(p.SO) || 0
      const HBP = Number(p.HBP) || 0
  
      const kRate = TBF > 0 ? SO / TBF : null
      const bbRate = TBF > 0 ? BB / TBF : null
      const hrRate = TBF > 0 ? HR / TBF : null
  
      // estimate BABIP from hits, HR, SO
      const BIP = TBF - SO - HR - BB - HBP
      const BABIP = BIP > 0 ? (H - HR) / BIP : null
  
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
      }
    })
  }
  