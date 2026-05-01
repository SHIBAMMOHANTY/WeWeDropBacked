import type { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

type UploadedOrderRow = Record<string, unknown>;

type NormalizedOrderInput = {
  userId: string;
  businessId: string | null;
  membershipType: "BASIC" | "PREMIUM" | "ELITE";
  brandName: string;
  productName: string;
  imeiNumber: string;
  billImage: string;
  utrScreenshot: string | null;
  invoicePdf: string | null;
  serviceDate: Date;
  billingDate: Date | null;
  customerName: string;
  contactNumber: string;
  state: string | null;
  pincode: string | null;
  fullAddress: string | null;
  amount: number;
  paymentId: string | null;
  orderStatus: number;
  preferredDate: Date | null;
  warrantyStatus: string | null;
  issueType: string | null;
  area: string | null;
  pickupAddress: string | null;
  fix: string | null;
  remark: string | null;
  receiverName: string | null;
  mobileNumber: string | null;
  orderId: string | null;
};

type BulkUploadResult = {
  index: number;
  imeiNumber?: string;
  status: "created" | "updated" | "failed";
  message: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
      "text/json",
      "application/octet-stream",
    ]);

    const allowedExtensions = [".csv", ".xls", ".xlsx", ".json"];
    const originalName = file.originalname.toLowerCase();
    const hasAllowedExtension = allowedExtensions.some((extension) => originalName.endsWith(extension));

    if (allowedMimeTypes.has(file.mimetype) || hasAllowedExtension) {
      cb(null, true);
      return;
    }

    cb(new Error("Only CSV, Excel, and JSON files are allowed"));
  },
});

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise<void>((resolve, reject) => {
    fn(req, res, (result: unknown) => {
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve();
    });
  });
}

