// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Type': 'application/json',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { username, phone, password } = await req.json();

    if ((!username && !phone) || !password) {
      return new NextResponse(
        JSON.stringify({ error: "Username or phone and password required" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const orConditions = [];
    if (username) orConditions.push({ username });
    if (phone) orConditions.push({ phone });
    const user = await prisma.user.findFirst({
      where: orConditions.length > 0 ? { OR: orConditions } : {},
    });

    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }


    if (!user.password || typeof user.password !== 'string') {
      return new NextResponse(
        JSON.stringify({ error: "Invalid credentials" }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return new NextResponse(
        JSON.stringify({ error: "Invalid credentials" }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    const token = signToken({ id: user.id, role: user.role });
    const { password: _, ...userSafe } = user;
    return new NextResponse(
      JSON.stringify({ user: userSafe, token }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}