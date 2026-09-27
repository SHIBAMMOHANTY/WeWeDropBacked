import { NextResponse } from 'next/server';
import { createDatabaseBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/backup
 * 
 * Scheduled weekly cron endpoint to take an automated snapshot of the MongoDB database,
 * format it as JSON, and archive it into the Cloudflare R2 bucket.
 * 
 * Can be triggered automatically by Vercel Cron, GitHub Actions, or any HTTP cron scheduler.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Validate authorization if CRON_SECRET is configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const url = new URL(req.url);
      const secretParam = url.searchParams.get('secret');
      if (secretParam !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
      }
    }

    console.log('⏰ [Cron Job] Running automated weekly database backup...');
    const backup = await createDatabaseBackup('WEEKLY');
    console.log('✅ [Cron Job] Weekly backup completed:', backup.filename, backup.sizeFormatted);

    return NextResponse.json({
      success: true,
      message: 'Weekly database backup successfully archived',
      backup,
    });
  } catch (error: any) {
    console.error('❌ [Cron Job Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Weekly backup failed' },
      { status: 500 }
    );
  }
}
