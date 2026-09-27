import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from './prisma';

function getR2Client() {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || 'https://2ecf668a62f8c8df5b85bbe3c3368f5c.r2.cloudflarestorage.com';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || 'ec927c9858329b5e3aa0d04730e33ebf';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || 'b78a67734d4ad6bf96559ab351a93da8febf1066133fdc7abb5296233cababea';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'crm';
const PUBLIC_BASE = process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE || 'https://pub-3980550907254b0a90694547699c11dd.r2.dev';

export async function createDatabaseBackup(type: 'WEEKLY' | 'MANUAL' = 'WEEKLY') {
  const timestamp = new Date().toISOString();
  const dateFormatted = timestamp.split('T')[0];

  const [
    quotes,
    orders,
    users,
    businesses,
    oldPhoneListings,
    oldPhoneOrders,
    orderHistories,
    deviceMasters,
    spareParts,
    banners,
  ] = await Promise.all([
    prisma.quote.findMany().catch(() => []),
    prisma.order.findMany().catch(() => []),
    prisma.user.findMany().catch(() => []),
    prisma.business.findMany().catch(() => []),
    prisma.oldPhoneListing.findMany().catch(() => []),
    prisma.oldPhoneOrder.findMany().catch(() => []),
    prisma.orderHistory.findMany().catch(() => []),
    prisma.deviceMaster.findMany().catch(() => []),
    prisma.sparePart.findMany().catch(() => []),
    prisma.banner.findMany().catch(() => []),
  ]);

  const backupData = {
    system: 'WePick WeDrop Database Archive',
    version: '1.0.0',
    type,
    createdAt: timestamp,
    summary: {
      quotes: quotes.length,
      orders: orders.length,
      users: users.length,
      businesses: businesses.length,
      oldPhoneListings: oldPhoneListings.length,
      oldPhoneOrders: oldPhoneOrders.length,
      orderHistories: orderHistories.length,
      deviceMasters: deviceMasters.length,
      spareParts: spareParts.length,
      banners: banners.length,
      totalRecords:
        quotes.length +
        orders.length +
        users.length +
        businesses.length +
        oldPhoneListings.length +
        oldPhoneOrders.length +
        orderHistories.length +
        deviceMasters.length +
        spareParts.length +
        banners.length,
    },
    collections: {
      quotes,
      orders,
      users,
      businesses,
      oldPhoneListings,
      oldPhoneOrders,
      orderHistories,
      deviceMasters,
      spareParts,
      banners,
    },
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
  const buffer = Buffer.from(jsonContent, 'utf-8');
  const filename = `backup_${type.toLowerCase()}_${dateFormatted}_${Date.now()}.json`;
  const key = `backups/${filename}`;

  let fileUrl = `${PUBLIC_BASE}/${key}`;
  let storageSuccess = false;

  const r2 = getR2Client();
  if (r2) {
    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: 'application/json',
          Metadata: {
            type,
            createdAt: timestamp,
            totalRecords: String(backupData.summary.totalRecords),
          },
        })
      );
      storageSuccess = true;
    } catch (r2Err) {
      console.warn('[Backup R2 Upload Error]:', r2Err);
    }
  }

  return {
    filename,
    fileUrl,
    sizeBytes: buffer.length,
    sizeFormatted: (buffer.length / 1024).toFixed(2) + ' KB',
    type,
    createdAt: timestamp,
    summary: backupData.summary,
    storageSuccess,
  };
}

export async function listDatabaseBackups() {
  const r2 = getR2Client();
  if (!r2) {
    return [];
  }

  try {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: 'backups/',
      })
    );

    const items = (res.Contents || [])
      .filter((obj) => obj.Key && obj.Key.endsWith('.json'))
      .map((obj) => {
        const key = obj.Key!;
        const filename = key.replace('backups/', '');
        return {
          key,
          filename,
          fileUrl: `${PUBLIC_BASE}/${key}`,
          sizeBytes: obj.Size || 0,
          sizeFormatted: ((obj.Size || 0) / 1024).toFixed(2) + ' KB',
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        };
      })
      .sort((a, b) => {
        const timeA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const timeB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return timeB - timeA;
      });

    return items;
  } catch (err) {
    console.warn('[List Backups Error]:', err);
    return [];
  }
}

export async function deleteDatabaseBackup(key: string) {
  const r2 = getR2Client();
  if (!r2) {
    throw new Error('Storage client not available');
  }

  const safeKey = key.startsWith('backups/') ? key : `backups/${key}`;
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: safeKey,
    })
  );
  return { success: true };
}
