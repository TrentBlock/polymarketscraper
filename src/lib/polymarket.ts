const DATA_API_BASE = 'https://data-api.polymarket.com';

export interface LeaderboardUser {
  proxyAddress: string;
  displayName: string;
  profit: number;
  volume: number;
  rank: number;
}

export interface Position {
  assetAddress: string;
  conditionId: string;
  outcome: string;
  size: number;
  marketName: string;
  side: 'LONG' | 'SHORT';
  currentValue: number;
  curPrice: number;
  endDate: string;
}

export interface Activity {
  id: string;
  type: 'TRADE' | 'REDEEM' | 'SPLIT' | 'MERGE';
  user: string;
  amount: number;
  price: number;
  side: 'BUY' | 'SELL';
  marketName: string;
  timestamp: string;
}

export async function getLeaderboard(period: string = 'MONTH', targetTotal: number = 500): Promise<LeaderboardUser[]> {
  const allUsers: LeaderboardUser[] = [];
  let offset = 0;
  const limit = 50; // The API is hard-capped at returning 50 results per request

  while (allUsers.length < targetTotal) {
    const url = `${DATA_API_BASE}/v1/leaderboard?timePeriod=${period.toUpperCase()}&sortBy=profit&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch leaderboard at offset ${offset}: ${res.status} ${text}`);
    }
    const data = await res.json();
    
    if (!data || data.length === 0) {
      break; // No more results available
    }

    const mappedUsers = data.map((item: any) => ({
      proxyAddress: item.proxyWallet,
      displayName: item.userName || item.proxyWallet.slice(0, 8),
      profit: item.pnl,
      volume: item.vol,
      rank: parseInt(item.rank)
    }));

    allUsers.push(...mappedUsers);
    offset += limit;

    // Small delay to prevent rate limiting when paginating
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return allUsers;
}

export async function getUserPositions(userAddress: string): Promise<Position[]> {
  const res = await fetch(`${DATA_API_BASE}/positions?user=${userAddress}`);
  if (!res.ok) throw new Error(`Failed to fetch positions for ${userAddress}`);
  const data = await res.json();
  
  return data.map((item: any) => ({
    assetAddress: item.asset,
    conditionId: item.conditionId,
    outcome: item.outcome,
    size: item.size,
    marketName: item.title,
    side: 'LONG',
    currentValue: item.currentValue || 0,
    curPrice: item.curPrice || 0,
    endDate: item.endDate
  }));
}

export interface MarketStatus {
  closed: boolean;
  outcomePrices: number[];
  outcomes: string[];
}

export async function getMarketStatus(conditionId: string): Promise<MarketStatus | null> {
  try {
    const res = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
    if (!res.ok) return null;
    const market = await res.json();
    if (!market || !market.tokens) return null;
    
    return {
      closed: market.closed === true,
      outcomes: market.tokens.map((t: any) => t.outcome),
      outcomePrices: market.tokens.map((t: any) => parseFloat(t.price)),
    };
  } catch (error) {
    console.error(`Error fetching market status for ${conditionId}:`, error);
    return null;
  }
}

export async function getMarketPrice(conditionId: string, outcome: string): Promise<number | null> {
  try {
    const res = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
    if (!res.ok) return null;
    const market = await res.json();
    if (!market || !market.tokens) return null;
    
    const outcomes: string[] = market.tokens.map((t: any) => t.outcome);
    const outcomePrices: number[] = market.tokens.map((t: any) => parseFloat(t.price));

    const outcomeIndex = outcomes.indexOf(outcome);
    if (outcomeIndex === -1) {
      // Check for case-insensitive match
      const index = outcomes.findIndex((o: string) => o.toLowerCase() === outcome.toLowerCase());
      if (index === -1) return null;
      return outcomePrices[index];
    }
    
    return outcomePrices[outcomeIndex];
  } catch (error) {
    console.error(`Error fetching price for ${conditionId}:`, error);
    return null;
  }
}

export async function getUserActivity(userAddress: string, limit: number = 100): Promise<Activity[]> {
  const res = await fetch(`${DATA_API_BASE}/activity?user=${userAddress}&type=TRADE&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch activity for ${userAddress}`);
  const data = await res.json();
  
  return data.map((item: any) => ({
    id: item.id || Math.random().toString(),
    type: item.type || 'TRADE',
    user: userAddress,
    amount: item.size || 0,
    price: item.price || 0,
    side: item.side || 'BUY',
    marketName: item.title || 'Unknown',
    timestamp: item.timestamp || new Date().toISOString()
  }));
}
