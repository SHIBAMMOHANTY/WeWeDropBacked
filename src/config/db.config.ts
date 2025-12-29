import dotenv from "dotenv";
import { MongoClient, Db } from "mongodb";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const client = new MongoClient(process.env.DATABASE_URL);
let db: Db;

export async function connectToDatabase(): Promise<Db> {
  if (!db) {
    await client.connect();
    db = client.db();
  }
  return db;
}



// --- NEW: lightweight connection check used by Next.js API route ---

export async function checkConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    await connectToDatabase();
    return { connected: true, message: "MongoDB connection successful" };
  } catch (err: any) {
    return { connected: false, message: `Connection failed: ${err?.message ?? String(err)}` };
  }
}



// run connection check and log result (handled Promise)

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

