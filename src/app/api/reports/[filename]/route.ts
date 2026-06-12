import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const { blobs } = await list({ prefix: `reports/${filename}` });
    
    if (blobs.length === 0) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    const res = await fetch(blobs[0].url);
    if (!res.ok) {
       return NextResponse.json({ error: 'Failed to fetch blob content' }, { status: 500 });
    }
    
    const content = await res.text();
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
