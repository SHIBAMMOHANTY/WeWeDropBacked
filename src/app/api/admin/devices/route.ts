import { z } from 'zod';
import { getAuthSession, jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

const deviceSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(240).optional().nullable(),
  storage: z.string().trim().min(1).max(30),
  launchPrice: z.number().nonnegative(),
  launchDate: z.string().trim().max(30).optional().nullable(),
  basePriceExcellent: z.number().nonnegative(),
  basePriceGood: z.number().nonnegative(),
  basePriceAverage: z.number().nonnegative(),
  isActive: z.boolean().optional()
});
const updateSchema = deviceSchema.partial().extend({ id: z.string().min(1) });
async function requireAdmin(req: Request) { const session = await getAuthSession(req); if (session.role !== 'SUPER_ADMIN') throw new Error('Forbidden'); }

function normalizeDeviceName(brand: string, model: string, existingName?: string | null) {
  const brandValue = String(brand || '').trim();
  const modelValue = String(model || '').trim();
  const requestedName = String(existingName || '').trim();

  if (requestedName) return requestedName;
  if (!brandValue || !modelValue) return '';

  const alreadyPrefixed = modelValue.toLowerCase().startsWith(brandValue.toLowerCase());
  return alreadyPrefixed ? modelValue : `${brandValue} ${modelValue}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url); const brand = searchParams.get('brand')?.trim();
    if (searchParams.get('view') === 'brands') {
      const rows = await prisma.deviceMaster.findMany({ where: { isDeleted: false }, select: { brand: true } });
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.brand, (counts.get(row.brand) || 0) + 1);
      const brands = [...counts.entries()]
        .map(([brand, deviceCount]) => ({ brand, deviceCount }))
        .filter((item) => Number(item.deviceCount) > 0)
        .sort((a, b) => a.brand.localeCompare(b.brand));
      return jsonResponse({ success: true, brands }, 200, noStoreHeaders);
    }
    const page = Math.max(1, Number(searchParams.get('page')) || 1); const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 25));
    const where: any = { isDeleted: false };
    if (brand) where.brand = { equals: brand, mode: 'insensitive' as const };
    const [total, devices] = await Promise.all([prisma.deviceMaster.count({ where }), prisma.deviceMaster.findMany({ where, orderBy: [{ name: 'asc' }, { storage: 'asc' }, { model: 'asc' }], skip: (page - 1) * limit, take: limit })]);
    return jsonResponse({ success: true, devices, pagination: { total, page, limit, pages: Math.ceil(total / limit) } }, 200, noStoreHeaders);
  } catch (error: any) { return jsonResponse({ error: error.message || 'Failed to load devices' }, error.message === 'Forbidden' ? 403 : 500, noStoreHeaders); }
}

export async function POST(req: Request) {
  try { await requireAdmin(req); const input = deviceSchema.parse(await req.json()); const normalizedName = normalizeDeviceName(input.brand, input.model, input.name);
    const device = await prisma.deviceMaster.create({ data: { ...input, name: normalizedName, isActive: input.isActive ?? true } }); return jsonResponse({ success: true, device }, 201, noStoreHeaders); }
  catch (error: any) { if (error instanceof z.ZodError) return jsonResponse({ error: 'Validation failed', details: error.errors }, 400, noStoreHeaders); if (error.code === 'P2002') return jsonResponse({ error: 'A device with this brand, model, and storage already exists' }, 409, noStoreHeaders); return jsonResponse({ error: error.message || 'Failed to create device' }, error.message === 'Forbidden' ? 403 : 500, noStoreHeaders); }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin(req);
    const { id, ...data } = updateSchema.parse(await req.json());

    const existing = await prisma.deviceMaster.findUnique({
      where: { id },
      select: { id: true, brand: true, model: true, storage: true, isDeleted: true }
    });

    if (!existing || existing.isDeleted) {
      return jsonResponse({ error: 'Device not found' }, 404, noStoreHeaders);
    }

    const nextBrand = data.brand ?? existing.brand;
    const nextModel = data.model ?? existing.model;
    const nextStorage = data.storage ?? existing.storage;

    const duplicate = await prisma.deviceMaster.findFirst({
      where: {
        isDeleted: false,
        brand: nextBrand,
        model: nextModel,
        storage: nextStorage,
        id: { not: id }
      },
      select: { id: true }
    });

    if (duplicate) {
      return jsonResponse({ error: 'A device with this brand, model, and storage already exists' }, 409, noStoreHeaders);
    }

    const nextName = normalizeDeviceName(nextBrand, nextModel, data.name ?? undefined);
    const device = await prisma.deviceMaster.update({ where: { id }, data: { ...data, name: nextName } });
    return jsonResponse({ success: true, device }, 200, noStoreHeaders);
  } catch (error: any) {
    if (error instanceof z.ZodError) return jsonResponse({ error: 'Validation failed', details: error.errors }, 400, noStoreHeaders);
    if (error?.code === 'P2002') return jsonResponse({ error: 'A device with this brand, model, and storage already exists' }, 409, noStoreHeaders);
    if (error?.code === 'P2025') return jsonResponse({ error: 'Device not found' }, 404, noStoreHeaders);
    return jsonResponse({ error: error.message || 'Failed to update device' }, error.message === 'Forbidden' ? 403 : 500, noStoreHeaders);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Device id is required' }, 400, noStoreHeaders);
    await prisma.deviceMaster.update({ where: { id }, data: { isDeleted: true } });
    return jsonResponse({ success: true }, 200, noStoreHeaders);
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to delete device' }, error.message === 'Forbidden' ? 403 : 500, noStoreHeaders);
  }
}
