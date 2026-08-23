import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleOrderEdit(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleOrderEdit(req, params);
}

async function handleOrderEdit(req: NextRequest, params: { id: string }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing order id in URL" }, { status: 400, headers: corsHeaders });
    }

    const updateData = await req.json();
    
    // Support matching by ObjectId (_id) or string orderId
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);
    const existingOrder = await prisma.order.findFirst({
      where: {
        OR: [
          ...(isObjectId ? [{ id }] : []),
          { orderId: id }
        ]
      }
    });

    if (!existingOrder || existingOrder.deleted) {
      return NextResponse.json({ error: "Order not found or deleted" }, { status: 404, headers: corsHeaders });
    }

    const allowedFields = [
      'customerName',
      'contactNumber',
      'brandName',
      'productName',
      'imeiNumber',
      'amount',
      'orderStatus',
      'deliveryAgentId',
      'state',
      'pincode',
      'fullAddress',
      'pickupAddress',
      'preferredDate',
      'warrantyStatus',
      'issueType',
      'area',
      'fix',
      'remark',
      'receiverName',
      'mobileNumber'
    ];

    const updatePayload: any = {};
    for (const key of allowedFields) {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        if (key === 'orderStatus') {
          updatePayload[key] = parseInt(String(updateData[key]), 10);
        } else if (key === 'amount') {
          updatePayload[key] = parseFloat(String(updateData[key]));
        } else {
          updatePayload[key] = updateData[key];
        }
      }
    }

    if (updatePayload.pickupAddress !== undefined) {
      updatePayload.fullAddress = updatePayload.pickupAddress;
    }

    const updated = await prisma.order.update({
      where: { id: existingOrder.id },
      data: updatePayload,
    });

    return NextResponse.json({ 
      success: true, 
      message: "Order updated successfully", 
      order: updated 
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("ORDER EDIT ERROR:", error);
    return NextResponse.json({ 
      error: "Failed to edit order", 
      details: error?.message || String(error) 
    }, { status: 500, headers: corsHeaders });
  }
}
