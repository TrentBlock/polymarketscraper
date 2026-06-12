import { put, list } from '@vercel/blob';
import { getMarketStatus } from './polymarket';

export interface PaperTrade {
  id: string;
  marketName: string;
  outcome: string;
  entryPrice: number; // 0-1
  amount: number; // Simulated size in USD
  conviction: number;
  timestamp: string;
  endDate: string;
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED';
  pnl?: number;
  conditionId?: string;
}

export async function getPaperTrades(): Promise<PaperTrade[]> {
  try {
    const { blobs } = await list({ prefix: 'paper-trades.json' });
    if (blobs.length === 0) return [];
    
    // We sort descending by uploadedAt to get the latest, though addRandomSuffix: false should keep it to 1
    const latestBlob = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
    const res = await fetch(latestBlob.url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('Error fetching paper trades from Blob:', e);
    return [];
  }
}

export async function savePaperTrades(trades: PaperTrade[]) {
  try {
    await put('paper-trades.json', JSON.stringify(trades, null, 2), {
      access: 'public',
      addRandomSuffix: false // Overwrite the same file
    });
  } catch (e) {
    console.error('Error saving paper trades to Blob:', e);
  }
}

export async function addPaperTrade(trade: Omit<PaperTrade, 'id' | 'status'>) {
  const trades = await getPaperTrades();
  const newTrade: PaperTrade = {
    ...trade,
    id: Math.random().toString(36).substring(2, 15),
    status: 'OPEN'
  };
  trades.push(newTrade);
  await savePaperTrades(trades);
  return newTrade;
}

export async function updateTradeStatus(id: string, status: PaperTrade['status'], pnl?: number) {
  const trades = await getPaperTrades();
  const index = trades.findIndex(t => t.id === id);
  if (index !== -1) {
    trades[index].status = status;
    if (pnl !== undefined) {
      trades[index].pnl = pnl;
    }
    await savePaperTrades(trades);
  }
}

export async function checkTradeSettlements() {
  const trades = await getPaperTrades();
  let updated = false;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    if (trade.status !== 'OPEN' || !trade.conditionId) {
      continue;
    }

    const marketStatus = await getMarketStatus(trade.conditionId);
    if (marketStatus && marketStatus.closed) {
      // Market is closed, determine if won or lost
      const outcomeIndex = marketStatus.outcomes.findIndex(o => o.toLowerCase() === trade.outcome.toLowerCase());
      if (outcomeIndex !== -1) {
        const finalPrice = marketStatus.outcomePrices[outcomeIndex];
        // Polymarket resolves to 1 for win, 0 for loss.
        if (finalPrice > 0.99) {
          trade.status = 'WON';
          trade.pnl = (trade.amount / trade.entryPrice) - trade.amount;
          updated = true;
        } else if (finalPrice < 0.01) {
          trade.status = 'LOST';
          trade.pnl = -trade.amount;
          updated = true;
        } else {
          trade.status = 'CANCELLED';
          trade.pnl = 0;
          updated = true;
        }
      }
    }
  }

  if (updated) {
    await savePaperTrades(trades);
  }
}

