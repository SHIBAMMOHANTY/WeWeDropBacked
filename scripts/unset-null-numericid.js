// Unset numericId where it's explicitly null to allow unique index creation
// Usage: node scripts/unset-null-numericid.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const dbName = (new URL(uri.split('?')[0])).pathname.replace(/^\//, '');
    const db = client.db(dbName);
    const users = db.collection('User');

    const countNull = await users.countDocuments({ numericId: null });
    console.log('Documents with numericId:null ->', countNull);
    if (countNull === 0) {
      console.log('No documents to update. Exiting.');
      return;
    }

    const res = await users.updateMany({ numericId: null }, { $unset: { numericId: '' } });
    console.log(`Matched ${res.matchedCount}, Modified ${res.modifiedCount}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(2);
  } finally {
    await client.close();
  }
}

main();
