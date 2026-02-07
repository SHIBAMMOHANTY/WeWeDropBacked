// TODO: implement orders list route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/list?userId=123
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const userId = searchParams.get("userId");
		if (!userId) {
			return NextResponse.json({ error: "Missing userId" }, { status: 400 });
		}
		const orders = await prisma.order.findMany({
			where: { userId: userId },
			orderBy: { id: "desc" },
		});

		const statusMap: { [key: number]: string } = {
			0: 'PENDING',
			1: 'PICKUP_REQUESTED',
			'-1': 'REJECTED',
			2: 'READY_FOR_PICKUP',
			3: 'REPAIRING',
			4: 'DELIVERED'
		};

		const ordersWithStatus = orders.map(order => ({
			...order,
			status: statusMap[order.orderStatus] || 'UNKNOWN'
		}));

		return NextResponse.json(ordersWithStatus);
	} catch (error) {
		return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
	}
}

// PATCH /api/orders/list?id=123 or body with orderIds for bulk update
export async function PATCH(req: NextRequest) {
	try {
		const data = await req.json();

		   // Bulk update with individual amounts
		   if (data.orders && Array.isArray(data.orders)) {
			   const paymentId = data.paymentId;
			   if (!paymentId) {
				   return NextResponse.json({ status: "error", message: "Missing paymentId for bulk update" }, { status: 400 });
			   }

			   const updatedOrders = [];
			   for (const item of data.orders) {
				   const { orderId, amount } = item;
				   if (!orderId || amount == null) {
					   return NextResponse.json({ status: "error", message: "Missing orderId or amount in bulk item" }, { status: 400 });
				   }
				   const order = await prisma.order.findUnique({ where: { id: orderId } });
				   if (order) {
					   await prisma.order.update({
						   where: { id: orderId },
						   data: { paymentId, orderStatus: 1, amount }, // 1 = APPROVED/PAID
					   });
					   await prisma.payment.create({
						   data: {
							   userId: order.userId,
							   orderId,
							   amount,
							   status: "PAID",
							   razorpayId: null,
						   }
					   });
					   updatedOrders.push(orderId);
				   }
			   }
			   return NextResponse.json({ status: "success", updatedOrders });
		   } else if (data.orderIds && Array.isArray(data.orderIds)) {
			   // Bulk update for marking orders as paid (legacy)
			   const paymentId = data.paymentId;
			   const amount = data.amount;
			   if (!paymentId) {
				   return NextResponse.json({ status: "error", message: "Missing paymentId for bulk update" }, { status: 400 });
			   }
			   if (amount == null) {
				   return NextResponse.json({ status: "error", message: "Missing amount for bulk update" }, { status: 400 });
			   }

			   const updatedOrders = [];
			   for (const orderId of data.orderIds) {
				   const order = await prisma.order.findUnique({ where: { id: orderId } });
				   if (order) {
					   await prisma.order.update({
						   where: { id: orderId },
						   data: { paymentId, orderStatus: 1, amount }, // 1 = APPROVED/PAID
					   });
					   await prisma.payment.create({
						   data: {
							   userId: order.userId,
							   orderId,
							   amount,
							   status: "PAID",
							   razorpayId: null,
						   }
					   });
					   updatedOrders.push(orderId);
				   }
			   }
			   return NextResponse.json({ status: "success", updatedOrders });
		   } else {
			   // Single order update
			   const { searchParams } = new URL(req.url);
			   const id = searchParams.get("id");
			   const paymentId = data.paymentId;
			   const amount = data.amount;
			   if (!id) {
				   return NextResponse.json({ status: "error", message: "Missing id for single update" }, { status: 400 });
			   }
			   if (!paymentId) {
				   return NextResponse.json({ status: "error", message: "Missing paymentId for single update" }, { status: 400 });
			   }
			   if (amount == null) {
				   return NextResponse.json({ status: "error", message: "Missing amount for single update" }, { status: 400 });
			   }
			   const updatedOrder = await prisma.order.update({
				   where: { id: id },
				   data,
			   });

			   await prisma.payment.create({
				   data: {
					   userId: updatedOrder.userId,
					   orderId: updatedOrder.id,
					   amount,
					   status: "PAID",
					   razorpayId: null,
				   }
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
				   ...updatedOrder,
				   status: statusMap[updatedOrder.orderStatus] || 'UNKNOWN'
			   };

			   return NextResponse.json({ status: "success", order: orderWithStatus });
		   }
	} catch (error) {
		return NextResponse.json({ status: "error", message: "Failed to update order" }, { status: 500 });
	}
}
// TODO: implement orders list route
