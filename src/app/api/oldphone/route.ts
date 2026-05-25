import { jsonResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonResponse({
    success: true,
    message: "OldPhone API root. Use /api/oldphone/listings, /api/oldphone/orders, or /api/oldphone/notifications.",
  });
}

export async function OPTIONS() {
  return jsonResponse({}, 204);
}
