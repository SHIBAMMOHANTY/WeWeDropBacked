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

// GET /api/orders/all
export async function GET(req: NextRequest) {
  console.log("GET /api/orders/all called");
  try {
    // Fetch orders without the business include (to avoid invalid ObjectID errors)
    const orders = await prisma.order.findMany({
      where: { deleted: false },
      orderBy: { id: "desc" }
    });
    
    // Fetch all businesses and users
    const businesses = await prisma.business.findMany();
    const users = await prisma.user.findMany();
    
    const businessMap = new Map(businesses.map(b => [b.id, b]));
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Create a map by dealerName as fallback for invalid IDs
    const businessByNameMap = new Map(businesses.map(b => [b.dealerName.toLowerCase(), b]));
    
    const totalCount = await prisma.order.count({ where: { deleted: false } });
    console.log(`Fetched ${orders.length} orders from /all, totalCount: ${totalCount}`);
    console.log('First order status:', orders[0]?.orderStatus);

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const ordersWithStatus = orders.map(order => {
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
        serviceDate: order.serviceDate,
        customerName: order.customerName,
        contactNumber: order.contactNumber,
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
        amount: order.amount,
        orderStatus: order.orderStatus,
        paymentId: order.paymentId,
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
