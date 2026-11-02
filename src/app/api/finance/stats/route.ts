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
    const allPayouts = await prisma.financePayout.findMany({
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalDisbursed = 0;
    let todayDisbursed = 0;
    let monthDisbursed = 0;
    let upiAmount = 0;
    let bankAmount = 0;
    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    // Daily breakdown for graph: last 14 days
    const dailyMap = new Map<string, { date: string; amount: number; count: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      dailyMap.set(dateKey, { date: dateKey, amount: 0, count: 0 });
    }

    allPayouts.forEach((p) => {
      const isSuccess = p.status === "SUCCESS" || p.status === "RECEIVED" || p.status === "QUEUED";
      const pDate = new Date(p.createdAt);

      if (isSuccess) {
        totalDisbursed += p.amount;
        if (pDate >= startOfToday) todayDisbursed += p.amount;
        if (pDate >= startOfMonth) monthDisbursed += p.amount;

        if (p.paymentMethod === "UPI") upiAmount += p.amount;
        else bankAmount += p.amount;

        successCount++;

        const dateKey = pDate.toISOString().slice(0, 10);
        if (dailyMap.has(dateKey)) {
          const item = dailyMap.get(dateKey)!;
          item.amount += p.amount;
          item.count += 1;
        }
      } else if (p.status === "FAILED" || p.status === "REJECTED") {
        failedCount++;
      } else {
        pendingCount++;
      }
    });

    const totalCount = allPayouts.length;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;
    const chartData = Array.from(dailyMap.values());

    return NextResponse.json(
      {
        success: true,
        stats: {
          totalDisbursed,
          todayDisbursed,
          monthDisbursed,
          totalCount,
          successCount,
          failedCount,
          pendingCount,
          successRate,
          upiAmount,
          bankAmount,
          chartData,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("GET /api/finance/stats Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to calculate finance statistics" },
      { status: 500, headers: corsHeaders }
    );
  }
}

