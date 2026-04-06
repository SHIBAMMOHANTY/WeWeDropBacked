export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory banner image URL (replace with DB or file storage in production)
let bannerImageUrl: string = "";

// GET: Return current banner image URL
export async function GET() {
  return NextResponse.json({ bannerImageUrl });
}

// PATCH: Update banner image URL
// Body: { url: string }
export async function PATCH(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    bannerImageUrl = url;
    return NextResponse.json({ success: true, bannerImageUrl });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update banner image" }, { status: 500 });
  }
}
