import { initializeDatabase, checkConnection } from "../src/config/db.config";

async function main() {
  initializeDatabase();
  const res = await checkConnection();
  if (res.connected) {
    console.log("OK:", res.message);
    process.exit(0);
  } else {
    console.error("ERROR:", res.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
