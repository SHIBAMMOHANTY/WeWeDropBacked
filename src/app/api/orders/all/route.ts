export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 's-maxage=1, stale-while-revalidate=5',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

function mapPaymentStatus(status: number | null | undefined): string {
  if (status === 1) return "VERIFIED";
  if (status === -1) return "REJECTED";
  return "PENDING";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearFilter = searchParams.get('year');

    // SAFE FETCH: Avoid Prisma relation joins on businessId to prevent Malformed ObjectID errors when businessId is a plain string
    const orders = await prisma.order.findMany({
      where: { deleted: false },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ]
    });

    let filteredOrders = orders;
    if (yearFilter) {
      const targetYear = parseInt(yearFilter, 10);
      if (!Number.isNaN(targetYear)) {
        filteredOrders = orders.filter(order => {
          if (!order.serviceDate) return false;
          const date = new Date(order.serviceDate);
          return date.getUTCFullYear() === targetYear;
        });
      }
    }

    // Safely load businesses and users for manual map lookup
    const [businesses, users] = await Promise.all([
      prisma.business.findMany().catch(() => []),
      prisma.user.findMany().catch(() => []),
    ]);

    const businessMap = new Map(businesses.map(b => [String(b.id), b]));
    const userMap = new Map(users.map(u => [String(u.id), u]));
    const businessByNameMap = new Map(businesses.map(b => [b.dealerName.toLowerCase().trim(), b]));

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'PICKUP_SUCCESSFUL',
      3: 'REPAIRING',
      4: 'OUT_FOR_DELIVERY',
      5: 'DELIVERED'
    };

    const ordersWithStatus = filteredOrders.map(order => {
      let business = order.businessId ? businessMap.get(String(order.businessId)) : null;
      if (!business && order.businessId && typeof order.businessId === 'string') {
        business = businessByNameMap.get(order.businessId.toLowerCase().trim());
      }
      
      const user = order.userId ? userMap.get(String(order.userId)) : null;
      const deliveryAgent = order.deliveryAgentId ? userMap.get(String(order.deliveryAgentId)) : null;

      const stCode = Number(order.orderStatus !== undefined ? order.orderStatus : 1);

      return {
        id: order.id,
        orderId: order.orderId,
        userId: order.userId,
        businessId: order.businessId,
        deliveryAgentId: order.deliveryAgentId,
        membershipType: order.membershipType,
        brandName: order.brandName,
        productName: order.productName,
        imeiNumber: order.imeiNumber,
        billImage: order.billImage,
        utrScreenshot: order.utrScreenshot,
        invoicePdf: order.invoicePdf,
        serviceDate: order.serviceDate ? new Date(order.serviceDate).toISOString().slice(0,10) : null,
        deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().slice(0,10) : null,
        serviceCenterDate: order.serviceCenterDate ? new Date(order.serviceCenterDate).toISOString().slice(0,10) : null,
        billingDate: order.billingDate,
        orderDate: order.createdAt,
        customerName: order.customerName,
        contactNumber: order.contactNumber ?? null,
        state: order.state,
        pincode: order.pincode,
        fullAddress: order.fullAddress,
        preferredDate: order.preferredDate,
        warrantyStatus: order.warrantyStatus,
        issueType: order.issueType,
        area: order.area,
        pickupAddress: order.pickupAddress,
        fix: order.fix,
        remark: order.remark,
        receiverName: order.receiverName ?? null,
        mobileNumber: order.mobileNumber ?? null,
        amount: order.amount,
        orderStatus: stCode,
        paymentId: order.paymentId,
        paymentDate: order.createdAt,
        paymentStatus: order.paymentStatus ?? null,
        paymentStatusLabel: mapPaymentStatus(order.paymentStatus),
        expireDate: order.expireDate,
        createdAt: order.createdAt,
        deleted: order.deleted,
        user: user ? {
          id: user.id,
          phone: user.phone,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          avatar: user.avatar,
        } : null,
        deliveryAgent: deliveryAgent ? {
          id: deliveryAgent.id,
          phone: deliveryAgent.phone,
          username: deliveryAgent.username,
          email: deliveryAgent.email,
          serviceArea: deliveryAgent.serviceArea,
        } : null,
        business: business ? {
          id: business.id,
          dealerName: business.dealerName,
          contactNumber: business.contactNumber,
          email: business.email,
        } : null,
        businessPhone: business?.contactNumber || null,
        status: statusMap[stCode] || 'UNKNOWN'
      };
    });

    return NextResponse.json(
      { orders: ordersWithStatus, totalCount: ordersWithStatus.length },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch all orders", details: error?.message || String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}
