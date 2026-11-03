export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const paymentMethod = searchParams.get("paymentMethod")?.trim() || "";
    const initiatedById = searchParams.get("initiatedById")?.trim() || searchParams.get("agentId")?.trim() || "";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (initiatedById) {
      where.initiatedById = initiatedById;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (paymentMethod && paymentMethod !== "ALL") {
      where.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { vendorName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { upiId: { contains: search, mode: "insensitive" } },
        { accountNumber: { contains: search } },
        { utr: { contains: search, mode: "insensitive" } },
        { transferId: { contains: search, mode: "insensitive" } },
        { cfReferenceId: { contains: search, mode: "insensitive" } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.financePayout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.financePayout.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        transactions,
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("GET /api/finance/transactions Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch finance transactions" },
      { status: 500, headers: corsHeaders }
    );
  }
}

