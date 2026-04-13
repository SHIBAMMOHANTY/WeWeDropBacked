// src/app/api/orders/create/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (
      !data.userId ||
      !data.businessId ||
      !data.brand ||
      !data.product ||
      !data.imei ||
      !data.name ||
      !data.phone ||
      !data.pincode ||
      !data.plan ||
      !data.state ||
      !data.billDate ||
      !data.billImage
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate Cloudinary URL for billImage
    if (typeof data.billImage !== "string" || !data.billImage.startsWith("http")) {
      return NextResponse.json(
        { error: "Invalid billImage URL" },
        { status: 400 }
      );
    }
    // Validate Cloudinary URL for utrScreenshot if provided
    if (data.utrScreenshot && (typeof data.utrScreenshot !== "string" || !data.utrScreenshot.startsWith("http"))) {
      return NextResponse.json(
        { error: "Invalid utrScreenshot URL" },
        { status: 400 }
      );
    }

    // Validate Cloudinary URL for invoicePdf if provided
    if (data.invoicePdf && (typeof data.invoicePdf !== "string" || !data.invoicePdf.startsWith("http"))) {
      return NextResponse.json(
        { error: "Invalid invoicePdf URL" },
        { status: 400 }
      );
    }

    // Validate billDate
    const serviceDate = new Date(data.billDate);
    if (isNaN(serviceDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid billDate format" },
        { status: 400 }
      );
    }

    // Check for duplicate IMEI
    const existingOrder = await prisma.order.findFirst({
      where: { imeiNumber: data.imei }
    });
    if (existingOrder) {
      return NextResponse.json(
        { error: "An order with this IMEI already exists" },
        { status: 409 }
      );
    }

     const order = await prisma.order.create({
  data: {
    userId: data.userId,
    businessId: data.businessId,
    membershipType: data.membershipType ? data.membershipType : "BASIC",
    brandName: data.brand.trim(),
    productName: data.product,
    imeiNumber: data.imei,
    billImage: data.billImage,
    utrScreenshot: data.utrScreenshot || null,
    invoicePdf: data.invoicePdf || null,
    serviceDate: new Date(data.billDate),
    customerName: data.name.trim(),
    contactNumber: data.phone,
    state: data.state,
    pincode: data.pincode,
    fullAddress: data.address || null,
    amount: typeof data.amount === "number" ? data.amount : 0, // <-- FIXED
    paymentId: null,
    orderStatus: 0, // PENDING
  },
});

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
