// src/app/api/orders/buisness-order/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    // Extract fields with flexible field fallback mapping
    const userId = data.userId || data.user_id;
    const businessId = data.businessId || data.business_id;
    const brand = (data.brand || data.brandName || "")?.toString().trim();
    const product = (data.product || data.productName || "")?.toString().trim();
    const imei = (data.imei || data.imeiNumber || "")?.toString().trim();
    const name = (data.name || data.customerName || "")?.toString().trim();
    const phone = (data.phone || data.contactNumber || "")?.toString().trim();
    const pincode = (data.pincode || "")?.toString().trim();
    const state = (data.state || "")?.toString().trim();
    const plan = data.plan || data.membershipType || data.membershipDuration;
    const billDateInput = data.billDate || data.billingDate || data.serviceDate;
    const billImage = data.billImage ?? data.billUrl ?? "";

    if (
      !userId ||
      !businessId ||
      !brand ||
      !product ||
      !imei ||
      !name ||
      !phone ||
      !pincode ||
      !plan ||
      !state ||
      !billDateInput
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate Cloudinary URL for billImage only if provided and non-empty
    if (
      billImage &&
      typeof billImage === "string" &&
      billImage.trim() !== "" &&
      !billImage.startsWith("http")
    ) {
      return NextResponse.json(
        { error: "Invalid billImage URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate Cloudinary URL for utrScreenshot if provided
    if (
      data.utrScreenshot &&
      (typeof data.utrScreenshot !== "string" || !data.utrScreenshot.startsWith("http"))
    ) {
      return NextResponse.json(
        { error: "Invalid utrScreenshot URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate Cloudinary URL for invoicePdf if provided
    if (
      data.invoicePdf &&
      (typeof data.invoicePdf !== "string" || !data.invoicePdf.startsWith("http"))
    ) {
      return NextResponse.json(
        { error: "Invalid invoicePdf URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    const serviceDateInput = data.serviceDate ?? billDateInput;
    const serviceDate = new Date(serviceDateInput);
    if (isNaN(serviceDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid serviceDate format" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Determine membershipType enum safely
    let membershipType: "BASIC" | "PREMIUM" | "ELITE" = "BASIC";
    const rawMembership = String(data.membershipType || data.membershipDuration || data.plan || "BASIC").toUpperCase();
    if (rawMembership.includes("ELITE")) {
      membershipType = "ELITE";
    } else if (rawMembership.includes("PREMIUM")) {
      membershipType = "PREMIUM";
    } else {
      membershipType = "BASIC";
    }

    // Check for duplicate IMEI
    const existingOrder = await prisma.order.findFirst({
      where: { imeiNumber: imei }
    });
    if (existingOrder) {
      return NextResponse.json(
        { error: "An order with this IMEI already exists" },
        { status: 409, headers: corsHeaders }
      );
    }

    const amountVal = typeof data.amount === "number" 
      ? data.amount 
      : parseFloat(data.amount || data.totalAmount || data.orderPrice || 0) || 0;

    const order = await prisma.order.create({
      data: {
        userId: userId,
        businessId: businessId,
        membershipType: membershipType,
        brandName: brand,
        productName: product,
        imeiNumber: imei,
        billImage: billImage,
        utrScreenshot: data.utrScreenshot || null,
        invoicePdf: data.invoicePdf || null,
        serviceDate,
        billingDate: data.billingDate ? new Date(data.billingDate) : (billDateInput ? new Date(billDateInput) : null),
        customerName: name,
        contactNumber: phone,
        state: state,
        pincode: pincode,
        fullAddress: data.address || data.fullAddress || null,
        amount: amountVal,
        paymentId: data.paymentId || data.payment_id || data.orderId || null,
        orderStatus: data.orderStatus !== undefined ? Number(data.orderStatus) : (membershipType === "BASIC" ? 1 : 0),
        receiverName: data.receiverName ?? null,
        mobileNumber: data.mobileNumber ?? null,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
      },
    });

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    return NextResponse.json(
      {
        ...order,
        status: statusMap[order.orderStatus] || 'PENDING',
        serviceDate: formatDateOnly(order.serviceDate),
        billingDate: formatDateOnly(order.billingDate),
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("BUSINESS ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500, headers: corsHeaders }
    );
  }
}

