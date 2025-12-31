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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        }
      );
    }


    if (!user.password || typeof user.password !== 'string') {
      return new NextResponse(
        JSON.stringify({ error: "Invalid credentials" }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        }
      );
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return new NextResponse(
        JSON.stringify({ error: "Invalid credentials" }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        }
      );
    }

    const token = signToken({ id: user.id, role: user.role });
    const { password: _, ...userSafe } = user;
    return new NextResponse(
      JSON.stringify({ user: userSafe, token }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      }
    );
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      }
    );
  }
}