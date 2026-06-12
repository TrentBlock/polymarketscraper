import { Activity, LeaderboardUser, Position, getUserActivity, getUserPositions } from './polymarket';

export interface ScraperResult {
  timestamp: string;
  totalAnalyzed: number;
  realUsers: AnalyzedUser[];
  bots: AnalyzedUser[];
  consensusTrades: ConsensusTrade[];
  macroCategories: MacroCategory[];
}

export interface AnalyzedPosition extends Position {
  convictionScore: number;
  isHedge: boolean;
  daysToExpiration: number;
  macroTag: string;
}

export interface AnalyzedUser {
  address: string;
  displayName: string;
  profit: number;
  volume: number;
  isBot: boolean;
  botReason?: string;
  portfolioValue: number;
  positions: AnalyzedPosition[];
  allPositionsCount: number;
}

export interface ConsensusTrade {
  marketName: string;
  outcome: string;
  userCount: number;
  users: string[];
  totalSize: number;
  endDate: string;
  averageConviction: number;
  averagePrice: number;
  macroTag: string;
  conditionId: string;
}

export interface MacroCategory {
  tag: string;
  totalConviction: number;
  userCount: number;
  trades: ConsensusTrade[];
}

function assignMacroTag(marketName: string): string {
  const lower = marketName.toLowerCase();
  if (lower.match(/bitcoin|btc|ethereum|eth|solana|sol|crypto/)) return 'Crypto';
  if (lower.match(/election|trump|biden|democrat|republican|senate|house/)) return 'Politics (US)';
  if (lower.match(/fed|inflation|rate|gdp|economy/)) return 'Macro Economics';
  if (lower.match(/nba|lakers|celtics|basketball/)) return 'Sports (NBA)';
  if (lower.match(/nhl|hockey|stanley cup/)) return 'Sports (NHL)';
  if (lower.match(/soccer|champions league|premier|madrid|psg|messi|mbappe/)) return 'Sports (Soccer)';
  if (lower.match(/atp|wta|tennis|garros|wimbledon/)) return 'Sports (Tennis)';
  if (lower.match(/movie|box office|oscars|grammys|marvel/)) return 'Pop Culture / Media';
  return 'Other';
}

export async function analyzeUntilQuota(
  users: LeaderboardUser[], 
  quota: number = 75,
  onProgress?: (currentRealUsers: number, target: number, currentUserBeingChecked: string) => void
): Promise<ScraperResult> {
  const bots: AnalyzedUser[] = [];
  const realUsers: AnalyzedUser[] = [];
  const now = new Date();
  let analyzedCount = 0;

  for (const user of users) {
    if (realUsers.length >= quota) break;
    
    analyzedCount++;
    if (onProgress) {
      onProgress(realUsers.length, quota, user.displayName || user.proxyAddress.slice(0, 8));
    }
    
    try {
      const [allPositions, activity] = await Promise.all([
        getUserPositions(user.proxyAddress),
        getUserActivity(user.proxyAddress, 500)
      ]);

      // Filter for strictly active positions
      const activePositions = allPositions.filter(pos => {
        const endDate = pos.endDate ? new Date(pos.endDate) : null;
        const isFuture = !endDate || endDate > now;
        const value = pos.currentValue || (pos.size * pos.curPrice) || 0;
        return isFuture && value > 0;
      });

      // Calculate Total Portfolio Value for Conviction Weighting
      const portfolioValue = activePositions.reduce((sum, pos) => sum + (pos.currentValue || (pos.size * pos.curPrice) || 0), 0);

      // Enrich positions with advanced metrics
      const enrichedPositions: AnalyzedPosition[] = activePositions.map(pos => {
        // 1. Hedging / Dutching Check (multiple legs of the same conditionId)
        const conditionMatches = activePositions.filter(p => p.conditionId === pos.conditionId);
        const isHedge = conditionMatches.length > 1;

        // 2. Conviction Score
        const value = pos.currentValue || (pos.size * pos.curPrice) || 0;
        const convictionScore = portfolioValue > 0 ? (value / portfolioValue) : 0;

        // 3. Time Decay / Capital Parking
        const daysToExpiration = pos.endDate ? (new Date(pos.endDate).getTime() - now.getTime()) / (1000 * 3600 * 24) : 999;

        // 4. Macro Tag
        const macroTag = assignMacroTag(pos.marketName);

        return { ...pos, convictionScore, isHedge, daysToExpiration, macroTag };
      });

      const botCheck = checkIsBot(user, allPositions, activity);
      
      const analyzedUser: AnalyzedUser = {
        address: user.proxyAddress,
        displayName: user.displayName,
        profit: user.profit,
        volume: user.volume,
        isBot: botCheck.isBot,
        botReason: botCheck.reason,
        portfolioValue,
        positions: enrichedPositions,
        allPositionsCount: allPositions.length
      };

      if (analyzedUser.isBot) {
        bots.push(analyzedUser);
      } else {
        realUsers.push(analyzedUser);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`Error analyzing user ${user.proxyAddress}:`, error);
    }
  }

  const { consensusTrades, macroCategories } = findConsensusAndMacro(realUsers);

  return {
    timestamp: now.toISOString(),
    totalAnalyzed: analyzedCount,
    realUsers,
    bots,
    consensusTrades,
    macroCategories
  };
}

