import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'reports/' });
    
    const files = blobs
      .map(blob => blob.pathname.replace('reports/', ''))
      .filter(file => file.endsWith('.md'))
      .sort()
      .reverse(); // Newest first
    
    return NextResponse.json(files);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
