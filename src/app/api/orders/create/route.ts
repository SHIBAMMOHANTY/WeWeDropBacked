// src/app/api/orders/create/route.ts

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

type MembershipType = "BASIC" | "PREMIUM" | "ELITE";
// Order status: 0 = PENDING, 1 = PICKUP_REQUESTED, -1 = REJECTED, 2 = READY_FOR_PICKUP / IN_SERVICE_CENTER / IN_HOUSE, 3 = REPAIRING, 4 = OUT_FOR_DELIVERY, 5 = DELIVERED
type OrderStatus = 0 | 1 | -1 | 2 | 3 | 4 | 5;

export async function POST(req: Request) {
  try {
    // Require Bearer token in Authorization header
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401, headers: corsHeaders }
      );
    }

    const data = await req.json();

    // Extract fields with flexible field fallback mapping
    let userId = data.userId || data.user_id;
    const businessId = data.businessId || data.business_id;
    const brandName = (data.brandName || data.brand || "")?.toString().trim();
    const productName = (data.productName || data.product || "")?.toString().trim();
    const imeiNumber = (data.imeiNumber || data.imei || "")?.toString().trim();
    let paymentId = data.paymentId || data.payment_id || data.orderId;
    const customerName = (data.customerName || data.name || "")?.toString().trim();
    const contactNumber = (data.contactNumber || data.phone || "")?.toString().trim();
    const billImage = data.billImage ?? data.billUrl ?? "";
    const serviceType = data.serviceType === "IN_SERVICE_CENTER" ? "IN_SERVICE_CENTER" : "IN_HOUSE";
    const serviceCenterName = (data.serviceCenterName || "").toString().trim();
    const agentId = data.deliveryAgentId || data.agentId || data.updatedByAgentId || null;
    const agentName = (data.agentName || data.updatedByAgentName || "Agent").toString().trim();
    const remark = (data.remark || "").toString().trim();
    const issueType = (data.issueType || data.condition || data.description || "").toString().trim();

    const rawAmount = data.amount !== undefined ? data.amount : (data.totalAmount !== undefined ? data.totalAmount : data.orderPrice);
    const amount = typeof rawAmount === "number" ? rawAmount : parseFloat(rawAmount || 0);

    let rawMembership = String(data.membershipType || data.membershipDuration || data.plan || "BASIC").toUpperCase();
    let membershipType: MembershipType = "BASIC";
    if (rawMembership.includes("ELITE")) {
      membershipType = "ELITE";
    } else if (rawMembership.includes("PREMIUM")) {
      membershipType = "PREMIUM";
    } else {
      membershipType = "BASIC";
    }

    // Auto-resolve or create user by contactNumber if userId not provided
    if (!userId && contactNumber) {
      let existingUser = await prisma.user.findFirst({ where: { phone: contactNumber } });
      if (!existingUser) {
        existingUser = await prisma.user.create({
          data: {
            phone: contactNumber,
            username: customerName || `Customer-${contactNumber.slice(-4)}`,
            role: "USER",
            address: data.pickupAddress || data.fullAddress || data.address || "",
            pincode: data.pincode ? String(data.pincode) : "",
            state: data.state ? String(data.state) : "",
          }
        });
      }
      userId = existingUser.id;
    }

    // Auto-generate paymentId for intake orders if omitted
    if (!paymentId) {
      paymentId = `SVC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Basic validation
    if (
      !userId ||
      !membershipType ||
      !brandName ||
      !productName ||
      !imeiNumber ||
      amount === undefined ||
      isNaN(amount) ||
      !paymentId
    ) {
      return NextResponse.json(
        { error: "Missing required fields (brand, product, IMEI, contact, amount)" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if userId is valid
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate Cloudinary URL for billImage only if provided and non-empty
    if (billImage && typeof billImage === "string" && billImage.trim() !== "" && !billImage.startsWith("http")) {
      return NextResponse.json(
        { error: "Invalid billImage URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate Cloudinary URL for invoicePdf if provided
    if (data.invoicePdf && (typeof data.invoicePdf !== "string" || !data.invoicePdf.startsWith("http"))) {
      return NextResponse.json(
        { error: "Invalid invoicePdf URL" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Formulate rich refurbish metadata
    const initialRefurbishData = data.refurbishData || {
      serviceType: serviceType,
      serviceCenterName: serviceCenterName,
      createdByAgentId: agentId,
      createdByAgentName: agentName,
      updatedByAgentId: agentId,
      updatedByAgentName: agentName,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        {
          status: data.orderStatus === 2 ? (serviceType === "IN_SERVICE_CENTER" ? "IN_SERVICE_CENTER" : "IN_HOUSE_SERVICE") : "PICKUP_REQUESTED",
          serviceType: serviceType,
          updatedBy: agentName,
          agentId: agentId,
          timestamp: new Date().toISOString(),
          remark: remark || `Service intake recorded (${serviceType === "IN_SERVICE_CENTER" ? "In Service Center" : "In-House Service"})`,
        }
      ]
    };

    // Check for duplicate IMEI
    const existingOrder = await prisma.order.findFirst({ where: { imeiNumber: imeiNumber } });
    if (existingOrder) {
      // If something already exists for this IMEI, update its status automatically
      let newStatus: OrderStatus = existingOrder.orderStatus as OrderStatus;
      let expireDate: Date | null = null;
      let expired = false;
      if (membershipType === "BASIC") {
        newStatus = (data.orderStatus !== undefined ? Number(data.orderStatus) : 1) as OrderStatus;
      } else if (membershipType === "ELITE") {
        expireDate = existingOrder.expireDate ? new Date(existingOrder.expireDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        expired = expireDate < new Date();
      }

      const existingRefurbish = (existingOrder.refurbishData as any) || {};
      const mergedHistory = [
        {
          status: newStatus === 2 ? (serviceType === "IN_SERVICE_CENTER" ? "IN_SERVICE_CENTER" : "IN_HOUSE_SERVICE") : "STATUS_UPDATED",
          serviceType: serviceType,
          updatedBy: agentName,
          agentId: agentId,
          timestamp: new Date().toISOString(),
          remark: remark || "Order updated via intake submission",
        },
        ...(Array.isArray(existingRefurbish.statusHistory) ? existingRefurbish.statusHistory : [])
      ];

      const mergedRefurbish = {
        ...existingRefurbish,
        serviceType: serviceType,
        serviceCenterName: serviceCenterName || existingRefurbish.serviceCenterName || "",
        updatedByAgentId: agentId || existingRefurbish.updatedByAgentId,
        updatedByAgentName: agentName || existingRefurbish.updatedByAgentName,
        updatedAt: new Date().toISOString(),
        statusHistory: mergedHistory,
      };

      const updateData: any = {
        orderStatus: newStatus,
        refurbishData: mergedRefurbish,
        ...(agentId ? { deliveryAgentId: agentId } : {}),
        ...(issueType ? { issueType } : {}),
        ...(remark ? { remark } : {}),
        ...(membershipType === "ELITE" ? { expireDate } : {}),
      };

      if (data.deliveryDate !== undefined) updateData.deliveryDate = data.deliveryDate ? new Date(data.deliveryDate) : null;
      if (data.serviceCenterDate !== undefined) updateData.serviceCenterDate = data.serviceCenterDate ? new Date(data.serviceCenterDate) : null;
      if (data.pickupAddress !== undefined) {
        updateData.fullAddress = data.pickupAddress;
      } else if (data.fullAddress || data.address) {
        updateData.fullAddress = data.fullAddress || data.address;
      }

      const updated = await prisma.order.update({
        where: { id: existingOrder.id },
        data: updateData,
      });

      const statusMap: { [key: number]: string } = {
        0: 'PENDING',
        1: 'PICKUP_REQUESTED',
        '-1': 'REJECTED',
        2: 'PICKUP_SUCCESSFUL',
        3: 'REPAIRING',
        4: 'OUT_FOR_DELIVERY',
        5: 'DELIVERED'
      };

      const response = {
        ...updated,
        serviceType: serviceType,
        status: statusMap[updated.orderStatus] || 'UNKNOWN',
        ...(membershipType === "ELITE" ? { expireDate, expired } : {}),
      };

      return NextResponse.json(response, { status: 200, headers: corsHeaders });
    }

    let expireDate: Date | null = null;
    let expired = false;
    if (membershipType === "ELITE") {
      expireDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expired = false;
    }
    const fullAddress = data.pickupAddress !== undefined ? data.pickupAddress : (data.fullAddress ?? data.address ?? null);

    const order = await prisma.order.create({
      data: {
        userId: userId,
        businessId: businessId ?? null,
        deliveryAgentId: agentId,
        membershipType: membershipType,
        brandName: brandName,
        productName: productName,
        imeiNumber: imeiNumber,
        billImage: billImage,
        utrScreenshot: data.utrScreenshot ?? null,
        invoicePdf: data.invoicePdf ?? null,
        refurbishData: initialRefurbishData,
        serviceDate: data.serviceDate ? new Date(data.serviceDate) : (data.billDate ? new Date(data.billDate) : new Date()),
        billingDate: data.billingDate ? new Date(data.billingDate) : (data.billDate ? new Date(data.billDate) : null),
        deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
        serviceCenterDate: data.serviceCenterDate ? new Date(data.serviceCenterDate) : null,
        customerName: customerName,
        contactNumber: contactNumber,
        state: data.state ?? null,
        pincode: data.pincode ?? null,
        fullAddress: fullAddress,
        amount: amount,
        paymentId: paymentId,
        orderStatus: data.orderStatus !== undefined ? Number(data.orderStatus) : (membershipType === "BASIC" ? 1 : 0),
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
        receiverName: data.receiverName ?? null,
        mobileNumber: data.mobileNumber ?? null,
        issueType: issueType || null,
        remark: remark || null,
        ...(membershipType === "ELITE" ? { expireDate } : {}),
      },
    });

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'PICKUP_SUCCESSFUL',
      3: 'REPAIRING',
      4: 'OUT_FOR_DELIVERY',
      5: 'DELIVERED'
    };

    const orderWithStatus = {
      ...order,
      serviceType: serviceType,
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().slice(0,10) : null,
      serviceCenterDate: order.serviceCenterDate ? new Date(order.serviceCenterDate).toISOString().slice(0,10) : null,
      serviceDate: order.serviceDate ? new Date(order.serviceDate).toISOString().slice(0,10) : null,
      status: statusMap[order.orderStatus] || 'UNKNOWN',
      ...(membershipType === "ELITE" ? { expireDate, expired } : {}),
    };

    return NextResponse.json({
      ...orderWithStatus,
      serviceDate: formatDateOnly(orderWithStatus.serviceDate),
      billingDate: formatDateOnly(orderWithStatus.billingDate),
      deliveryDate: formatDateOnly((orderWithStatus as any).deliveryDate),
      serviceCenterDate: formatDateOnly((orderWithStatus as any).serviceCenterDate),
    }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error("ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500, headers: corsHeaders }
    );
  }
}
