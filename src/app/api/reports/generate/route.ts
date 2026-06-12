import { NextResponse } from 'next/server';
import { runFullAnalysis } from '@/lib/scraper';

export async function POST() {
  try {
    const result = await runFullAnalysis();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Scraper error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
