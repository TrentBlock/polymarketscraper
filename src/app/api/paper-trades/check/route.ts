import { NextResponse } from 'next/server';
import { checkTradeSettlements } from '@/lib/paper-trading';

export async function POST() {
  try {
    await checkTradeSettlements();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Check settlements error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
