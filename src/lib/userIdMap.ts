import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MAP_FILE = path.join(DATA_DIR, "userIdMap.json");
const COUNTER_FILE = path.join(DATA_DIR, "userCounter.json");

async function ensureFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(MAP_FILE);
    } catch {
      await fs.writeFile(MAP_FILE, JSON.stringify({}), "utf8");
    }
    try {
      await fs.access(COUNTER_FILE);
    } catch {
      await fs.writeFile(COUNTER_FILE, JSON.stringify({ last: 0 }), "utf8");
    }
  } catch (err) {
    // ignore, will surface on next operations
    throw err;
  }
}

async function readJson<T = any>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(file: string, data: any) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Returns an incremental numeric id for the given userUuid.
 * If a mapping exists it is returned; otherwise a new numeric id is allocated and persisted.
 */
export async function getOrCreateNumericId(userUuid: string): Promise<number> {
  if (!userUuid) throw new Error("userUuid required");

  await ensureFiles();

  const map = await readJson<Record<string, number>>(MAP_FILE);
  if (map[userUuid]) return map[userUuid];

  const counter = await readJson<{ last: number }>(COUNTER_FILE);
  const next = (counter.last || 0) + 1;
  counter.last = next;
  map[userUuid] = next;

  // persist both
  await Promise.all([writeJson(COUNTER_FILE, counter), writeJson(MAP_FILE, map)]);
  return next;
}
