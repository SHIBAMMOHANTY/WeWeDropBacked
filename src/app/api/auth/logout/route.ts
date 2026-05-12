import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/tokenBlacklist";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer "))
      return NextResponse.json({ error: "No token provided" }, { status: 400, headers: corsHeaders });

    const token = auth.split(" ")[1];
    revokeToken(token);
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500, headers: corsHeaders });
  }
}
