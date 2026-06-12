import { getLeaderboard } from './polymarket';
import { analyzeUntilQuota, generateMarkdownReport } from './analysis';
import { addPaperTrade, getPaperTrades, checkTradeSettlements } from './paper-trading';
import { put } from '@vercel/blob';

export async function capturePaperTrades(consensusTrades: any[]) {
  // Automation: Capture High-Conviction Paper Trades (>70%)
  const highConvictionTrades = consensusTrades.filter(t => t.averageConviction > 0.7);
  const existingTrades = await getPaperTrades();

  for (const trade of highConvictionTrades) {
    // Check if we already have this exact trade open
    const isDuplicate = existingTrades.find(t =>
      t.marketName === trade.marketName &&
      t.outcome === trade.outcome &&
      t.status === 'OPEN'
    );

    if (!isDuplicate) {
      await addPaperTrade({
        marketName: trade.marketName,
        outcome: trade.outcome,
        entryPrice: trade.averagePrice,
        amount: 1000, // Static risk $$
        conviction: trade.averageConviction,
        timestamp: new Date().toISOString(),
        endDate: trade.endDate,
        conditionId: trade.conditionId
      });
    }
  }

  return highConvictionTrades.length;
}

export async function runFullAnalysis() {
  // Fetch up to 500 users using pagination
  const leaderboard = await getLeaderboard('MONTH', 500);

  // Process until we hit 75 real users
  const result = await analyzeUntilQuota(leaderboard, 75);
  const markdown = generateMarkdownReport(result);

  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  
  // Save to Vercel Blob instead of local fs
  await put(`reports/${filename}`, markdown, {
    access: 'public',
    addRandomSuffix: false
  });

  const paperTradesCaptured = await capturePaperTrades(result.consensusTrades);

  // Update settlements for paper trades whenever analysis runs
  await checkTradeSettlements();

  return { filename, paperTradesCaptured };
}
