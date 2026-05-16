import "dotenv/config";
import { MongoClient } from "mongodb";

const mongoUrl = process.env.DATABASE_URL;
if (!mongoUrl) {
  console.error("DATABASE_URL not set in .env");
  process.exit(1);
}

const dbName = "wepickwedrop";

async function main() {
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const usersCollection = db.collection("User");

    // Count how many have null numericId
    const nullCount = await usersCollection.countDocuments({ numericId: null });
    console.log(`Found ${nullCount} users with numericId: null`);

    if (nullCount > 0) {
      // Remove the null field so unique index won't see duplicates
      const result = await usersCollection.updateMany(
        { numericId: null },
        { $unset: { numericId: "" } }
      );
      console.log(`Updated ${result.modifiedCount} documents`);
    }

    console.log("Done. You can now run: npx prisma db push");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
