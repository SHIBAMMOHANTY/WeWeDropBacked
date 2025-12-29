import { NextResponse } from 'next/server';
import { checkConnection } from '@/config/db.config';

export async function GET() {
  const status = await checkConnection();
  return NextResponse.json(status);
}
