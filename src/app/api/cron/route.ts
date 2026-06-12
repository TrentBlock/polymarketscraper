import { NextResponse } from 'next/server';
import { runFullAnalysis } from '@/lib/scraper';
import { getPaperTrades, savePaperTrades } from '@/lib/paper-trading';
import { getMarketPrice } from '@/lib/polymarket';

export const maxDuration = 300; // 300 seconds (maximum for Vercel Pro/Trial)

export async function GET(request: Request) {
  // Optional: Check for a secret token to prevent unauthorized triggers
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  try {
    console.log('Starting automated daily run...');
    
    // 1. Run the daily analysis and capture new trades
    // (runFullAnalysis also triggers checkTradeSettlements for closed markets automatically)
    const analysisResult = await runFullAnalysis();
    
    // 2. Update current PnL for remaining OPEN paper trades
    const trades = await getPaperTrades();
    
    for (const trade of trades) {
      if (trade.status !== 'OPEN' || !trade.conditionId) continue;
      
      const currentPrice = await getMarketPrice(trade.conditionId, trade.outcome);
      
      if (currentPrice !== null) {
        // Calculate PnL: (currentPrice - entryPrice) * (amount / entryPrice)
        // amount / entryPrice is the number of shares bought
        const shares = trade.amount / trade.entryPrice;
        const currentPnL = (currentPrice - trade.entryPrice) * shares;
        trade.pnl = currentPnL;
      }
      
      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await savePaperTrades(trades);
    
    return NextResponse.json({ 
      success: true, 
      ...analysisResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

