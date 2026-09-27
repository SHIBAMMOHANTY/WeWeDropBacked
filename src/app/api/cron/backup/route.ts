import { NextResponse } from 'next/server';
import { createDatabaseBackup, BackupType } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const secretParam = url.searchParams.get('secret');
      if (secretParam !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
      }
    }

    // Determine backup type: explicit query param or auto-schedule
    let type: BackupType = 'DAILY';
    const paramType = url.searchParams.get('type')?.toUpperCase();
    if (paramType === 'WEEKLY' || paramType === 'MONTHLY' || paramType === 'DAILY') {
      type = paramType as BackupType;
    } else {
      const now = new Date();
      if (now.getUTCDate() === 1) {
        type = 'MONTHLY';
      } else if (now.getUTCDay() === 0) {
        type = 'WEEKLY';
      } else {
        type = 'DAILY';
      }
    }

    console.log(`[Cron Job] Running automated ${type} database backup...`);
    const backup = await createDatabaseBackup(type);
    console.log(`[Cron Job] ${type} backup completed:`, backup.filename, backup.sizeFormatted);

    return NextResponse.json({
      success: true,
      type,
      message: `${type} database backup successfully archived`,
      backup,
    });
  } catch (error: any) {
    console.error('[Cron Job Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Backup failed' },
      { status: 500 }
    );
  }
}
