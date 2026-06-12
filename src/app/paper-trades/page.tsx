'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Clock, DollarSign, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PaperTrade } from '@/lib/paper-trading';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function PaperTradesPage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/paper-trades');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTrades(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckTrades = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/paper-trades/check', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchTrades(); // Refresh the list
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = trades.filter(t => t.status === 'WON').length / (trades.filter(t => t.status !== 'OPEN').length || 1);
  const openTrades = trades.filter(t => t.status === 'OPEN').length;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 p-8 relative pb-24">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/" className="text-blue-500 hover:text-blue-600 flex items-center gap-1 mb-2 transition-colors">
              <ArrowLeft size={16} />
              Back to Scraper
            </Link>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <DollarSign className="text-green-500" size={32} />
              Paper Trading Dashboard
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-gray-500 dark:text-gray-400">
                Automated high-conviction trades (Over 70% average portfolio weight from top traders).
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border dark:border-gray-800 shadow-sm">
              <div className="text-sm text-gray-500 uppercase font-semibold">Total PnL</div>
              <div className={cn("text-2xl font-bold", totalPnL >= 0 ? "text-green-500" : "text-red-500")}>
                ${totalPnL.toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border dark:border-gray-800 shadow-sm">
              <div className="text-sm text-gray-500 uppercase font-semibold">Win Rate</div>
              <div className="text-2xl font-bold text-blue-500">
                {(winRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border dark:border-gray-800 shadow-sm">
              <div className="text-sm text-gray-500 uppercase font-semibold">Open Trades</div>
              <div className="text-2xl font-bold">
                {openTrades}
              </div>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 p-4 rounded-lg text-red-700">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((trade) => (
              <div key={trade.id} className="bg-white dark:bg-zinc-900 rounded-xl border dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-3">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold uppercase",
                      trade.status === 'OPEN' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      trade.status === 'WON' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}>
                      {trade.status}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(trade.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg leading-tight mb-2">{trade.marketName}</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-sm font-semibold",
                      trade.outcome.toLowerCase() === 'yes' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {trade.outcome}
                    </span>
                    <span className="text-gray-400 text-sm">@ ${(trade.entryPrice * 100).toFixed(1)}¢</span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-500">
                      <span>Conviction Score</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{(trade.conviction * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Simulated Risk</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">${trade.amount.toLocaleString()}</span>
                    </div>
                    {trade.endDate && (
                      <div className="flex justify-between text-gray-500">
                        <span>Resolution Date</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{new Date(trade.endDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className={cn(
                  "px-5 py-3 border-t dark:border-gray-800 flex items-center justify-between font-bold",
                  trade.status === 'WON' ? "text-green-500" : trade.status === 'LOST' ? "text-red-500" : "text-blue-500"
                )}>
                  <span>{trade.status === 'OPEN' ? 'Estimated PnL' : 'Final PnL'}</span>
                  <div className="flex items-center gap-1">
                    {trade.status === 'WON' ? <TrendingUp size={16} /> : trade.status === 'LOST' ? <TrendingDown size={16} /> : null}
                    ${(trade.pnl || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
            {trades.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500">
                No paper trades yet. High conviction trades will appear here automatically after analysis.
              </div>
            )}
          </div>
        )}
      </div>

      <button 
        onClick={handleCheckTrades} 
        disabled={isChecking || isLoading}
        className="fixed bottom-8 right-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-all transform hover:scale-105 z-50"
      >
        {isChecking ? <Loader2 className="animate-spin" size={20} /> : <Clock size={20} />}
        Check Current Trades
      </button>
    </main>
  );
}
