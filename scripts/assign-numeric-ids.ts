import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getOrCreateNumericId } from "../src/lib/userIdMap";

const prisma = new PrismaClient();

const TARGET_UUIDS = [
  "6570615d-99b3-484c-b5de-808e618487bb",
  "912cb647-ad05-4732-baba-2809cc7085f2",
  "b5c33ab3-d43b-4fc9-aba5-b7984b0b24df",
  "db6aad81-b3cd-4f6f-b5cb-2bae03be5590",
];

async function main() {
  try {
    // fetch all users (optionally order by createdAt if available)
    const users = await prisma.user.findMany({
      // orderBy: { createdAt: "asc" }, // uncomment if you have createdAt
    });

    for (const u of users) {
      const numericId = await getOrCreateNumericId(u.id);
      // write numericId to DB if missing or different
      if ((u as any).numericId !== numericId) {
        await prisma.user.update({
          where: { id: u.id },
          data: { numericId },
        });
      }
    }

    // Print mappings for the specific UUIDs of interest
    console.log("Mappings for requested UUIDs:");
    for (const uuid of TARGET_UUIDS) {
      const user = await prisma.user.findUnique({ where: { id: uuid } });
      if (user) {
        console.log(uuid, "->", (user as any).numericId ?? "(not set)");
      } else {
        console.log(uuid, "-> (user not found)");
      }
    }

    console.log("Done.");
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Failed to assign numeric ids:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
