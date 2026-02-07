// TODO: implement orders list route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

function mapOrderStatus(status: unknown) {
	const n = Number(status);
	switch (n) {
		case 0:
			return 'PENDING';
		case 1:
			return 'PICKUP_REQUESTED';
		case -1:
			return 'REJECTED';
		case 2:
			return 'READY_FOR_PICKUP';
		case 3:
			return 'REPAIRING';
		case 4:
			return 'DELIVERED';
		default:
			return 'UNKNOWN';
	}
}

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
			status: mapOrderStatus(order.orderStatus)
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
		console.log("PATCH /api/orders/list incoming payload:", data);

		   // Bulk update with individual amounts
		   if (Array.isArray(data.orders) && data.orders.length > 0) {
			   const topPaymentId = data.paymentId ?? null;

			   const updatedOrders: string[] = [];
			   for (const item of data.orders) {
				   // Accept either `orderId` or `id` from caller
				   const orderKey = item.orderId ?? item.id ?? item._id;
				   const amount = item.amount ?? item.total ?? null;
				   const itemPaymentId = item.paymentId ?? topPaymentId;

				   if (orderKey == null || amount == null) {
					   const payload = { status: "error", message: "Missing order id or amount in bulk item" };
					   console.log("PATCH response payload:", payload);
					   return NextResponse.json(payload, { status: 400 });
				   }
				   if (!itemPaymentId) {
					   const payload = { status: "error", message: "Missing paymentId for some bulk items" };
					   console.log("PATCH response payload:", payload);
					   return NextResponse.json(payload, { status: 400 });
				   }

				   const orderIdStr = String(orderKey);
				   const order = await prisma.order.findUnique({ where: { id: orderIdStr } });
				   if (order) {
					   let newStatus: number | undefined;
					   if (item.hasOwnProperty('orderStatus')) {
						   const s = Number(item.orderStatus);
						   if (s === 0) {
							   newStatus = undefined; // 0 => do not change
						   } else if (s === 1 && itemPaymentId) {
							   // incoming 1 with paymentId: keep as PENDING (0)
							   newStatus = 0;
						   } else {
							   newStatus = s;
						   }
					   } else {
						   newStatus = undefined; // do not change when not provided
					   }
					   const updateData: any = { paymentId: itemPaymentId, amount };
					   if (newStatus !== undefined) updateData.orderStatus = newStatus;
					   await prisma.order.update({
						   where: { id: orderIdStr },
						   data: updateData,
					   });
					   await prisma.payment.create({
						   data: {
							   userId: order.userId,
							   orderId: orderIdStr,
							   amount,
							   status: "PAID",
							   razorpayId: itemPaymentId || null,
						   }
					   });
					   updatedOrders.push(orderIdStr);
				   }
			   }
			   const payload = { status: "success", updatedOrders };
			   console.log("PATCH response payload:", payload);
			   return NextResponse.json(payload);
		   } else if (data.orderIds && Array.isArray(data.orderIds)) {
			   // Bulk update for marking orders as paid (legacy)
			   const paymentId = data.paymentId;
			   const amount = data.amount;
			   if (!paymentId) {
				   const payload = { status: "error", message: "Missing paymentId for bulk update" };
				   console.log("PATCH response payload:", payload);
				   return NextResponse.json(payload, { status: 400 });
			   }
			   if (amount == null) {
				   const payload = { status: "error", message: "Missing amount for bulk update" };
				   console.log("PATCH response payload:", payload);
				   return NextResponse.json(payload, { status: 400 });
			   }

			   const updatedOrders = [];
			   for (const orderId of data.orderIds) {
				   const orderIdStr = String(orderId);
				   const order = await prisma.order.findUnique({ where: { id: orderIdStr } });
				   if (order) {
					   let newStatus: number | undefined;
					   if (data.hasOwnProperty('orderStatus')) {
						   const s = Number(data.orderStatus);
						   if (s === 0) {
							   newStatus = undefined; // 0 => do not change
						   } else if (s === 1 && paymentId) {
							   newStatus = 0; // force to PENDING when paymentId present
						   } else {
							   newStatus = s;
						   }
					   } else {
						   newStatus = undefined;
					   }
					   const updateData: any = { paymentId, amount };
					   if (newStatus !== undefined) updateData.orderStatus = newStatus;
					   await prisma.order.update({
						   where: { id: orderIdStr },
						   data: updateData,
					   });
					   await prisma.payment.create({
						   data: {
							   userId: order.userId,
							   orderId: orderIdStr,
							   amount,
							   status: "PAID",
							   razorpayId: null,
						   }
					   });
					   updatedOrders.push(orderIdStr);
				   }
			   }
			   const payload = { status: "success", updatedOrders };
			   console.log("PATCH response payload:", payload);
			   return NextResponse.json(payload);
		   } else {
			   // Single order update
			   const { searchParams } = new URL(req.url);
			   const id = searchParams.get("id");
			   if (!id) {
				   const payload = { status: "error", message: "Missing id for single update" };
				   console.log("PATCH response payload:", payload);
				   return NextResponse.json(payload, { status: 400 });
			   }

			   const isPaymentUpdate = data.hasOwnProperty('paymentId') || data.hasOwnProperty('amount');

			   if (isPaymentUpdate) {
				   // payment flow requires both paymentId and amount
				   const paymentId = data.paymentId;
				   const amount = data.amount;
				   if (!paymentId) {
					   const payload = { status: "error", message: "Missing paymentId for single update" };
					   console.log("PATCH response payload:", payload);
					   return NextResponse.json(payload, { status: 400 });
				   }
				   if (amount == null) {
					   const payload = { status: "error", message: "Missing amount for single update" };
					   console.log("PATCH response payload:", payload);
					   return NextResponse.json(payload, { status: 400 });
				   }

				   // compute orderStatus for payment update (preserve existing rules)
				   let newStatus: number | undefined;
				   if (data.hasOwnProperty('orderStatus')) {
					   const s = Number(data.orderStatus);
					   if (s === 0) {
						   newStatus = undefined; // do not change
					   } else if (s === 1 && paymentId) {
						   newStatus = 0; // incoming 1 with paymentId -> convert to 0 (PENDING)
					   } else {
						   newStatus = s;
					   }
				   } else {
					   newStatus = undefined; // do not change by default
				   }

				   const updateData: any = { paymentId: data.paymentId, amount: data.amount };
				   if (newStatus !== undefined) updateData.orderStatus = newStatus;

				   const updatedOrder = await prisma.order.update({ where: { id }, data: updateData });

				   await prisma.payment.create({
					   data: {
						   userId: updatedOrder.userId,
						   orderId: updatedOrder.id,
						   amount: data.amount,
						   status: "PAID",
						   razorpayId: null,
					   }
				   });

				   const orderWithStatus = { ...updatedOrder, status: mapOrderStatus(updatedOrder.orderStatus) };
				   const payload = { status: "success", order: orderWithStatus };
				   console.log("PATCH response payload:", payload);
				   return NextResponse.json(payload);
			   }

			   // Non-payment update: allow updating fields like preferredDate, warrantyStatus, etc.
			   const updateData: any = { ...data };
			   // remove payment fields if present
			   delete updateData.paymentId;
			   delete updateData.amount;

			   // interpret orderStatus: if explicitly 0 -> do not change; otherwise coerce to Number
			   if (updateData.hasOwnProperty('orderStatus')) {
				   const s = Number(updateData.orderStatus);
				   if (s === 0) {
					   delete updateData.orderStatus; // do not change
				   } else {
					   updateData.orderStatus = s;
				   }
			   }

			   const updatedOrder = await prisma.order.update({ where: { id }, data: updateData });

			   const orderWithStatus = { ...updatedOrder, status: mapOrderStatus(updatedOrder.orderStatus) };
			   const payload = { status: "success", order: orderWithStatus };
			   console.log("PATCH response payload:", payload);
			   return NextResponse.json(payload);
		   }
	} catch (error) {
		console.error("PATCH /api/orders/list error:", error);
		const payload = { status: "error", message: "Internal server error" };
		console.log("PATCH response payload:", payload);
		return NextResponse.json(payload, { status: 500 });
	}
}
// TODO: implement orders list route
