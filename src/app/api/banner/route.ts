export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      const banner = await prisma.banner.findUnique({
        where: { id: bannerId },
      });
      if (!banner) {
        return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
      }
      return NextResponse.json({ banner }, { headers: corsHeaders });
    }

    const banners = await prisma.banner.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ banners, total: banners.length }, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to fetch banners:", error);
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

    const newBanner = await prisma.banner.create({
      data: { url },
    });

    return NextResponse.json({ success: true, banner: newBanner }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error("Failed to add banner:", error);
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

    const banner = await prisma.banner.update({
      where: { id },
      data: { url },
    });

    return NextResponse.json({ success: true, banner }, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to update banner:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
    }
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

    const deletedBanner = await prisma.banner.delete({
      where: { id: bannerId },
    });

    return NextResponse.json(
      { success: true, message: "Banner deleted", banner: deletedBanner },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Failed to delete banner:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Banner not found" }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json({ error: "Failed to delete banner" }, { status: 500, headers: corsHeaders });
  }
}
