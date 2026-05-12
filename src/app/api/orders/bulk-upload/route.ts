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
  if (!row.amount) {
    errors.push({ row: rowIndex, field: "amount", message: "amount is required" });
  }

  if (errors.length > 0) {
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

    // Validate and process orders
    const result: UploadResult = {
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
