import jwt, { JwtPayload } from "jsonwebtoken";
import { isRevoked } from "./tokenBlacklist";

const JWT_SECRET = process.env.JWT_SECRET!;

// ✅ Sign token with expiration
export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, {
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
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

  return decoded;
}
