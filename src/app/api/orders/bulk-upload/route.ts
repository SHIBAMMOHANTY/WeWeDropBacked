export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import path from "path";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface OrderData {
  userId: string;
  businessId?: string;
  deliveryAgentId?: string;
  membershipType: string;
  brandName: string;
  productName: string;
  imeiNumber: string;
  billImage: string;
  utrScreenshot?: string;
  invoicePdf?: string;
  serviceDate: string;
  deliveryDate?: string;
  serviceCenterDate?: string;
  billingDate?: string;
  customerName: string;
  contactNumber: string;
  state?: string;
  pincode?: string;
  fullAddress?: string;
  preferredDate?: string;
  warrantyStatus?: string;
  issueType?: string;
  area?: string;
  pickupAddress?: string;
  fix?: string;
  remark?: string;
  receiverName?: string;
  mobileNumber?: string;
  amount: number;
  paymentId?: string;
  expireDate?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface UploadResult {
  successCount: number;
  failureCount: number;
  errors: ValidationError[];
  successfulOrders: string[];
  summary: string;
}

interface ValidatedRow {
  rowNumber: number;
  data: OrderData;
}

const DB_LOOKUP_CHUNK_SIZE = 500;
const ORDER_INSERT_BATCH_SIZE = 100;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_BULK_ROWS = 5000;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Helper function to validate order data
function validateOrderData(row: any, rowIndex: number): { valid: boolean; errors: ValidationError[]; data?: OrderData } {
  const errors: ValidationError[] = [];

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
  if (row.amount === undefined || row.amount === null || row.amount === "") {
    errors.push({ row: rowIndex, field: "amount", message: "amount is required" });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const amount = Number.parseFloat(String(row.amount));
  if (Number.isNaN(amount)) {
    errors.push({ row: rowIndex, field: "amount", message: "amount must be a valid number" });
    return { valid: false, errors };
  }

  const orderData: OrderData = {
    userId: row.userId,
    membershipType: row.membershipType,
    brandName: row.brandName,
    productName: row.productName,
    imeiNumber: row.imeiNumber,
    billImage: row.billImage,
    serviceDate: row.serviceDate,
    deliveryDate: row.deliveryDate || undefined,
    serviceCenterDate: row.serviceCenterDate || undefined,
    customerName: row.customerName,
    contactNumber: row.contactNumber,
    amount,
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

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST handler for bulk upload
export async function POST(req: NextRequest) {
  try {
    // Verify authorization header
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const response = NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    const token = authHeader.slice(7);
    let decodedToken: any;
    try {
      decodedToken = verifyToken(token);
    } catch (error) {
      const response = NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Verify user is admin
    const user = await prisma.user.findUnique({
      where: { id: decodedToken.id },
    });

    if (!user || user.role !== "SUPER_ADMIN") {
      const response = NextResponse.json({ error: "Only admins can perform bulk uploads" }, { status: 403 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      const response = NextResponse.json({ error: "No file provided" }, { status: 400 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const response = NextResponse.json(
        { error: "File is too large. Maximum allowed size is 20MB." },
        { status: 413 }
      );
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Get file extension
    const fileExtension = path.extname(file.name).toLowerCase();
    const allowedExtensions = [".csv", ".xlsx", ".xls", ".json"];

    if (!allowedExtensions.includes(fileExtension)) {
      const response = NextResponse.json(
        { error: "Invalid file type. Only CSV, Excel (.xlsx, .xls), and JSON files are allowed." },
        { status: 400 }
      );
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    const buffer = await file.arrayBuffer();

    // Parse file
    let rows: any[] = [];
    try {
      rows = await parseFile(Buffer.from(buffer), fileExtension);
    } catch (parseError: any) {
      const response = NextResponse.json({ error: `File parsing error: ${parseError.message}` }, { status: 400 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      const response = NextResponse.json({ error: "File is empty or contains no valid data" }, { status: 400 });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    if (rows.length > MAX_BULK_ROWS) {
      const response = NextResponse.json(
        { error: `Too many rows. Maximum allowed rows per upload is ${MAX_BULK_ROWS}.` },
        { status: 413 }
      );
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    const result: UploadResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
      successfulOrders: [],
      summary: "",
    };

    const validatedRows: ValidatedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const { valid, errors, data } = validateOrderData(rows[i], i + 2); // i+2 because row 1 is header

      if (!valid) {
        result.failureCount++;
        result.errors.push(...errors);
        continue;
      }

      validatedRows.push({ rowNumber: i + 2, data: data! });
    }

    // Batch user lookups for all valid rows to avoid per-row queries.
    const uniqueUserIds = [...new Set(validatedRows.map((row) => row.data.userId))];
    const validUserIds = new Set<string>();

    for (const userIdChunk of chunkArray(uniqueUserIds, DB_LOOKUP_CHUNK_SIZE)) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIdChunk } },
        select: { id: true },
      });

      for (const foundUser of users) {
        validUserIds.add(foundUser.id);
      }
    }

    // Batch IMEI lookups to detect existing duplicates up front.
    const uniqueImeis = [...new Set(validatedRows.map((row) => row.data.imeiNumber))];
    const existingImeis = new Set<string>();

    for (const imeiChunk of chunkArray(uniqueImeis, DB_LOOKUP_CHUNK_SIZE)) {
      const existingOrders = await prisma.order.findMany({
        where: { imeiNumber: { in: imeiChunk } },
        select: { imeiNumber: true },
      });

      for (const existingOrder of existingOrders) {
        existingImeis.add(existingOrder.imeiNumber);
      }
    }

    const seenImeisInFile = new Set<string>();
    const rowsToInsert: ValidatedRow[] = [];
    const insertedImeis: string[] = [];

    for (const row of validatedRows) {
      if (!validUserIds.has(row.data.userId)) {
        result.failureCount++;
        result.errors.push({
          row: row.rowNumber,
          field: "userId",
          message: `User with ID ${row.data.userId} not found`,
        });
        continue;
      }

      if (existingImeis.has(row.data.imeiNumber)) {
        result.failureCount++;
        result.errors.push({
          row: row.rowNumber,
          field: "imeiNumber",
          message: `Order with IMEI ${row.data.imeiNumber} already exists`,
        });
        continue;
      }

      if (seenImeisInFile.has(row.data.imeiNumber)) {
        result.failureCount++;
        result.errors.push({
          row: row.rowNumber,
          field: "imeiNumber",
          message: `Duplicate IMEI ${row.data.imeiNumber} in uploaded file`,
        });
        continue;
      }

      seenImeisInFile.add(row.data.imeiNumber);
      rowsToInsert.push(row);
    }

    for (const batch of chunkArray(rowsToInsert, ORDER_INSERT_BATCH_SIZE)) {
      const createPayload = batch.map(({ data }) => ({
        userId: data.userId,
        membershipType: data.membershipType as any,
        brandName: data.brandName,
        productName: data.productName,
        imeiNumber: data.imeiNumber,
        billImage: data.billImage,
        serviceDate: new Date(data.serviceDate),
        deliveryDate: parseOptionalDate(data.deliveryDate),
        serviceCenterDate: parseOptionalDate(data.serviceCenterDate),
        customerName: data.customerName,
        contactNumber: data.contactNumber,
        amount: data.amount,
        businessId: data.businessId,
        deliveryAgentId: data.deliveryAgentId,
        utrScreenshot: data.utrScreenshot,
        invoicePdf: data.invoicePdf,
        billingDate: parseOptionalDate(data.billingDate),
        state: data.state,
        pincode: data.pincode,
        fullAddress: data.fullAddress,
        preferredDate: parseOptionalDate(data.preferredDate),
        warrantyStatus: data.warrantyStatus,
        issueType: data.issueType,
        area: data.area,
        pickupAddress: data.pickupAddress,
        fix: data.fix,
        remark: data.remark,
        receiverName: data.receiverName,
        mobileNumber: data.mobileNumber,
        paymentId: data.paymentId,
        expireDate: parseOptionalDate(data.expireDate),
        orderStatus: 0,
      }));

      try {
        const createManyResult = await prisma.order.createMany({
          data: createPayload,
        });

        result.successCount += createManyResult.count;
        insertedImeis.push(...batch.map((item) => item.data.imeiNumber));
      } catch (dbError: any) {
        // Fallback to per-row inserts when batch insert fails to keep row-level error reporting.
        for (const row of batch) {
          try {
            const createdOrder = await prisma.order.create({
              data: {
                userId: row.data.userId,
                membershipType: row.data.membershipType as any,
                brandName: row.data.brandName,
                productName: row.data.productName,
                imeiNumber: row.data.imeiNumber,
                billImage: row.data.billImage,
                serviceDate: new Date(row.data.serviceDate),
                deliveryDate: parseOptionalDate(row.data.deliveryDate),
                serviceCenterDate: parseOptionalDate(row.data.serviceCenterDate),
                customerName: row.data.customerName,
                contactNumber: row.data.contactNumber,
                amount: row.data.amount,
                businessId: row.data.businessId,
                deliveryAgentId: row.data.deliveryAgentId,
                utrScreenshot: row.data.utrScreenshot,
                invoicePdf: row.data.invoicePdf,
                billingDate: parseOptionalDate(row.data.billingDate),
                state: row.data.state,
                pincode: row.data.pincode,
                fullAddress: row.data.fullAddress,
                preferredDate: parseOptionalDate(row.data.preferredDate),
                warrantyStatus: row.data.warrantyStatus,
                issueType: row.data.issueType,
                area: row.data.area,
                pickupAddress: row.data.pickupAddress,
                fix: row.data.fix,
                remark: row.data.remark,
                receiverName: row.data.receiverName,
                mobileNumber: row.data.mobileNumber,
                paymentId: row.data.paymentId,
                expireDate: parseOptionalDate(row.data.expireDate),
                orderStatus: 0,
              },
            });

            result.successCount++;
            result.successfulOrders.push(createdOrder.id);
          } catch (rowError: any) {
            result.failureCount++;
            result.errors.push({
              row: row.rowNumber,
              field: "general",
              message: `Database error: ${rowError.message}`,
            });
          }
        }
      }
    }

    if (insertedImeis.length > 0) {
      for (const imeiChunk of chunkArray(insertedImeis, DB_LOOKUP_CHUNK_SIZE)) {
        const createdOrders = await prisma.order.findMany({
          where: {
            imeiNumber: {
              in: imeiChunk,
            },
          },
          select: { id: true },
        });

        result.successfulOrders.push(...createdOrders.map((order) => order.id));
      }
    }

    result.summary = `Successfully created ${result.successCount} orders. ${result.failureCount} orders failed to create.`;

    const response = NextResponse.json(result);
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
  } catch (error: any) {
    console.error("Error in bulk upload:", error);
    const response = NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }
}
