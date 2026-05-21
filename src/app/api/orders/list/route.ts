// TODO: implement orders list route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

// CORS headers
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

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

function toJsonSafe(value: any) {
	if (value === undefined) return undefined;
	return JSON.parse(JSON.stringify(value));
}

function formatInvoiceNumber(bulkOrderId: string) {
	return bulkOrderId.startsWith("BULK-") ? bulkOrderId.slice(5) : bulkOrderId;
}

function formatShortOrderId(orderId: string) {
	return orderId.replace(/^(DYVO-?)0+/, "$1");
}

function normalizeDateOnlyInput(value: unknown) {
	if (value == null || value === "") return value;
	if (value instanceof Date) {
		return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
	}

	const stringValue = String(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
		const [year, month, day] = stringValue.split("-").map(Number);
		return new Date(Date.UTC(year, month - 1, day));
	}

	const parsedDate = new Date(stringValue);
	return Number.isNaN(parsedDate.getTime()) ? value : parsedDate;
}

function formatDateOnly(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function recordOrderHistory(entry: {
	orderId: string;
	userId?: string | null;
	actionType: string;
	sourceType: string;
	sourceRoute: string;
	requestPayload?: any;
	appliedPayload?: any;
	beforeState?: any;
	afterState?: any;
	batchId?: string | null;
}) {
	const db: any = prisma;
	await db.orderHistory.create({
		data: {
			orderId: entry.orderId,
			userId: entry.userId ?? null,
			actionType: entry.actionType,
			sourceType: entry.sourceType,
			sourceRoute: entry.sourceRoute,
			requestPayload: toJsonSafe(entry.requestPayload) ?? null,
			appliedPayload: toJsonSafe(entry.appliedPayload) ?? null,
			beforeState: toJsonSafe(entry.beforeState) ?? null,
			afterState: toJsonSafe(entry.afterState) ?? null,
			batchId: entry.batchId ?? null,
		},
	});
}

async function propagateInvoiceStatusChanges(
	orderId: string,
	newOrderStatus?: number,
	newPaymentStatus?: number,
	paymentId?: string | null,
	sourceRoute = "/api/orders/list"
) {
	if (!paymentId) return;

	const siblingOrders = await prisma.order.findMany({
		where: {
			paymentId: paymentId,
			id: { not: orderId },
			deleted: false,
		},
	});

	for (const sibling of siblingOrders) {
		const beforeSibling = { ...sibling };
		const siblingUpdateData: any = {};

		if (newOrderStatus !== undefined && sibling.orderStatus !== newOrderStatus) {
			siblingUpdateData.orderStatus = newOrderStatus;
		}
		if (newPaymentStatus !== undefined && sibling.paymentStatus !== newPaymentStatus) {
			siblingUpdateData.paymentStatus = newPaymentStatus;
		}

		if (Object.keys(siblingUpdateData).length > 0) {
			const updatedSibling = await prisma.order.update({
				where: { id: sibling.id },
				data: siblingUpdateData,
			});

			await recordOrderHistory({
				orderId: sibling.id,
				userId: sibling.userId,
				actionType: "PATCH",
				sourceType: "INVOICE_PROPAGATE",
				sourceRoute: sourceRoute,
				requestPayload: { triggerOrderId: orderId, triggerPayload: siblingUpdateData },
				appliedPayload: siblingUpdateData,
				beforeState: beforeSibling,
				afterState: updatedSibling,
			});
		}
	}
}

async function getLatestPaymentMeta(orderId: string) {
	const payment = await prisma.payment.findFirst({
		where: { orderId },
		select: { createdAt: true, paymentDate: true, paymentStatus: true },
		orderBy: { createdAt: "desc" },
	});

	return {
		paymentDate: payment?.paymentDate ?? payment?.createdAt ?? null,
		paymentStatus: payment?.paymentStatus ?? null,
	};
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

// GET /api/orders/list?userId=123
export async function OPTIONS(req: NextRequest) {
	return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const userId = searchParams.get("userId");
		const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
		const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50", 10)));
		const skip = (page - 1) * limit;

		if (!userId) {
			return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: corsHeaders });
		}

		const isLowPriorityServiceDate = (value: Date | string | null | undefined) => {
			if (!value) return false;
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return false;
			const year = date.getUTCFullYear();
			return year <= 2025;
		};

		const [orders, totalCount] = await Promise.all([
			prisma.order.findMany({
				where: { userId: userId, deleted: false },
				orderBy: { createdAt: "desc" },
				skip,
				take: limit,
			}),
			prisma.order.count({
				where: { userId: userId, deleted: false },
			}),
		]);

		// Sort low-priority serviceDate orders to bottom (within this page)
		orders.sort((left, right) => {
			const leftLowPriority = isLowPriorityServiceDate(left.serviceDate);
			const rightLowPriority = isLowPriorityServiceDate(right.serviceDate);

			if (leftLowPriority !== rightLowPriority) {
				return leftLowPriority ? 1 : -1;
			}

			return 0;
		});

		const orderIds = orders.map(order => order.id);
		const payments = orderIds.length > 0
			? await prisma.payment.findMany({
				where: { orderId: { in: orderIds } },
				select: {
					orderId: true,
					createdAt: true,
					paymentDate: true,
					paymentStatus: true,
				},
				orderBy: { createdAt: "desc" },
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

		const ordersWithStatus = orders.map(order => ({
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
			utrScreenshot: order.utrScreenshot ?? null,
			invoicePdf: order.invoicePdf ?? null,
			serviceDate: formatDateOnly(order.serviceDate),
			deliveryDate: formatDateOnly(order.deliveryDate),
			serviceCenterDate: formatDateOnly(order.serviceCenterDate),
			billingDate: order.billingDate ?? null,
			orderDate: order.createdAt,
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
			remark: order.remark ?? null,
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
			status: mapOrderStatus(order.orderStatus),
		}));

		return NextResponse.json({
			orders: ordersWithStatus,
			totalCount,
			page,
			limit,
			totalPages: Math.ceil(totalCount / limit)
		}, { headers: corsHeaders });
	} catch (error) {
		console.error("GET /api/orders/list error:", error);
		return NextResponse.json({ error: "Failed to fetch all orders" }, { status: 500, headers: corsHeaders });
	}
}

// PATCH /api/orders/list
export async function PATCH(req: NextRequest) {
	try {
		const data = await req.json();

		const resolveOrderByKey = async (key: string) => {
			let order = await prisma.order.findUnique({ where: { id: key } });
			if (!order) {
				order = await prisma.order.findUnique({ where: { orderId: key } });
			}
			return order;
		};

		// Bulk update with individual amounts
		if (Array.isArray(data.orders) && data.orders.length > 0) {
			const topPaymentId = data.paymentId ?? null;
			const clientBulkId =
				typeof data.bulkOrderId === "string" && data.bulkOrderId.trim().length > 0
					? data.bulkOrderId.trim()
					: typeof data.orderId === "string" && data.orderId.trim().length > 0
						? data.orderId.trim()
						: null;
			let sharedBulkId =
				clientBulkId
					? clientBulkId.startsWith("BULK-")
						? clientBulkId
						: /^DYVO-\d+$/.test(clientBulkId)
							? `BULK-${clientBulkId}`
							: clientBulkId
					: null;

			const allExistingOrderIds = await prisma.order.findMany({
				where: { orderId: { not: null } },
				select: { orderId: true },
			});
			let maxOrderNum = 0;
			const reservedOrderIds = new Set<string>();
			const updatedOrders: { id: string, orderId: string, invoiceNumber: string, individualOrderId?: string }[] = [];
			for (const item of allExistingOrderIds) {
				if (!item.orderId) continue;
				reservedOrderIds.add(item.orderId);
				const match = item.orderId.match(/^DYVO-(\d+)$/);
				if (!match) continue;
				const n = parseInt(match[1], 10);
				if (!Number.isNaN(n) && n > maxOrderNum) maxOrderNum = n;
			}

			for (const item of data.orders) {
				// Accept either `id`/`_id` or business `orderId` from caller
				const orderKey = item.id ?? item._id ?? item.orderId;
				const amount = item.amount ?? item.total ?? null;
				const itemPaymentId = item.paymentId ?? topPaymentId;
				const utrScreenshot = item.utrScreenshot ?? null;
				const warrantyStatus = item.warrantyStatus ?? null;

				if (orderKey == null || amount == null) {
					const payload = { status: "error", message: "Missing order id or amount in bulk item" };
					console.log("PATCH response payload:", payload);
					return NextResponse.json(payload, { status: 400, headers: corsHeaders });
				}
				if (!itemPaymentId) {
					const payload = { status: "error", message: "Missing paymentId for some bulk items" };
					console.log("PATCH response payload:", payload);
					return NextResponse.json(payload, { status: 400, headers: corsHeaders });
				}

				const orderIdStr = String(orderKey);
				let order = await resolveOrderByKey(orderIdStr);
				if (!order) {
					const payload = { status: "error", message: `Order not found for key: ${orderIdStr}` };
					console.log("PATCH response payload:", payload);
					return NextResponse.json(payload, { status: 404, headers: corsHeaders });
				}
				const beforeOrder = order ? { ...order } : null;
				let generatedOrderId = order?.orderId;
				if (order && !order.orderId) {
					// Generate new orderId
					do {
						maxOrderNum++;
						generatedOrderId = `DYVO-${String(maxOrderNum).padStart(4, "0")}`;
					} while (reservedOrderIds.has(generatedOrderId));
					reservedOrderIds.add(generatedOrderId);
					await prisma.order.update({
						where: { id: order.id },
						data: { orderId: generatedOrderId }
					});
					// Refresh order
					order = await prisma.order.findUnique({ where: { id: order.id } });
				}
				if (order) {
					if (!sharedBulkId) {
						const baseId = generatedOrderId || order.orderId;
						sharedBulkId = baseId ? `BULK-${baseId}` : `BULK-${Date.now()}`;
					}
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
					const updateData: any = { paymentId: itemPaymentId, amount: parseFloat(String(amount)) };

					let newPaymentStatus: number | undefined;
					if (item.hasOwnProperty('paymentStatus')) {
						newPaymentStatus = Number(item.paymentStatus);
						updateData.paymentStatus = newPaymentStatus;
					}

				// If pickupAddress is in payload, set fullAddress to pickupAddress value
				if (item.pickupAddress !== undefined) {
					updateData.fullAddress = item.pickupAddress;
				}
				if (newStatus !== undefined) updateData.orderStatus = newStatus;
					if (utrScreenshot !== null) updateData.utrScreenshot = utrScreenshot;
					if (warrantyStatus !== null) updateData.warrantyStatus = warrantyStatus;
					if (item.receiverName !== undefined) updateData.receiverName = item.receiverName;
					if (item.mobileNumber !== undefined) updateData.mobileNumber = item.mobileNumber;
					await prisma.order.update({
						where: { id: order.id },
						data: updateData,
					});
					await prisma.payment.create({
						data: {
							userId: order.userId,
							orderId: order.id,
							amount: parseFloat(String(amount)),
							status: "PENDING",
							paymentStatus: newPaymentStatus ?? 0,
							paymentDate: new Date(),
							razorpayId: itemPaymentId || null,
						}
					});
					if (itemPaymentId) {
						await propagateInvoiceStatusChanges(
							order.id,
							newStatus,
							newPaymentStatus,
							itemPaymentId,
							"/api/orders/list"
						);
					}
					await recordOrderHistory({
						orderId: order.id,
						userId: order.userId,
						actionType: "PATCH",
						sourceType: "MULTI_UPDATE",
						sourceRoute: "/api/orders/list",
						requestPayload: item,
						appliedPayload: updateData,
						beforeState: beforeOrder,
						afterState: { ...(await prisma.order.findUnique({ where: { id: order.id } })) },
						batchId: sharedBulkId,
					});
					updatedOrders.push({
						id: order.id,
						orderId: formatShortOrderId(generatedOrderId || order.orderId || order.id),
						invoiceNumber: formatInvoiceNumber(sharedBulkId),
						individualOrderId: generatedOrderId || order.orderId || "",
					});
				}
			}
			const payload = { status: "success", bulkOrderId: sharedBulkId, updatedOrders };
			console.log("PATCH response payload:", payload);
			return NextResponse.json(payload, { headers: corsHeaders });
		} else if (data.orderIds && Array.isArray(data.orderIds)) {
			// Bulk update for marking orders as paid (legacy)
			const clientBulkId =
				typeof data.bulkOrderId === "string" && data.bulkOrderId.trim().length > 0
					? data.bulkOrderId.trim()
					: typeof data.orderId === "string" && data.orderId.trim().length > 0
						? data.orderId.trim()
						: null;
			const sharedBulkId =
				clientBulkId
					? clientBulkId.startsWith("BULK-")
						? clientBulkId
						: /^DYVO-\d+$/.test(clientBulkId)
							? `BULK-${clientBulkId}`
							: clientBulkId
					: `BULK-${Date.now()}`;
			const paymentId = data.paymentId;
			const amount = data.amount;
			const utrScreenshot = data.utrScreenshot ?? null;
			const warrantyStatus = data.warrantyStatus ?? null;
			if (!paymentId) {
				const payload = { status: "error", message: "Missing paymentId for bulk update" };
				console.log("PATCH response payload:", payload);
				return NextResponse.json(payload, { status: 400, headers: corsHeaders });
			}
			if (amount == null) {
				const payload = { status: "error", message: "Missing amount for bulk update" };
				console.log("PATCH response payload:", payload);
				return NextResponse.json(payload, { status: 400, headers: corsHeaders });
			}

			const updatedOrders: { id: string, orderId: string, invoiceNumber: string, individualOrderId?: string }[] = [];
			for (const orderId of data.orderIds) {
				const orderIdStr = String(orderId);
				const order = await resolveOrderByKey(orderIdStr);
				const beforeOrder = order ? { ...order } : null;
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
					const updateData: any = { paymentId, amount: parseFloat(String(amount)) };

					let newPaymentStatus: number | undefined;
					if (data.hasOwnProperty('paymentStatus')) {
						newPaymentStatus = Number(data.paymentStatus);
						updateData.paymentStatus = newPaymentStatus;
					}

				// If pickupAddress is in payload, set fullAddress to pickupAddress value
				if (data.pickupAddress !== undefined) {
					updateData.fullAddress = data.pickupAddress;
				}
				if (newStatus !== undefined) updateData.orderStatus = newStatus;
					if (utrScreenshot !== null) updateData.utrScreenshot = utrScreenshot;
					if (warrantyStatus !== null) updateData.warrantyStatus = warrantyStatus;
					if (data.receiverName !== undefined) updateData.receiverName = data.receiverName;
					if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
					await prisma.order.update({
						where: { id: order.id },
						data: updateData,
					});
					await prisma.payment.create({
						data: {
							userId: order.userId,
							orderId: order.id,
							amount: parseFloat(String(amount)),
							status: "PENDING",
							paymentStatus: newPaymentStatus ?? 0,
							paymentDate: new Date(),
							razorpayId: null,
						}
					});
					if (paymentId) {
						await propagateInvoiceStatusChanges(
							order.id,
							newStatus,
							newPaymentStatus,
							paymentId,
							"/api/orders/list"
						);
					}
					await recordOrderHistory({
						orderId: order.id,
						userId: order.userId,
						actionType: "PATCH",
						sourceType: "MULTI_UPDATE",
						sourceRoute: "/api/orders/list",
						requestPayload: data,
						appliedPayload: updateData,
						beforeState: beforeOrder,
						afterState: { ...(await prisma.order.findUnique({ where: { id: order.id } })) },
						batchId: sharedBulkId,
					});
					updatedOrders.push({
						id: order.id,
						orderId: formatShortOrderId(order.orderId || order.id),
						invoiceNumber: formatInvoiceNumber(sharedBulkId),
						individualOrderId: order.orderId || "",
					});
				}
			}
			const payload = { status: "success", bulkOrderId: sharedBulkId, updatedOrders };
			console.log("PATCH response payload:", payload);
			return NextResponse.json(payload, { headers: corsHeaders });
		} else {
			// Single order update
			const { searchParams } = new URL(req.url);
			const id = searchParams.get("id");
			if (!id) {
				const payload = { status: "error", message: "Missing id for single update" };
				console.log("PATCH response payload:", payload);
				return NextResponse.json(payload, { status: 400, headers: corsHeaders });
			}

			const isPaymentUpdate = data.hasOwnProperty('paymentId') || data.hasOwnProperty('amount');

			if (isPaymentUpdate) {
				// payment flow requires both paymentId and amount
				const paymentId = data.paymentId;
				const amount = data.amount;
				const utrScreenshot = data.utrScreenshot ?? null;
				const warrantyStatus = data.warrantyStatus ?? null;
				if (!paymentId) {
					const payload = { status: "error", message: "Missing paymentId for single update" };
					console.log("PATCH response payload:", payload);
					return NextResponse.json(payload, { status: 400, headers: corsHeaders });
				}
				if (amount == null) {
					const payload = { status: "error", message: "Missing amount for single update" };
					console.log("PATCH response payload:", payload);
					return NextResponse.json(payload, { status: 400, headers: corsHeaders });
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

				const updateData: any = { paymentId: data.paymentId, amount: parseFloat(String(amount)) };

				let newPaymentStatus: number | undefined;
				if (data.hasOwnProperty('paymentStatus')) {
					newPaymentStatus = Number(data.paymentStatus);
					updateData.paymentStatus = newPaymentStatus;
				}

				if (data.serviceDate !== undefined) {
					updateData.serviceDate = normalizeDateOnlyInput(data.serviceDate);
				}
				if (data.deliveryDate !== undefined) {
					updateData.deliveryDate = normalizeDateOnlyInput(data.deliveryDate);
				}
				if (data.serviceCenterDate !== undefined) {
					updateData.serviceCenterDate = normalizeDateOnlyInput(data.serviceCenterDate);
				}
				// If pickupAddress is in payload, set fullAddress to pickupAddress value
				if (data.pickupAddress !== undefined) {
					updateData.fullAddress = data.pickupAddress;
				}
				if (newStatus !== undefined) updateData.orderStatus = newStatus;
				if (utrScreenshot !== null) updateData.utrScreenshot = utrScreenshot;
				if (warrantyStatus !== null) updateData.warrantyStatus = warrantyStatus;
				if (data.receiverName !== undefined) updateData.receiverName = data.receiverName;
				if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
				const beforeOrder = await prisma.order.findUnique({ where: { id } });
				const updatedOrder = await prisma.order.update({ where: { id }, data: updateData });

				await prisma.payment.create({
					data: {
						userId: updatedOrder.userId,
						orderId: updatedOrder.id,
						amount: parseFloat(String(amount)),
						status: "PENDING",
						paymentStatus: newPaymentStatus ?? 0,
						paymentDate: new Date(),
						razorpayId: null,
					}
				});
				if (paymentId) {
					await propagateInvoiceStatusChanges(
						id,
						newStatus,
						newPaymentStatus,
						paymentId,
						"/api/orders/list"
					);
				}
				await recordOrderHistory({
					orderId: id,
					userId: updatedOrder.userId,
					actionType: "PATCH",
					sourceType: "SINGLE_UPDATE",
					sourceRoute: "/api/orders/list",
					requestPayload: data,
					appliedPayload: updateData,
					beforeState: beforeOrder,
					afterState: updatedOrder,
				});

				const orderWithStatus = {
					...updatedOrder,
					serviceDate: formatDateOnly(updatedOrder.serviceDate),
					deliveryDate: formatDateOnly(updatedOrder.deliveryDate),
					serviceCenterDate: formatDateOnly(updatedOrder.serviceCenterDate),
					status: mapOrderStatus(updatedOrder.orderStatus),
					...(await getLatestPaymentMeta(updatedOrder.id)),
				};
				const payload = { status: "success", order: orderWithStatus };
				console.log("PATCH response payload:", payload);
				return NextResponse.json(payload, { headers: corsHeaders });
			} else {
				// Non-payment update: allow updating fields like preferredDate, warrantyStatus, etc.
				const updateData: any = { ...data };
				// remove payment fields if present
				delete updateData.paymentId;
				delete updateData.amount;
				if (updateData.serviceDate !== undefined) {
					updateData.serviceDate = normalizeDateOnlyInput(updateData.serviceDate);
				}
				if (updateData.deliveryDate !== undefined) {
					updateData.deliveryDate = normalizeDateOnlyInput(updateData.deliveryDate);
				}
				if (updateData.serviceCenterDate !== undefined) {
					updateData.serviceCenterDate = normalizeDateOnlyInput(updateData.serviceCenterDate);
				}
			// If pickupAddress is in payload, set fullAddress to pickupAddress value
			if (updateData.pickupAddress !== undefined) {
				updateData.fullAddress = updateData.pickupAddress;
			}

			// interpret orderStatus: if explicitly 0 -> do not change; otherwise coerce to Number
			let shouldGenerateOrderId = false;
			if (updateData.hasOwnProperty('orderStatus')) {
				const s = Number(updateData.orderStatus);
				if (s === 0) {
					delete updateData.orderStatus; // do not change
				} else {
					updateData.orderStatus = s;
					if (s === 1) {
						shouldGenerateOrderId = true;
					}
				}
			}

			if (updateData.hasOwnProperty('paymentStatus')) {
				updateData.paymentStatus = Number(updateData.paymentStatus);
			}

			// Generate orderId if status is 1 and orderId does not exist
			let generatedOrderId = null;
			if (shouldGenerateOrderId) {
				const order = await prisma.order.findUnique({ where: { id } });
				if (order && !order.orderId) {
					// Find the current max orderId number
					const maxOrderIdOrder = await prisma.order.findMany({
						where: { orderId: { not: null } },
						orderBy: { orderId: "desc" },
						take: 1
					});
					let maxOrderNum = 0;
					if (maxOrderIdOrder.length > 0 && maxOrderIdOrder[0].orderId) {
						const match = maxOrderIdOrder[0].orderId.match(/DYVO-(\d+)/);
						if (match) maxOrderNum = parseInt(match[1], 10);
					}
					maxOrderNum++;
					generatedOrderId = `DYVO-${String(maxOrderNum).padStart(4, "0")}`;
					updateData.orderId = generatedOrderId;
				}
			}

			const beforeOrder = await prisma.order.findUnique({ where: { id } });
			const updatedOrder = await prisma.order.update({ where: { id }, data: updateData });

			if (updatedOrder.paymentId) {
				await propagateInvoiceStatusChanges(
					id,
					updateData.orderStatus,
					updateData.paymentStatus,
					updatedOrder.paymentId,
					"/api/orders/list"
				);
			}

			await recordOrderHistory({
				orderId: id,
				userId: updatedOrder.userId,
				actionType: "PATCH",
				sourceType: "SINGLE_UPDATE",
				sourceRoute: "/api/orders/list",
				requestPayload: data,
				appliedPayload: updateData,
				beforeState: beforeOrder,
				afterState: { ...(await prisma.order.findUnique({ where: { id } })) },
			});

			const orderWithStatus = {
				...updatedOrder,
				serviceDate: formatDateOnly(updatedOrder.serviceDate),
				deliveryDate: formatDateOnly(updatedOrder.deliveryDate),
				serviceCenterDate: formatDateOnly(updatedOrder.serviceCenterDate),
				status: mapOrderStatus(updatedOrder.orderStatus),
				...(await getLatestPaymentMeta(updatedOrder.id)),
			};
			const payload = { status: "success", order: orderWithStatus, orderId: generatedOrderId };
			console.log("PATCH response payload:", payload);
			return NextResponse.json(payload, { headers: corsHeaders });
			}
		}
	} catch (error) {
		console.error("PATCH /api/orders/list error:", error);
		const payload = { status: "error", message: "Internal server error" };
		console.log("PATCH response payload:", payload);
		return NextResponse.json(payload, { status: 500, headers: corsHeaders });
	}
}

// Helper function to validate order data for bulk upload
function validateOrderData(row: any, rowIndex: number): { valid: boolean; errors: any[]; data?: any } {
	const errors: any[] = [];

	// Required fields validation
	if (!row.userId) {
		errors.push({ row: rowIndex, field: "userId", message: "userId is required" });
	}
	if (!row.membershipType || !["BASIC", "PREMIUM", "ELITE"].includes(row.membershipType)) {
		errors.push({ row: rowIndex, field: "membershipType", message: "membershipType must be BASIC, PREMIUM, or ELITE" });
	}
	if (!row.brandName) {
		errors.push({ row: rowIndex, field: "brandName", message: "brandName is required" });
	}
	if (!row.productName) {
		errors.push({ row: rowIndex, field: "productName", message: "productName is required" });
	}
	if (!row.imeiNumber) {
		errors.push({ row: rowIndex, field: "imeiNumber", message: "imeiNumber is required" });
	}
	if (!row.billImage) {
		errors.push({ row: rowIndex, field: "billImage", message: "billImage is required" });
	}
	if (!row.serviceDate) {
		errors.push({ row: rowIndex, field: "serviceDate", message: "serviceDate is required" });
	}
	if (!row.customerName) {
		errors.push({ row: rowIndex, field: "customerName", message: "customerName is required" });
	}
	if (!row.contactNumber) {
		errors.push({ row: rowIndex, field: "contactNumber", message: "contactNumber is required" });
	}
	if (!row.amount) {
		errors.push({ row: rowIndex, field: "amount", message: "amount is required" });
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	const orderData: any = {
		userId: row.userId,
		membershipType: row.membershipType,
		brandName: row.brandName,
		productName: row.productName,
		imeiNumber: row.imeiNumber,
		billImage: row.billImage,
		serviceDate: row.serviceDate,
		customerName: row.customerName,
		contactNumber: row.contactNumber,
		amount: parseFloat(row.amount),
		businessId: row.businessId || undefined,
		deliveryAgentId: row.deliveryAgentId || undefined,
		utrScreenshot: row.utrScreenshot || undefined,
		invoicePdf: row.invoicePdf || undefined,
		billingDate: row.billingDate || undefined,
		state: row.state || undefined,
		pincode: row.pincode || undefined,
		fullAddress: row.fullAddress || undefined,
		preferredDate: row.preferredDate || undefined,
		warrantyStatus: row.warrantyStatus || undefined,
		issueType: row.issueType || undefined,
		area: row.area || undefined,
		pickupAddress: row.pickupAddress || undefined,
		fix: row.fix || undefined,
		remark: row.remark || undefined,
		receiverName: row.receiverName || undefined,
		mobileNumber: row.mobileNumber || undefined,
		paymentId: row.paymentId || undefined,
		expireDate: row.expireDate || undefined,
	};

	return { valid: true, errors: [], data: orderData };
}

// Helper function to parse file based on extension
async function parseFile(fileBuffer: Buffer, fileExtension: string): Promise<any[]> {
	if (fileExtension === ".csv") {
		const fileContent = fileBuffer.toString("utf-8");
		return csvParse(fileContent, {
			columns: true,
			skip_empty_lines: true,
		});
	} else if (fileExtension === ".xlsx" || fileExtension === ".xls") {
		const workbook = XLSX.read(fileBuffer, { type: "buffer" });
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		return XLSX.utils.sheet_to_json(worksheet);
	} else if (fileExtension === ".json") {
		const fileContent = fileBuffer.toString("utf-8");
		return JSON.parse(fileContent);
	}
	throw new Error("Unsupported file format");
}

// POST handler for bulk upload
export async function POST(req: NextRequest) {
	try {
		// Verify authorization header
		const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401, headers: corsHeaders });
		}

		const token = authHeader.slice(7);
		let decodedToken: any;
		try {
			decodedToken = verifyToken(token);
		} catch (error) {
			return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: corsHeaders });
		}

		// Verify user is admin
		const user = await prisma.user.findUnique({
			where: { id: decodedToken.id },
		});

		if (!user || user.role !== "SUPER_ADMIN") {
			return NextResponse.json({ error: "Only admins can perform bulk uploads" }, { status: 403, headers: corsHeaders });
		}

		// Parse form data
		const formData = await req.formData();
		const file = formData.get("file") as File;

		if (!file) {
			return NextResponse.json({ error: "No file provided" }, { status: 400, headers: corsHeaders });
		}

		// Get file extension
		const fileExtension = path.extname(file.name).toLowerCase();
		const allowedExtensions = [".csv", ".xlsx", ".xls", ".json"];

		if (!allowedExtensions.includes(fileExtension)) {
			return NextResponse.json(
				{ error: "Invalid file type. Only CSV, Excel (.xlsx, .xls), and JSON files are allowed." },
				{ status: 400, headers: corsHeaders }
			);
		}

		const buffer = await file.arrayBuffer();
		const batchId = `${Date.now()}-${file.name}`;

		// Parse file
		let rows: any[] = [];
		try {
			rows = await parseFile(Buffer.from(buffer), fileExtension);
		} catch (parseError: any) {
			return NextResponse.json({ error: `File parsing error: ${parseError.message}` }, { status: 400, headers: corsHeaders });
		}

		if (!Array.isArray(rows) || rows.length === 0) {
			return NextResponse.json({ error: "File is empty or contains no valid data" }, { status: 400, headers: corsHeaders });
		}

		// Validate and process orders
		const result: any = {
			successCount: 0,
			failureCount: 0,
			errors: [],
			successfulOrders: [],
			summary: "",
		};

		for (let i = 0; i < rows.length; i++) {
			const { valid, errors, data } = validateOrderData(rows[i], i + 2); // i+2 because row 1 is header

			if (!valid) {
				result.failureCount++;
				result.errors.push(...errors);
				continue;
			}

			try {
				// Check if user exists
				const orderUser = await prisma.user.findUnique({
					where: { id: data!.userId },
				});

				if (!orderUser) {
					result.failureCount++;
					result.errors.push({
						row: i + 2,
						field: "userId",
						message: `User with ID ${data!.userId} not found`,
					});
					continue;
				}

				// Check for duplicate IMEI
				const existingOrder = await prisma.order.findFirst({
					where: { imeiNumber: data!.imeiNumber },
				});

				if (existingOrder) {
					result.failureCount++;
					result.errors.push({
						row: i + 2,
						field: "imeiNumber",
						message: `Order with IMEI ${data!.imeiNumber} already exists`,
					});
					continue;
				}

				// Create order
				const newOrder = await prisma.order.create({
					data: {
						userId: data!.userId,
						membershipType: data!.membershipType as any,
						brandName: data!.brandName,
						productName: data!.productName,
						imeiNumber: data!.imeiNumber,
						billImage: data!.billImage,
						serviceDate: new Date(data!.serviceDate),
						customerName: data!.customerName,
						contactNumber: data!.contactNumber,
						amount: data!.amount,
						businessId: data!.businessId,
						deliveryAgentId: data!.deliveryAgentId,
						utrScreenshot: data!.utrScreenshot,
						invoicePdf: data!.invoicePdf,
						billingDate: data!.billingDate ? new Date(data!.billingDate) : undefined,
						state: data!.state,
						pincode: data!.pincode,
						fullAddress: data!.fullAddress,
						preferredDate: data!.preferredDate ? new Date(data!.preferredDate) : undefined,
						warrantyStatus: data!.warrantyStatus,
						issueType: data!.issueType,
						area: data!.area,
						pickupAddress: data!.pickupAddress,
						fix: data!.fix,
						remark: data!.remark,
						receiverName: data!.receiverName,
						mobileNumber: data!.mobileNumber,
						paymentId: data!.paymentId,
						expireDate: data!.expireDate ? new Date(data!.expireDate) : undefined,
						orderStatus: 0, // PENDING by default
					},
				});
				await recordOrderHistory({
					orderId: newOrder.id,
					userId: newOrder.userId,
					actionType: "POST",
					sourceType: "BULK_UPLOAD",
					sourceRoute: "/api/orders/list",
					requestPayload: rows[i],
					appliedPayload: data,
					afterState: newOrder,
					batchId,
				});

				result.successCount++;
				result.successfulOrders.push(newOrder.id);
			} catch (dbError: any) {
				result.failureCount++;
				result.errors.push({
					row: i + 2,
					field: "general",
					message: `Database error: ${dbError.message}`,
				});
			}
		}

		result.summary = `Successfully created ${result.successCount} orders. ${result.failureCount} orders failed to create.`;

		return NextResponse.json(result, { headers: corsHeaders });
	} catch (error: any) {
		console.error("Error in bulk upload:", error);
		return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500, headers: corsHeaders });
	}
}
