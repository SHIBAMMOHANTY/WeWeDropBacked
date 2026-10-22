import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: Request) {
  try {
    // 1. Authenticate user
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    // 2. Parse query parameters for pagination
    const { page, limit, skip } = buildPagination(req.url);

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    // 3. Fetch user or business details to extract phone numbers for robust matching
    const currentUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, phone: true },
    });

    const currentBiz = !currentUser
      ? await prisma.business.findUnique({
          where: { id: session.id },
          select: { id: true, contactNumber: true },
        })
      : null;

    const rawPhone = currentUser?.phone || currentBiz?.contactNumber || (session as any).phone || '';
    const clean10 = String(rawPhone).replace(/\D/g, '').slice(-10);

    const searchPhones: string[] = [];
    if (rawPhone) searchPhones.push(rawPhone, rawPhone.trim());
    if (clean10 && clean10.length === 10) {
      searchPhones.push(clean10, `+91${clean10}`, `91${clean10}`, `0${clean10}`);
    }
    const uniquePhones = Array.from(new Set(searchPhones.filter(Boolean)));

    // 4. Back-heal: link any existing quotes matching this customer's phone to their userId
    if (uniquePhones.length > 0) {
      try {
        await prisma.quote.updateMany({
          where: {
            contactNumber: { in: uniquePhones },
            OR: [
              { userId: null },
              { userId: { not: session.id } },
            ],
          },
          data: {
            userId: session.id,
          },
        });
      } catch (backhealErr) {
        console.warn('Quote history back-heal note:', backhealErr);
      }
    }

    // 5. Query all quotes belonging to this customer by userId OR contactNumber
    const orConditions: any[] = [
      { userId: session.id },
    ];
    if (uniquePhones.length > 0) {
      orConditions.push({ contactNumber: { in: uniquePhones } });
    }

    const query: any = {
      OR: orConditions,
    };

    if (status) {
      query.status = status;
    }

    const total = await prisma.quote.count({ where: query });
    const quotes = await prisma.quote.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return jsonResponse({
      success: true,
      quotes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Fetch User Quote History Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote history' },
      500
    );
  }
}
