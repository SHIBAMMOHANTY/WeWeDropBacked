// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Type': 'application/json',
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const { username, phone, email, password, type } = await req.json();

    if ((!username && !phone && !email) || !password) {
      return new NextResponse(
        JSON.stringify({ error: "Username, phone, or email and password required" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    const typeStr = typeof type === 'string' ? type.trim().toLowerCase() : undefined;

    // Require explicit type
    if (!typeStr) {
      return new NextResponse(JSON.stringify({ error: "Login type is required" }), { status: 400, headers: corsHeaders });
    }

    // helper to return 401 for invalid creds
    const invalidCreds = () =>
      new NextResponse(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: corsHeaders,
      });

    // Depending on requested type, query appropriate model
    let found: any = null;
    let tokenPayload: any = null;

    if (typeStr === 'user' || typeStr === 'users') {
      const orConditions: any[] = [];
      if (username) orConditions.push({ username });
      if (phone) orConditions.push({ phone });
      if (email) orConditions.push({ email });
      found = await prisma.user.findFirst({ where: orConditions.length > 0 ? { OR: orConditions } : {} });
      if (!found) {
        return new NextResponse(JSON.stringify({ error: "User not found" }), { status: 404, headers: corsHeaders });
      }
      if (!found.password || typeof found.password !== 'string') return invalidCreds();
      let match = await bcrypt.compare(password, found.password);
      // If password stored in plain-text (legacy), migrate to hashed password
      if (!match && found.password === password) {
        try {
          const hashed = await bcrypt.hash(password, 10);
          await prisma.user.update({ where: { id: found.id }, data: { password: hashed } });
          match = true;
        } catch (e) {
          // ignore migration failure; proceed only if plain match
          match = true;
        }
      }
      if (!match) return invalidCreds();
      tokenPayload = { id: found.id, role: found.role };
    } else if (typeStr === 'business' || typeStr === 'buisness' || typeStr === 'buisnesss') {
      // Business login supports email or contactNumber (phone)
      const orConditions: any[] = [];
      if (email) orConditions.push({ email });
      if (phone) orConditions.push({ contactNumber: phone });
      if (username) orConditions.push({ dealerName: username });
      found = await prisma.business.findFirst({ where: orConditions.length > 0 ? { OR: orConditions } : {} });
      // Fallbacks: normalize email/phone and try again if not found
      if (!found && email) {
        const emailNorm = email.trim();
        // try lowercase
        found = await prisma.business.findFirst({ where: { email: emailNorm.toLowerCase() } }).catch(() => null);
      }
      if (!found && email) {
        const emailNorm = email.trim();
        // try contains (case-insensitive) if supported
        try {
          found = await prisma.business.findFirst({ where: { email: { contains: emailNorm, mode: 'insensitive' } } });
        } catch (e) {
          // provider may not support mode; ignore
        }
      }
      if (!found && phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits) {
          // try matching contactNumber contains digits
          try {
            found = await prisma.business.findFirst({ where: { contactNumber: { contains: digits } } });
          } catch (e) {
            // ignore
          }
        }
      }

      if (!found) {
        return new NextResponse(JSON.stringify({ error: "Business not found" }), { status: 404, headers: corsHeaders });
      }
      if (!found.password || typeof found.password !== 'string') return invalidCreds();
      let match = await bcrypt.compare(password, found.password);
      // If password stored in plain-text (legacy), migrate to hashed password
      if (!match && found.password === password) {
        try {
          const hashed = await bcrypt.hash(password, 10);
          await prisma.business.update({ where: { id: found.id }, data: { password: hashed } });
          match = true;
        } catch (e) {
          // ignore migration failure; proceed only if plain match
          match = true;
        }
      }
      if (!match) return invalidCreds();
      tokenPayload = { id: found.id, role: 'BUSINESS' };
    } else if (typeStr === 'admin' || typeStr === 'superadmin' || typeStr === 'super-admin' || typeStr === 'super_admin') {
      // Admin login uses email
      if (!email) {
        return new NextResponse(JSON.stringify({ error: "Admin login requires email" }), { status: 400, headers: corsHeaders });
      }
      found = await prisma.admin.findFirst({ where: { email } });
      if (!found) {
        return new NextResponse(JSON.stringify({ error: "Admin not found" }), { status: 404, headers: corsHeaders });
      }
      if (!found.password || typeof found.password !== 'string') return invalidCreds();
      let match = await bcrypt.compare(password, found.password);
      if (!match && found.password === password) {
        try {
          const hashed = await bcrypt.hash(password, 10);
          await prisma.admin.update({ where: { id: found.id }, data: { password: hashed } });
          match = true;
        } catch (e) {
          match = true;
        }
      }
      if (!match) return invalidCreds();
      tokenPayload = { id: found.id, role: found.role || 'SUPER_ADMIN' };
    } else {
      return new NextResponse(JSON.stringify({ error: "Invalid login type" }), { status: 400, headers: corsHeaders });
    }

    const token = signToken(tokenPayload);
    // strip password from returned object
    if (found && typeof found === 'object') {
      const { password: __, ...safe } = found as any;
      return new NextResponse(JSON.stringify({ user: safe, token }), { status: 200, headers: corsHeaders });
    }
    return new NextResponse(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: corsHeaders });
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