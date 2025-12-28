import dotenv from "dotenv";
// Replace default import with named type + default factory import
import knexLib, { Knex } from "knex";
import { Model } from "objection";
import os from "os";

dotenv.config();

const required = ["MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
for (const k of required) {
  if (!process.env[k]) {
    throw new Error(`Missing required environment variable: ${k}`);
  }
}

const knexConfig: Knex.Config = {
  client: "mysql2",
  connection: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  },
  pool: { min: 0, max: 10 },
  debug: process.env.NODE_ENV !== "production",
};

declare global {
  // use the exported Knex instance type
  var __knex__: Knex | undefined;
}

// create the instance using the knex factory function
export const knex: Knex =
  globalThis.__knex__ ?? knexLib(knexConfig);

if (process.env.NODE_ENV !== "production") {
  globalThis.__knex__ = knex;
}

export function initializeDatabase(): Knex {
  Model.knex(knex);
  return knex;
}

// --- NEW: lightweight connection check used by Next.js API route ---
export async function checkConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    // lightweight probe; MySQL accepts SELECT 1
    await knex.raw("SELECT 1 as result");
    return { connected: true, message: "Connected to MySQL" };
  } catch (err: any) {
    // don't throw here to allow graceful API response
    return { connected: false, message: `Connection failed: ${err?.message ?? String(err)}` };
  }
}

// ensure DB is initialized on import
initializeDatabase();

// run connection check and log result (handled Promise)
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

// --- NEW: show environment + local/LAN access info ---
(function showEnvAndHosts() {
  try {
    const port = process.env.PORT ?? "3000";
    const hostEnv = process.env.HOST ?? "localhost";
    const maskedDbPwd =
      process.env.MYSQL_PASSWORD && process.env.MYSQL_PASSWORD.length > 0
        ? "*****"
        : "(not set)";

    console.log("[env] Next.js dev info:");
    console.log(`  - Host env: ${hostEnv}`);
    console.log(`  - Port: ${port}`);
    console.log(`  - MySQL host: ${process.env.MYSQL_HOST ?? "(not set)"}`);
    console.log(`  - MySQL port: ${process.env.MYSQL_PORT ?? "(not set)"}`);
    console.log(`  - MySQL database: ${process.env.MYSQL_DATABASE ?? "(not set)"}`);
    console.log(`  - MySQL user: ${process.env.MYSQL_USER ?? "(not set)"}`);
    console.log(`  - MySQL password: ${maskedDbPwd}`);

    // list LAN addresses
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        // skip internal and non-ipv4
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }

    console.log("  - Accessible URLs:");
    // hostEnv might be 0.0.0.0 => show localhost and LAN IPs
    if (hostEnv === "0.0.0.0") {
      console.log(`    • http://localhost:${port}`);
      for (const ip of addresses) {
        console.log(`    • http://${ip}:${port}`);
      }
    } else {
      console.log(`    • http://${hostEnv}:${port}`);
      for (const ip of addresses) {
        console.log(`    • http://${ip}:${port}`);
      }
    }
  } catch (err) {
    // don't crash startup for logging failures
    console.warn("[env] Could not enumerate network interfaces:", err);
  }
})();