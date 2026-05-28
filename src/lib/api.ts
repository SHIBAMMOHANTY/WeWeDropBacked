import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  const responseBody = status === 204 ? null : JSON.stringify(body);
  return new NextResponse(responseBody, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

export function buildPagination(urlString: string) {
  const url = new URL(urlString);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function parseBoolean(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
}

export function isValidDeliveryStatus(status: number) {
  return [0, 1, 2, 3, 4, 5].includes(status);
}

export type AuthSession = {
  id: string;
  role: string;
  [key: string]: unknown;
};

export async function getAuthSession(req: Request): Promise<AuthSession> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError("Authorization header missing or malformed", 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new ApiError("Bearer token is required", 401);
  }

  const payload = verifyToken(token);
  if (!payload || typeof payload !== "object" || !payload.id || !payload.role) {
    throw new ApiError("Invalid authentication token", 401);
  }

  return {
    id: String(payload.id),
    role: String(payload.role),
    ...payload,
  };
}

export async function createNotification(params: {
  title: string;
  message: string;
  type: string;
  relatedId: string;
  userId?: string;
  businessId?: string;
}) {
  return prisma.notification.create({
    data: {
      title: params.title,
      message: params.message,
      type: params.type,
      relatedId: params.relatedId,
      userId: params.userId,
      businessId: params.businessId,
    },
  });
}
