import { prisma } from "@/lib/prisma";

export async function checkConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    // A lightweight query to verify the connection
    await prisma.$runCommandRaw({ ping: 1 });
    return { connected: true, message: "MongoDB connection successful via Prisma" };
  } catch (err: any) {
    return { connected: false, message: `Connection failed: ${err?.message ?? String(err)}` };
  }
}

// Run connection check and log result
checkConnection()
  .then((res) => {
    if (res.connected) {
      console.log("[db] Connected:", res.message);
    } else {
      console.error("[db] Connection failed:", res.message);
    }
  })
  .catch((err) => {
    console.error("[db] Connection check error:", err);
  });