async function readRawBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function toOptionalString(value: unknown) {
  const text = toStringValue(value);
  return text.length > 0 ? text : null;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateValue(value: unknown) {
  if (!value && value !== 0) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toMembershipType(value: unknown): "BASIC" | "PREMIUM" | "ELITE" | null {
  const normalized = toStringValue(value).toUpperCase();
  if (normalized === "BASIC" || normalized === "PREMIUM" || normalized === "ELITE") {
    return normalized;
  }
  return null;
}

function toOrderStatus(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = toStringValue(value).toUpperCase();
  const statusMap: Record<string, number> = {
    PENDING: 0,
    PICKUP_REQUESTED: 1,
    REJECTED: -1,
    READY_FOR_PICKUP: 2,
    REPAIRING: 3,
    DELIVERED: 4,
  };

  if (normalized in statusMap) {
    return statusMap[normalized];
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickValue(row: UploadedOrderRow, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function normalizeRow(row: UploadedOrderRow): { data: NormalizedOrderInput; errors: string[] } {
  const errors: string[] = [];

  const userId = toStringValue(pickValue(row, ["userId", "user_id", "UserId", "USER_ID"]));
  const membershipType = toMembershipType(pickValue(row, ["membershipType", "membership_type", "MembershipType"]));
  const brandName = toStringValue(pickValue(row, ["brandName", "brand_name", "BrandName"]));
  const productName = toStringValue(pickValue(row, ["productName", "product_name", "ProductName"]));
  const imeiNumber = toStringValue(pickValue(row, ["imeiNumber", "imei_number", "IMEI", "imei"]));
  const amount = toNumberValue(pickValue(row, ["amount", "Amount", "totalAmount", "total_amount"]));

  if (!userId) errors.push("Missing userId");
  if (!membershipType) errors.push("Invalid membershipType");
  if (!brandName) errors.push("Missing brandName");
  if (!productName) errors.push("Missing productName");
  if (!imeiNumber) errors.push("Missing imeiNumber");
  if (amount === null) errors.push("Missing amount");

  const data: NormalizedOrderInput = {
    userId,
    businessId: toOptionalString(pickValue(row, ["businessId", "business_id", "BusinessId"])),
    membershipType: membershipType ?? "BASIC",
    brandName,
    productName,
    imeiNumber,
    billImage: toStringValue(pickValue(row, ["billImage", "bill_image", "BillImage"])) || "",
    utrScreenshot: toOptionalString(pickValue(row, ["utrScreenshot", "utr_screenshot", "UtrScreenshot"])),
    invoicePdf: toOptionalString(pickValue(row, ["invoicePdf", "invoice_pdf", "InvoicePdf"])),
    serviceDate: toDateValue(pickValue(row, ["serviceDate", "service_date", "ServiceDate"])) ?? new Date(),
    billingDate: toDateValue(pickValue(row, ["billingDate", "billing_date", "BillingDate"])),
    customerName: toStringValue(pickValue(row, ["customerName", "customer_name", "CustomerName"])) || "",
    contactNumber: toStringValue(pickValue(row, ["contactNumber", "contact_number", "ContactNumber"])),
    state: toOptionalString(pickValue(row, ["state", "State"])),
    pincode: toOptionalString(pickValue(row, ["pincode", "Pincode"])),
    fullAddress: toOptionalString(pickValue(row, ["fullAddress", "full_address", "FullAddress"])),
    amount: amount ?? 0,
    paymentId: toOptionalString(pickValue(row, ["paymentId", "payment_id", "PaymentId"])),
    orderStatus: toOrderStatus(pickValue(row, ["orderStatus", "order_status", "OrderStatus"])) ?? (membershipType === "BASIC" ? 1 : 0),
    preferredDate: toDateValue(pickValue(row, ["preferredDate", "preferred_date", "PreferredDate"])),
    warrantyStatus: toOptionalString(pickValue(row, ["warrantyStatus", "warranty_status", "WarrantyStatus"])),
    issueType: toOptionalString(pickValue(row, ["issueType", "issue_type", "IssueType"])),
    area: toOptionalString(pickValue(row, ["area", "Area"])),
    pickupAddress: toOptionalString(pickValue(row, ["pickupAddress", "pickup_address", "PickupAddress"])),
    fix: toOptionalString(pickValue(row, ["fix", "Fix"])),
    remark: toOptionalString(pickValue(row, ["remark", "Remark"])),
    receiverName: toOptionalString(pickValue(row, ["receiverName", "receiver_name", "ReceiverName"])),
    mobileNumber: toOptionalString(pickValue(row, ["mobileNumber", "mobile_number", "MobileNumber"])),
    orderId: toOptionalString(pickValue(row, ["orderId", "order_id", "OrderId"])),
  };

  if (!data.contactNumber) {
    data.contactNumber = "";
  }

  if (!data.fullAddress && data.pickupAddress) {
    data.fullAddress = data.pickupAddress;
  }

  if (!data.billImage) {
    data.billImage = "";
  }

  return { data, errors };
}

function parseJsonRows(buffer: Buffer) {
  const rawText = buffer.toString("utf8").trim();
  if (!rawText) {
    return [] as UploadedOrderRow[];
  }

  const parsed = JSON.parse(rawText) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as UploadedOrderRow[];
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { orders?: unknown[] }).orders)) {
    return (parsed as { orders: UploadedOrderRow[] }).orders;
  }

  throw new Error("JSON upload must be an array or an object with an orders array");
}

function parseCsvRows(buffer: Buffer) {
  return parseCsv(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as UploadedOrderRow[];
}

function parseExcelRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [] as UploadedOrderRow[];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<UploadedOrderRow>(worksheet, { defval: "" });
}

function parseUploadBuffer(file: { buffer: Buffer; originalname: string; mimetype: string }) {
  const lowerName = file.originalname.toLowerCase();
  if (file.mimetype === "application/json" || lowerName.endsWith(".json")) {
    return parseJsonRows(file.buffer);
  }

  if (file.mimetype === "text/csv" || file.mimetype === "application/csv" || lowerName.endsWith(".csv")) {
    return parseCsvRows(file.buffer);
  }

  if (
    file.mimetype === "application/vnd.ms-excel" ||
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx")
  ) {
    return parseExcelRows(file.buffer);
  }

  throw new Error("Only CSV, Excel, and JSON files are allowed");
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.replace("Bearer ", "");
    let user;
    try {
      user = verifyToken(token);
    } catch (_error) {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Only admin can upload orders" });
    }

    const contentType = req.headers["content-type"] || "";
    const isMultipart = contentType.includes("multipart/form-data");
    let rows: UploadedOrderRow[] = [];

    if (isMultipart) {
      await runMiddleware(req, res, upload.single("file"));
      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({ error: "Missing file field" });
      }
      rows = parseUploadBuffer(uploadedFile);
    } else if (contentType.includes("application/json")) {
      const rawBody = await readRawBody(req);
      rows = parseJsonRows(rawBody);
    } else {
      return res.status(400).json({ error: "Send a multipart file upload or a JSON payload" });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No order rows found in the upload" });
    }

    const normalizedRows = rows.map((row) => normalizeRow(row));
    const allUserIds = Array.from(new Set(normalizedRows.map((item) => item.data.userId).filter(Boolean)));
    const allBusinessIds = Array.from(new Set(normalizedRows.map((item) => item.data.businessId).filter((value): value is string => Boolean(value))));

    const [users, businesses] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: allUserIds } } }),
      allBusinessIds.length > 0 ? prisma.business.findMany({ where: { id: { in: allBusinessIds } } }) : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((entry) => [entry.id, entry]));
    const businessMap = new Map(businesses.map((entry) => [entry.id, entry]));

    const results: BulkUploadResult[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const [index, entry] of normalizedRows.entries()) {
      const { data, errors } = entry;

      if (!userMap.has(data.userId)) {
        errors.push(`Invalid userId: ${data.userId}`);
      }
      if (data.businessId && !businessMap.has(data.businessId)) {
        errors.push(`Invalid businessId: ${data.businessId}`);
      }
      if (!data.contactNumber) {
        errors.push("Missing contactNumber");
      }
      if (data.amount <= 0) {
        errors.push("Amount must be greater than 0");
      }

      if (errors.length > 0) {
        failedCount += 1;
        results.push({
          index,
          imeiNumber: data.imeiNumber,
          status: "failed",
          message: errors.join("; "),
        });
        continue;
      }

      try {
        const existingOrder = await prisma.order.findFirst({ where: { imeiNumber: data.imeiNumber } });
        const payload = {
          userId: data.userId,
          businessId: data.businessId,
          membershipType: data.membershipType,
          brandName: data.brandName,
          productName: data.productName,
          imeiNumber: data.imeiNumber,
          billImage: data.billImage,
          utrScreenshot: data.utrScreenshot,
          invoicePdf: data.invoicePdf,
          serviceDate: data.serviceDate,
          billingDate: data.billingDate,
          customerName: data.customerName,
          contactNumber: data.contactNumber,
          state: data.state,
          pincode: data.pincode,
          fullAddress: data.fullAddress ?? data.pickupAddress,
          amount: data.amount,
          paymentId: data.paymentId,
          orderStatus: data.orderStatus,
          preferredDate: data.preferredDate,
          warrantyStatus: data.warrantyStatus,
          issueType: data.issueType,
          area: data.area,
          pickupAddress: data.pickupAddress,
          fix: data.fix,
          remark: data.remark,
          receiverName: data.receiverName,
          mobileNumber: data.mobileNumber,
          ...(data.orderId ? { orderId: data.orderId } : {}),
        } as const;

        if (existingOrder) {
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: payload,
          });
          updatedCount += 1;
          results.push({
            index,
            imeiNumber: data.imeiNumber,
            status: "updated",
            message: "Order updated successfully",
          });
        } else {
          await prisma.order.create({
            data: payload,
          });
          createdCount += 1;
          results.push({
            index,
            imeiNumber: data.imeiNumber,
            status: "created",
            message: "Order created successfully",
          });
        }
      } catch (error) {
        failedCount += 1;
        results.push({
          index,
          imeiNumber: data.imeiNumber,
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to save order",
        });
      }
    }

    return res.status(200).json({
      message: "Bulk order upload completed",
      totalRows: rows.length,
      createdCount,
      updatedCount,
      failedCount,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload orders";
    return res.status(500).json({ error: message });
  }
}
