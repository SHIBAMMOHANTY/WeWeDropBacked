export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory banner storage (replace with DB in production)
interface Banner {
  id: string;
  url: string;
  createdAt: string;
}

let banners: Banner[] = [];
let bannerIdCounter = 1;

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// GET: Return all banners
// Query: ?id=<bannerId> (optional) - return specific banner
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bannerId = searchParams.get("id");

    if (bannerId) {
      const banner = banners.find((b) => b.id === bannerId);
      if (!banner) {
        return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
      }
      return NextResponse.json({ banner }, { headers: corsHeaders });
    }

    return NextResponse.json({ banners, total: banners.length }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch banners" }, { status: 500, headers: corsHeaders });
  }
}

// POST: Add a new banner
// Body: { url: string }
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400, headers: corsHeaders });
    }

    const newBanner: Banner = {
      id: `banner_${bannerIdCounter++}`,
      url,
      createdAt: new Date().toISOString(),
    };

    banners.push(newBanner);
    return NextResponse.json({ success: true, banner: newBanner }, { status: 201, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add banner" }, { status: 500, headers: corsHeaders });
  }
}

// PATCH: Update a specific banner
// Body: { id: string, url: string }
export async function PATCH(req: NextRequest) {
  try {
    const { id, url } = await req.json();
    if (!id || !url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid ID or URL" }, { status: 400, headers: corsHeaders });
    }

    const bannerIndex = banners.findIndex((b) => b.id === id);
    if (bannerIndex === -1) {
      return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
    }

    banners[bannerIndex].url = url;
    return NextResponse.json({ success: true, banner: banners[bannerIndex] }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update banner" }, { status: 500, headers: corsHeaders });
  }
}

// DELETE: Remove a specific banner
// Query: ?id=<bannerId>
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bannerId = searchParams.get("id");

    if (!bannerId) {
      return NextResponse.json({ error: "Banner ID required" }, { status: 400, headers: corsHeaders });
    }

    const bannerIndex = banners.findIndex((b) => b.id === bannerId);
    if (bannerIndex === -1) {
      return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
    }

    const deletedBanner = banners.splice(bannerIndex, 1)[0];
    return NextResponse.json({ success: true, message: "Banner deleted", banner: deletedBanner }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete banner" }, { status: 500, headers: corsHeaders });
  }
}
