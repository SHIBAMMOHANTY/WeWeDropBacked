export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  const response = new Response(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

function mapPaymentStatus(status: unknown) {
  switch (Number(status)) {
    case -1:
      return 'REJECTED';
    case 0:
      return 'PENDING';
    case 1:
      return 'VERIFY';
    default:
      return 'UNKNOWN';
  }
}

// GET /api/orders/all
export async function GET(req: NextRequest) {
  console.log("GET /api/orders/all called");
  try {
    // Get year filter from query parameters (optional)
    const { searchParams } = new URL(req.url);
    const yearFilter = searchParams.get("year");
    
    const isLowPriorityServiceDate = (value: Date | string | null | undefined) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;

      const year = date.getUTCFullYear();
      const day = date.getUTCDate();

      return year >= 2023 && year <= 2025 && day < 10;
    };

    // Fetch orders without the business include (to avoid invalid ObjectID errors)
    const orders = await prisma.order.findMany({
      where: { deleted: false },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ]
    });
    
    // Filter by year if provided
    let filteredOrders = orders;
    if (yearFilter) {
      const targetYear = parseInt(yearFilter, 10);
      if (!Number.isNaN(targetYear)) {
        filteredOrders = orders.filter(order => {
          if (!order.serviceDate) return false;
          const date = new Date(order.serviceDate);
          return date.getUTCFullYear() === targetYear;
        });
        console.log(`Filtered orders by year ${targetYear}: ${filteredOrders.length} orders`);
      }
    }

    filteredOrders.sort((left, right) => {
      const leftLowPriority = isLowPriorityServiceDate(left.serviceDate);
      const rightLowPriority = isLowPriorityServiceDate(right.serviceDate);

      if (leftLowPriority !== rightLowPriority) {
        return leftLowPriority ? 1 : -1;
      }

      // Sort by serviceDate year (descending - newest year first)
      const leftServiceYear = left.serviceDate ? new Date(left.serviceDate).getUTCFullYear() : 0;
      const rightServiceYear = right.serviceDate ? new Date(right.serviceDate).getUTCFullYear() : 0;

      if (rightServiceYear !== leftServiceYear) {
        return rightServiceYear - leftServiceYear;
      }

      const leftCreatedAt = new Date(left.createdAt).getTime();
      const rightCreatedAt = new Date(right.createdAt).getTime();

      if (rightCreatedAt !== leftCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }

      return right.id.localeCompare(left.id);
    });

    const orderIds = filteredOrders.map(order => order.id);
    const payments = orderIds.length > 0
      ? await prisma.payment.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            orderId: true,
            createdAt: true,
            paymentDate: true,
            paymentStatus: true,
          },
          orderBy: { createdAt: "desc" }
        })
      : [];

    const paymentMetaMap = new Map<string, { paymentDate: Date | null; paymentStatus: number | null }>();
    for (const payment of payments) {
      if (!paymentMetaMap.has(payment.orderId)) {
        paymentMetaMap.set(payment.orderId, {
          paymentDate: payment.paymentDate ?? payment.createdAt,
          paymentStatus: payment.paymentStatus ?? null,
        });
      }
    }
    
    // Fetch all businesses and users
    const businesses = await prisma.business.findMany();
    const users = await prisma.user.findMany();
    
    const businessMap = new Map(businesses.map(b => [b.id, b]));
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Create a map by dealerName as fallback for invalid IDs
    const businessByNameMap = new Map(businesses.map(b => [b.dealerName.toLowerCase(), b]));
    
    const totalCount = yearFilter 
      ? filteredOrders.length 
      : await prisma.order.count({ where: { deleted: false } });
    console.log(`Fetched ${filteredOrders.length} filtered orders from /all, totalCount: ${totalCount}`);
    console.log('First order status:', filteredOrders[0]?.orderStatus);

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const ordersWithStatus = filteredOrders.map(order => {
      // Try to find business by ID first
      let business = order.businessId ? businessMap.get(order.businessId) : null;
      
      // If not found by ID and businessId is a string (not ObjectID), try to find by name
      if (!business && order.businessId && typeof order.businessId === 'string') {
        business = businessByNameMap.get(order.businessId.toLowerCase());
      }
      
      // Get user details
      const user = order.userId ? userMap.get(order.userId) : null;
      
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
        orderStatus: order.orderStatus,
        paymentId: order.paymentId,
        paymentDate: paymentMetaMap.get(order.id)?.paymentDate ?? null,
        paymentStatus: order.paymentStatus ?? paymentMetaMap.get(order.id)?.paymentStatus ?? null,
        paymentStatusLabel: mapPaymentStatus(order.paymentStatus ?? paymentMetaMap.get(order.id)?.paymentStatus ?? null),
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
          gstName: user.gstName || null,
          gstNumber: user.gstNumber || null,
          gstAddress: user.gstAddress || null
        } : null,
        business: business ? {
          id: business.id,
          dealerName: business.dealerName,
          contactNumber: business.contactNumber,
          email: business.email,
          gstName: business.gstName,
          gstNumber: business.gstNumber,
          gstAddress: business.gstAddress,
          approved: business.approved,
          isActive: business.isActive
        } : null,
        businessPhone: business?.contactNumber || null,
        status: statusMap[order.orderStatus] || 'UNKNOWN'
      };
    });

    const response = NextResponse.json({ orders: ordersWithStatus, totalCount });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  } catch (error) {
    console.error("Error fetching orders:", error);
    const response = NextResponse.json({ error: "Failed to fetch all orders" }, { status: 500 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
}
