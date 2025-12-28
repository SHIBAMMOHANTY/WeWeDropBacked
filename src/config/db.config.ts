import dotenv from "dotenv";
// Replace default import with named type + default factory import
import knexLib, { Knex } from "knex";
import { Model } from "objection";

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
checkConnection()