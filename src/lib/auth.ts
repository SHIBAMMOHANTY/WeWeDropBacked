import jwt, { JwtPayload } from "jsonwebtoken";
import { isRevoked } from "./tokenBlacklist";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

// ✅ Sign token with expiration
export function signToken(payload: object) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d", // ⏰ token valid for 7 days
  });
}

// ✅ Verify token safely
export function verifyToken(token: string): JwtPayload {
  // 1️⃣ Check blacklist first
  if (isRevoked(token)) {
    throw new Error("Token revoked");
  }

  // 2️⃣ Verify token (will throw if invalid or expired)
  const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;

  return decoded;
}