function checkIsBot(user: LeaderboardUser, allPositions: Position[], activity: Activity[]): { isBot: boolean; reason?: string } {
  const roi = user.profit / (user.volume || 1);
  if (user.volume > 250000 && roi < 0.03 && activity.length > 50) {
     return { isBot: true, reason: `Market Maker: High volume ($${user.volume.toLocaleString()}), low ROI (${(roi * 100).toFixed(2)}%)` };
  }
  const uniqueMarkets = new Set(activity.map(a => a.marketName)).size;
  if (uniqueMarkets > 40 && activity.length > 100) {
    return { isBot: true, reason: `High Churn: Traded in ${uniqueMarkets} different markets recently` };
  }
  if (allPositions.length > 40) {
    return { isBot: true, reason: `Low Focus: Holding ${allPositions.length} different positions simultaneously` };
  }
  if (activity.length >= 450) {
    return { isBot: true, reason: `High Density: Near-constant trading activity` };
  }
  return { isBot: false };
}

function findConsensusAndMacro(users: AnalyzedUser[]): { consensusTrades: ConsensusTrade[], macroCategories: MacroCategory[] } {
  const tradeMap: Record<string, ConsensusTrade & { convictionSum: number, priceSum: number }> = {};

  for (const user of users) {
    for (const pos of user.positions) {
      // APPLY ADVANCED FILTERS
      // 1. Filter out Hedging/Arbitrage
      if (pos.isHedge) continue;
      
      // 2. Filter out Capital Parking (Only keep actionable trades <= 45 days)
      if (pos.daysToExpiration > 45) continue;

      // 3. Filter out low conviction noise (Requires at least 2% of portfolio)
      if (pos.convictionScore < 0.02) continue;

      const key = `${pos.marketName}|${pos.outcome}`;
      if (!tradeMap[key]) {
        tradeMap[key] = {
          marketName: pos.marketName,
          outcome: pos.outcome,
          userCount: 0,
          users: [],
          totalSize: 0,
          endDate: pos.endDate,
          averageConviction: 0,
          convictionSum: 0,
          averagePrice: 0,
          priceSum: 0,
          macroTag: pos.macroTag,
          conditionId: pos.conditionId
        };
      }
      tradeMap[key].userCount++;
      tradeMap[key].users.push(user.displayName || user.address);
      tradeMap[key].totalSize += (pos.currentValue || (pos.size * pos.curPrice) || 0);
      tradeMap[key].convictionSum += pos.convictionScore;
      tradeMap[key].priceSum += (pos.curPrice || 0);
    }
  }

  // Finalize directional trades
  const consensusTrades = Object.values(tradeMap)
    .filter(t => t.userCount >= 2) // At least 2 users agree
    .map(t => {
      t.averageConviction = t.convictionSum / t.userCount;
      t.averagePrice = t.priceSum / t.userCount;
      return t as ConsensusTrade;
    })
    .sort((a, b) => b.averageConviction - a.averageConviction); // Sort by highest conviction

  // Build Macro Categories
  const macroMap: Record<string, MacroCategory> = {};
  for (const trade of consensusTrades) {
    if (!macroMap[trade.macroTag]) {
      macroMap[trade.macroTag] = {
        tag: trade.macroTag,
        totalConviction: 0,
        userCount: 0,
        trades: []
      };
    }
    macroMap[trade.macroTag].trades.push(trade);
    macroMap[trade.macroTag].totalConviction += trade.averageConviction;
    // Estimate unique users in this macro trend
    macroMap[trade.macroTag].userCount = new Set([...macroMap[trade.macroTag].trades.flatMap(t => t.users)]).size;
  }

  const macroCategories = Object.values(macroMap)
    .sort((a, b) => b.totalConviction - a.totalConviction);

  return { consensusTrades, macroCategories };
}

