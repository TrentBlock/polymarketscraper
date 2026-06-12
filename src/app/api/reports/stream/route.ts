import { NextRequest } from 'next/server';
import { getLeaderboard } from '@/lib/polymarket';
import { analyzeUntilQuota, generateMarkdownReport } from '@/lib/analysis';
import { capturePaperTrades } from '@/lib/scraper';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds (maximum for Vercel Hobby plan)

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (progress: number, status: string, error?: string, filename?: string) => {
        if (isClosed) return;
        const data = JSON.stringify({ progress, status, error, filename });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        sendUpdate(5, 'Fetching leaderboard data...');
        const leaderboard = await getLeaderboard('MONTH', 1000);
        
        sendUpdate(10, 'Leaderboard fetched. Starting analysis...');

        const result = await analyzeUntilQuota(leaderboard, 75, (current, target, user) => {
          // Progress callback from analysis
          if (isClosed) return;
          // Calculate progress from 10% to 90% based on how close we are to target real users
          const percent = 10 + Math.floor((current / target) * 80);
          sendUpdate(percent, `Analyzing users (${current}/${target} real users found)... Check: ${user}`);
        });

        if (isClosed) return;

        sendUpdate(90, 'Generating Markdown report...');
        const markdown = generateMarkdownReport(result);
        
        const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
        
        await put(`reports/${filename}`, markdown, {
          access: 'public',
          addRandomSuffix: false
        });
        
        // Automation: Capture High-Conviction Paper Trades (>70%)
        await capturePaperTrades(result.consensusTrades);
        
        sendUpdate(100, 'Complete!', undefined, filename);
      } catch (error) {
        console.error('Stream error:', error);
        sendUpdate(0, 'Failed', (error as Error).message);
      } finally {
        if (!isClosed) {
          controller.close();
        }
      }
    },
    cancel() {
      isClosed = true;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
