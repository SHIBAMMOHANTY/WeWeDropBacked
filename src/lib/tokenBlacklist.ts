import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "revokedTokens.json");

let revoked = new Set<string>();

function load() {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const arr = JSON.parse(raw || "[]");
    if (Array.isArray(arr)) revoked = new Set(arr);
  } catch (e) {
    revoked = new Set();
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(Array.from(revoked), null, 2), "utf8");
  } catch (e) {
    // ignore write errors
  }
}

load();

export function isRevoked(token: string) {
  return revoked.has(token);
}

export function revokeToken(token: string) {
  revoked.add(token);
  persist();
}

export function clearRevoked() {
  revoked.clear();
  persist();
}

export function listRevoked() {
  return Array.from(revoked);
}
