import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/tokenBlacklist";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer "))
    return NextResponse.json({ error: "No token provided" }, { status: 400 });

  const token = auth.split(" ")[1];
  revokeToken(token);
  return NextResponse.json({ ok: true });
}
