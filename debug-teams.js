import { getAvailableTeams, loadTeamFile } from './src/utils/dataLoader.js';

async function debugTeams() {
  try {
    console.log('🔍 Debugging team loading...');
    
    // Test getting available teams
    console.log('📋 Getting available teams...');
    const teams = await getAvailableTeams();
    console.log(`Found ${teams.length} teams:`, teams.slice(0, 5), '...');
    
    // Test loading a specific team
    if (teams.length > 0) {
      const testTeam = teams[0];
      console.log(`\n🧪 Testing team loading for: ${testTeam}`);
      
      const teamData = await loadTeamFile(testTeam);
      console.log(`✅ Successfully loaded ${testTeam}:`);
      console.log(`   Batters: ${teamData.batters.length}`);
      console.log(`   Pitchers: ${teamData.pitchers.length}`);
      console.log(`   Fielders: ${teamData.fielders.length}`);
      
      if (teamData.batters.length > 0) {
        console.log(`   First batter: ${teamData.batters[0].name}`);
      }
      if (teamData.pitchers.length > 0) {
        console.log(`   First pitcher: ${teamData.pitchers[0].name}`);
      }
    }
    
    // Test loading CHC and CHW specifically
    console.log('\n🧪 Testing CHC and CHW specifically...');
    try {
      const chc = await loadTeamFile('CHC-2025');
      console.log(`✅ CHC loaded: ${chc.batters.length} batters, ${chc.pitchers.length} pitchers`);
    } catch (e) {
      console.log(`❌ CHC failed:`, e && typeof e === 'object' && 'message' in e ? e.message : String(e));
    }
    
    try {
      const chw = await loadTeamFile('CHW-2025');
      console.log(`✅ CHW loaded: ${chw.batters.length} batters, ${chw.pitchers.length} pitchers`);
    } catch (e) {
      console.log(`❌ CHW failed:`, e && typeof e === 'object' && 'message' in e ? e.message : String(e));
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugTeams(); 