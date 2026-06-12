import { NextResponse } from 'next/server';
import { getPaperTrades } from '@/lib/paper-trading';

export async function GET() {
  try {
    const trades = await getPaperTrades();
    return NextResponse.json(trades);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
