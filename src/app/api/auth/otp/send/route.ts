export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // Make sure this path is correct!
import { sendOTP } from "@/lib/otp";
import { getOrCreateNumericId } from "@/lib/userIdMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { phone, type } = body;

    // basic validation / normalization
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }
    phone = phone.trim();

    // Generate search variants for robust matching
    const digits = phone.replace(/\D/g, '');
    const searchPhones: string[] = [phone, phone.trim()];
    if (digits) {
      searchPhones.push(digits);
      if (digits.length === 10) {
        searchPhones.push(`+91${digits}`);
        searchPhones.push(`91${digits}`);
      } else if (digits.length === 12 && digits.startsWith('91')) {
        const tenDigits = digits.slice(2);
        searchPhones.push(tenDigits);
        searchPhones.push(`+91${tenDigits}`);
      }
    }
    const uniqueSearchPhones = Array.from(new Set(searchPhones.filter(Boolean)));

    // Canonicalize type
    const typeRaw = typeof type === 'string' ? type.trim().toLowerCase() : '';
    let typeCanonical = '';
    if (['user', 'users', 'customer', 'u'].includes(typeRaw)) typeCanonical = 'user';
    else if (['business', 'bus', 'buisness', 'buisnesss', 'biz', 'b'].includes(typeRaw)) typeCanonical = 'business';
    else if (['admin', 'superadmin', 'super-admin', 'super_admin', 's', 'a'].includes(typeRaw)) typeCanonical = 'admin';

    console.log("Checking database for phone formats:", uniqueSearchPhones, "with type canonical:", typeCanonical);

    // Helper to query and sort users by completeness to avoid duplicate empty accounts
    const getBestUser = async (whereClause: any) => {
      const list = await prisma.user.findMany({ where: whereClause });
      if (list.length === 0) return null;
      return list.sort((a, b) => {
        const aHasName = !!a.username;
        const bHasName = !!b.username;
        if (aHasName !== bHasName) return aHasName ? -1 : 1;
        const aHasEmail = !!a.email;
        const bHasEmail = !!b.email;
        if (aHasEmail !== bHasEmail) return aHasEmail ? -1 : 1;
        return a.phone.length - b.phone.length;
      })[0];
    };

    // Helper to query and sort businesses by completeness
    const getBestBusiness = async (whereClause: any) => {
      const list = await prisma.business.findMany({ where: whereClause });
      if (list.length === 0) return null;
      return list.sort((a, b) => {
        const aHasName = !!a.dealerName;
        const bHasName = !!b.dealerName;
        if (aHasName !== bHasName) return aHasName ? -1 : 1;
        return a.contactNumber.length - b.contactNumber.length;
      })[0];
    };

    let userFound: any = null;
    let businessFound: any = null;
    let adminFound: any = null;

    // Run priority search based on canonical type
    if (typeCanonical === 'business') {
      businessFound = await getBestBusiness({ contactNumber: { in: uniqueSearchPhones } });
      if (!businessFound) {
        userFound = await getBestUser({
          AND: [
            { role: 'BUSINESS' },
            { phone: { in: uniqueSearchPhones } },
          ],
        });
      }
      if (!businessFound && !userFound) {
        // Broad search fallback
        userFound = await getBestUser({ phone: { in: uniqueSearchPhones } });
      }
    } else if (typeCanonical === 'admin') {
      userFound = await getBestUser({
        AND: [
          { role: 'SUPER_ADMIN' },
          { phone: { in: uniqueSearchPhones } },
        ],
      });
      if (!userFound) {
        adminFound = await prisma.admin.findFirst({
          where: { email: { in: uniqueSearchPhones } },
        });
      }
    } else {
      // Default/User lookup
      userFound = await getBestUser({ phone: { in: uniqueSearchPhones } });
      if (!userFound) {
        businessFound = await getBestBusiness({ contactNumber: { in: uniqueSearchPhones } });
      }
    }

    // Map to normalized structure
    let foundAccount: {
      id: string;
      phone: string;
      role: string;
      username: string | null;
      email: string | null;
      avatar: string;
      membership: string | null;
      type: 'USER' | 'BUSINESS' | 'ADMIN';
      isUserTable: boolean;
    } | null = null;

    if (userFound) {
      foundAccount = {
        id: userFound.id,
        phone: userFound.phone,
        role: userFound.role,
        username: userFound.username || null,
        email: userFound.email || null,
        avatar: userFound.avatar || "",
        membership: userFound.membership || null,
        type: userFound.role === 'BUSINESS' ? 'BUSINESS' : (userFound.role === 'SUPER_ADMIN' ? 'ADMIN' : 'USER'),
        isUserTable: true,
      };
    } else if (businessFound) {
      foundAccount = {
        id: businessFound.id,
        phone: businessFound.contactNumber,
        role: 'BUSINESS',
        username: businessFound.dealerName || null,
        email: businessFound.email || null,
        avatar: '',
        membership: null,
        type: 'BUSINESS',
        isUserTable: false,
      };
    } else if (adminFound) {
      foundAccount = {
        id: adminFound.id,
        phone: '',
        role: adminFound.role || 'SUPER_ADMIN',
        username: 'Admin',
        email: adminFound.email,
        avatar: '',
        membership: null,
        type: 'ADMIN',
        isUserTable: false,
      };
    }

    if (!foundAccount) {
      console.log(`None of the search phone options are registered.`);
      return NextResponse.json(
        { error: "Number is not registered" },
        { status: 400 }
      );
    }

    // Enforce role-type matching if typeCanonical is provided
    if (typeCanonical) {
      if (typeCanonical === 'user' && foundAccount.type === 'BUSINESS') {
        return NextResponse.json(
          { error: "Business users must log in with type 'business'" },
          { status: 400 }
        );
      }
      if (typeCanonical === 'business' && foundAccount.type !== 'BUSINESS') {
        return NextResponse.json(
          { error: "This number is not registered as a business" },
          { status: 400 }
        );
      }
      if (typeCanonical === 'admin' && foundAccount.type !== 'ADMIN') {
        return NextResponse.json(
          { error: "This number is not registered as an admin" },
          { status: 400 }
        );
      }
    }

    console.log("Verified account found:", { id: foundAccount.id, phone: foundAccount.phone, type: foundAccount.type });

    // allocate stable numeric id and persist to DB (best-effort) for User model records only
    if (foundAccount.isUserTable) {
      try {
        const numericId = await getOrCreateNumericId(foundAccount.id);
        if (userFound && (userFound as any).numericId !== numericId) {
          await prisma.user.update({
            where: { id: foundAccount.id },
            data: { numericId },
          });
        }
        console.log("Numeric ID assigned:", numericId);
      } catch (e) {
        console.warn("[db] Could not assign numericId:", (e as Error).message);
      }
    }

    // send OTP and handle failures
    let devMode = false;
    let generatedOtp: string | undefined;
    try {
      const result = await sendOTP(phone);
      devMode = result.devMode;
      generatedOtp = result.otp;
    } catch (e) {
      console.error("[otp] sendOTP failed:", (e as Error).message);
      return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
    }

    const userDetails = {
      id: foundAccount.id,
      phone: foundAccount.phone,
      role: foundAccount.role,
      name: foundAccount.username || null,
      username: foundAccount.username || null,
      email: foundAccount.email || null,
      avatar: foundAccount.avatar,
      membership: foundAccount.membership,
      type: foundAccount.type,
    };

    // In dev mode (no MSG91 configured), return the OTP directly in the response
    if (devMode) {
      return NextResponse.json({
        success: true,
        message: "OTP generated (dev mode — no WhatsApp sent)",
        phone,
        otp: generatedOtp, // ⚠️ remove this in production
        dev: true,
        user: userDetails,
      });
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent",
      phone,
      user: userDetails,
    });

  } catch (error: any) {
    console.error("--------------------------------");
    console.error("SEND OTP ERROR:", error);
    console.error("--------------------------------");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}