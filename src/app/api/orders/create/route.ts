// src/app/api/orders/create/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


type MembershipType = "BASIC" | "PREMIUM" | "ELITE";
// Order status: 0 = PENDING, 1 = PICKUP_REQUESTED, -1 = REJECTED, 2 = READY_FOR_PICKUP, 3 = REPAIRING, 4 = DELIVERED
type OrderStatus = 0 | 1 | -1 | 2 | 3 | 4;


export async function POST(req: Request) {
  try {
    // Require Bearer token in Authorization header
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    // Optionally, you can verify the token here if you want

    const data = await req.json();

    // Basic validation
    if (
      !data.userId ||
      !data.membershipType ||
      !data.brandName ||
      !data.productName ||
      !data.imeiNumber ||
      !data.amount ||
      !data.paymentId // Require paymentId
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    // preferredDate is optional, no validation needed

    // Check if userId is valid
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400 }
      );
    }

    // Enum validation (safe + simple)
    if (!["BASIC", "PREMIUM", "ELITE"].includes(data.membershipType)) {
      return NextResponse.json(
        { error: "Invalid membership type" },
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

    // Validate Cloudinary URL for invoicePdf if provided
    if (data.invoicePdf && (typeof data.invoicePdf !== "string" || !data.invoicePdf.startsWith("http"))) {
      return NextResponse.json(
        { error: "Invalid invoicePdf URL" },
        { status: 400 }
      );
    }

    // Check for duplicate IMEI
    const existingOrder = await prisma.order.findFirst({ where: { imeiNumber: data.imeiNumber } });
    if (existingOrder) {
      // If something already exists for this IMEI, update its status automatically
      let newStatus: OrderStatus = existingOrder.orderStatus as OrderStatus;
      let expireDate: Date | null = null;
      let expired = false;
      if (data.membershipType === "BASIC") {
        newStatus = 1 as OrderStatus;
      } else if (data.membershipType === "ELITE") {
        // ELITE behaves like PREMIUM for status, so do not set to 1 or 2, just keep existing or PREMIUM logic
        // Set expireDate to one year from now if not already set
        expireDate = existingOrder.expireDate ? new Date(existingOrder.expireDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        expired = expireDate < new Date();
      }
      const updated = await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          orderStatus: newStatus,
          ...(data.membershipType === "ELITE" ? { expireDate } : {}),
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

      const response = {
        ...updated,
        status: statusMap[updated.orderStatus] || 'UNKNOWN',
        ...(data.membershipType === "ELITE" ? { expireDate, expired } : {}),
      };
      return NextResponse.json(response, { status: 200 });
    }

    let expireDate: Date | null = null;
    let expired = false;
    if (data.membershipType === "ELITE") {
      expireDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expired = false;
    }
    const order = await prisma.order.create({
      data: {
        userId: data.userId,
        businessId: data.businessId ?? null,
        membershipType: data.membershipType,
        brandName: data.brandName,
        productName: data.productName,
        imeiNumber: data.imeiNumber,
        billImage: data.billImage ?? "",
        utrScreenshot: data.utrScreenshot ?? null,
        invoicePdf: data.invoicePdf ?? null,
        serviceDate: new Date(),
        billingDate: data.billingDate ? new Date(data.billingDate) : null,
        customerName: data.customerName ?? "",
        contactNumber: data.contactNumber ?? "",
        state: data.state ?? null,
        pincode: data.pincode ?? null,
        fullAddress: data.fullAddress ?? null,
        amount: data.amount,
        paymentId: data.paymentId, // Add paymentId to order
        // If membership is BASIC, set status to 1 (PICKUP_REQUESTED), else keep PENDING (0)
        orderStatus: data.membershipType === "BASIC" ? 1 : 0,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
        ...(data.membershipType === "ELITE" ? { expireDate } : {}),
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

    const orderWithStatus = {
      ...order,
      status: statusMap[order.orderStatus] || 'UNKNOWN',
      ...(data.membershipType === "ELITE" ? { expireDate, expired } : {}),
    };

    return NextResponse.json(orderWithStatus, { status: 201 });
  } catch (error) {
    console.error("ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
