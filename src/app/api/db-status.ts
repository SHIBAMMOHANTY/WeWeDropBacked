import { NextResponse } from 'next/server';
import { checkConnection } from '@/config/db.config';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const status = await checkConnection();
    return NextResponse.json(status, { headers: corsHeaders });
  } catch (error) {
    console.error("GET /api/db-status error:", error);
    return NextResponse.json({ connected: false, message: 'Database status check failed' }, { status: 500, headers: corsHeaders });
  }
}