export function generateMarkdownReport(result: ScraperResult): string {
  let md = `# Institutional Money Flow & Consensus Report - ${new Date(result.timestamp).toLocaleString()}\n\n`;
  
  md += `## Report Parameters\n`;
  md += `- **Real Users Sampled:** ${result.realUsers.length}\n`;
  md += `- **Leaderboard Depth Searched:** ${result.totalAnalyzed}\n`;
  md += `- **Filters Applied:** Excluded Hedged/Dutch positions, excluded long-term capital parking (>45 Days), filtered low-conviction noise (<2% portfolio).\n\n`;

  md += `## Macro Confluence (Sector Trends)\n`;
  md += `*Broad sector trends showing where concentrated capital is moving across multiple related markets.*\n\n`;
  
  if (result.macroCategories.length === 0) {
    md += `No dominant macro trends found.\n\n`;
  } else {
    result.macroCategories.forEach(cat => {
      md += `### 🔹 ${cat.tag} (Active Traders: ${cat.userCount})\n`;
      md += `| Specific Market | Direction | End Date | Avg Conviction | Total Capital |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      cat.trades.forEach(trade => {
        const dateStr = trade.endDate ? new Date(trade.endDate).toLocaleDateString() : 'N/A';
        md += `| ${trade.marketName} | **${trade.outcome}** | ${dateStr} | ${(trade.averageConviction * 100).toFixed(1)}% | $${trade.totalSize.toLocaleString(undefined, {maximumFractionDigits: 0})} |\n`;
      });
      md += `\n`;
    });
  }

  md += `## High-Conviction Directional Trades\n`;
  md += `*Isolated, short-term markets where multiple top users have high portfolio concentration.*\n\n`;
  
  if (result.consensusTrades.length === 0) {
    md += `No high-conviction short-term consensus trades found.\n`;
  } else {
    md += `| Market | Outcome | Conviction | Agreeing Users | Capital |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    result.consensusTrades.slice(0, 30).forEach(trade => {
      md += `| ${trade.marketName} | **${trade.outcome}** | ${(trade.averageConviction * 100).toFixed(1)}% | ${trade.userCount} | $${trade.totalSize.toLocaleString(undefined, {maximumFractionDigits: 0})} |\n`;
    });
  }
  md += `\n`;

  md += `## Top Real Users (Sample)\n`;
  md += `| User | PNL | Portfolio Size | Focus Ratio (Active/Total) |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  result.realUsers.slice(0, 20).forEach(user => {
    md += `| ${user.displayName || user.address.slice(0, 8)} | $${user.profit.toLocaleString(undefined, {maximumFractionDigits: 0})} | $${user.portfolioValue.toLocaleString(undefined, {maximumFractionDigits: 0})} | ${user.positions.filter(p => !p.isHedge).length} Direct / ${user.allPositionsCount} Total |\n`;
  });
  md += `\n`;

  return md;
}
