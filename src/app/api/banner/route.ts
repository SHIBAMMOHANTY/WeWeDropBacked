export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory banner image URL (replace with DB or file storage in production)
let bannerImageUrl: string = "";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// POST: Set banner image URL (same as PATCH)
// Body: { url: string }
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400, headers: corsHeaders });
    }
    bannerImageUrl = url;
    return NextResponse.json({ success: true, bannerImageUrl }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to set banner image" }, { status: 500, headers: corsHeaders });
  }
}

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

// DELETE: Remove banner image URL
export async function DELETE() {
  bannerImageUrl = "";
  return NextResponse.json({ success: true, message: "Banner image deleted" }, { headers: corsHeaders });
}
