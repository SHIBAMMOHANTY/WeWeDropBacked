import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonResponse({ error: 'Array of order IDs is required' }, 400);
    }

    const objectIds = ids.filter((id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id));
    const orderIds = ids.filter((id) => typeof id === 'string' && !/^[0-9a-fA-F]{24}$/.test(id));

    const orConditions: any[] = [];
    if (objectIds.length > 0) {
      orConditions.push({ id: { in: objectIds } });
    }
    if (orderIds.length > 0) {
      orConditions.push({ orderId: { in: orderIds } });
    }

    if (orConditions.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No matching orders found to delete',
        count: 0,
      });
    }

    const result = await prisma.oldPhoneOrder.deleteMany({
      where: {
        OR: orConditions,
      },
    });

    return jsonResponse({
      success: true,
      message: `Successfully deleted ${result.count} orders`,
      count: result.count,
    });
  } catch (err: any) {
    console.error('Bulk Delete OldPhone Orders Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while bulk deleting orders' },
      500
    );
  }
}
