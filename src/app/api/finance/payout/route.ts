export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initiateCashfreePayout } from "@/lib/cashfreePayout";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vendorName,
      phone,
      paymentMethod,
      upiId,
      accountNumber,
      ifsc,
      amount,
      remarks,
      initiatedById,
      initiatedByName,
    } = body;

    // Validation
    const cleanVendorName = (vendorName || "").toString().trim();
    if (!cleanVendorName) {
      return NextResponse.json(
        { success: false, error: "Vendor / Beneficiary Name is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid payout amount greater than ₹0." },
        { status: 400, headers: corsHeaders }
      );
    }

    const mode = (paymentMethod || "UPI").toString().toUpperCase() === "BANK_TRANSFER"
      ? "BANK_TRANSFER"
      : "UPI";

    const cleanPhone = (phone || "").toString().replace(/\D/g, "").slice(-10) || "9999999999";
    const cleanRemarks = (remarks || "Vendor Payment").toString().slice(0, 70);

    if (mode === "UPI") {
      const cleanUpi = (upiId || "").toString().trim();
      if (!cleanUpi || !cleanUpi.includes("@")) {
        return NextResponse.json(
          { success: false, error: "A valid UPI ID (e.g. name@okhdfcbank) is required for UPI payout." },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      const cleanAcc = (accountNumber || "").toString().trim();
      const cleanIfsc = (ifsc || "").toString().trim().toUpperCase();
      if (!cleanAcc || cleanAcc.length < 6) {
        return NextResponse.json(
          { success: false, error: "A valid Bank Account Number is required." },
          { status: 400, headers: corsHeaders }
        );
      }
      if (!cleanIfsc || cleanIfsc.length !== 11) {
        return NextResponse.json(
          { success: false, error: "A valid 11-character IFSC Code is required." },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Generate unique transfer & payout IDs
    const epoch = Date.now();
    const randSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transferId = `FIN_${epoch}_${randSuffix}`;
    const payoutId = `PAYOUT_${epoch}_${randSuffix}`;

    // Initiate real Cashfree Payout
    let cfResponse: any = null;
    let payoutStatus = "PENDING";
    let failureReason: string | null = null;
    let bankUtr: string | null = null;
    let cfRefId: string | null = null;

    try {
      cfResponse = await initiateCashfreePayout({
        transferId: transferId,
        amount: numAmount,
        paymentMethod: mode,
        recipientName: cleanVendorName,
        recipientPhone: cleanPhone,
        upiId: mode === "UPI" ? upiId?.trim() : undefined,
        accountNumber: mode === "BANK_TRANSFER" ? accountNumber?.trim() : undefined,
        ifsc: mode === "BANK_TRANSFER" ? ifsc?.trim()?.toUpperCase() : undefined,
        remarks: cleanRemarks,
      });

      payoutStatus = cfResponse.status || "RECEIVED";
      bankUtr = cfResponse.transfer_utr || null;
      cfRefId = cfResponse.cf_transfer_id ? String(cfResponse.cf_transfer_id) : null;
    } catch (cfErr: any) {
      console.error("[Cashfree Finance Payout Error]:", cfErr);
      payoutStatus = "FAILED";
      failureReason = cfErr?.message || "Cashfree Payout API call failed";
      if (cfErr?.responseBody) {
        failureReason = cfErr.responseBody.message || cfErr.responseBody.error?.description || failureReason;
      }
    }

    // Record transaction in database
    const record = await prisma.financePayout.create({
      data: {
        payoutId: payoutId,
        transferId: transferId,
        vendorName: cleanVendorName,
        phone: cleanPhone,
        paymentMethod: mode,
        upiId: mode === "UPI" ? upiId?.trim() : null,
        accountNumber: mode === "BANK_TRANSFER" ? accountNumber?.trim() : null,
        ifsc: mode === "BANK_TRANSFER" ? ifsc?.trim()?.toUpperCase() : null,
        amount: numAmount,
        status: payoutStatus,
        cfReferenceId: cfRefId,
        utr: bankUtr,
        remarks: cleanRemarks,
        failureReason: failureReason,
        initiatedById: initiatedById ? String(initiatedById) : null,
        initiatedByName: initiatedByName ? String(initiatedByName) : "Finance Team",
      },
    });

    return NextResponse.json(
      {
        success: payoutStatus !== "FAILED",
        status: payoutStatus,
        payout: record,
        message: payoutStatus === "SUCCESS"
          ? "Payout transferred successfully via Cashfree!"
          : payoutStatus === "RECEIVED" || payoutStatus === "PENDING" || payoutStatus === "QUEUED"
          ? "Payout initiated and queued with Cashfree for instant transfer."
          : `Payout failed: ${failureReason || "Check account configuration"}`,
      },
      { status: payoutStatus === "FAILED" ? 400 : 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("POST /api/finance/payout Fatal Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process finance payout" },
      { status: 500, headers: corsHeaders }
    );
  }
}
