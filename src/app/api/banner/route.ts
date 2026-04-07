export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory banner image URL (replace with DB or file storage in production)
let bannerImageUrl: string = "";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// GET: Return current banner image URL
export async function GET() {
  return NextResponse.json({ bannerImageUrl }, { headers: corsHeaders });
}

// PATCH: Update banner image URL
// Body: { url: string }
export async function PATCH(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400, headers: corsHeaders });
    }
    bannerImageUrl = url;
    return NextResponse.json({ success: true, bannerImageUrl }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update banner image" }, { status: 500, headers: corsHeaders });
  }
}
