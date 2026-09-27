import { NextResponse } from 'next/server';
import { createDatabaseBackup, listDatabaseBackups, deleteDatabaseBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return jsonResponse({}, 200);
}

export async function GET() {
  try {
    const backups = await listDatabaseBackups();
    return jsonResponse({
      success: true,
      total: backups.length,
      backups,
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to list backups' }, 500);
  }
}

export async function POST(req: Request) {
  try {
    let type: 'WEEKLY' | 'MANUAL' = 'MANUAL';
    try {
      const body = await req.json();
      if (body?.type === 'WEEKLY') {
        type = 'WEEKLY';
      }
    } catch (e) {
      // Body is optional
    }

    const backup = await createDatabaseBackup(type);
    return jsonResponse({
      success: true,
      message: `${type} database backup created successfully`,
      backup,
    });
  } catch (error: any) {
    console.error('[API POST /api/admin/backup Error]:', error);
    return jsonResponse({ error: error?.message || 'Failed to create backup' }, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const key = body?.key;
    if (!key) {
      return jsonResponse({ error: 'Backup key is required' }, 400);
    }

    await deleteDatabaseBackup(key);
    return jsonResponse({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to delete backup' }, 500);
  }
}
