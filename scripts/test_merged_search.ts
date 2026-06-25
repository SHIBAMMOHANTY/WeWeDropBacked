import { prisma } from '../src/lib/prisma';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function searchLocal(query: string) {
  console.log(`\n🔎 Testing local search fallback for: "${query}"`);
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  let results: any[] = [];
  
  if (keywords.length > 0) {
    // 1. Search scraped devices
    const dbDevices = await prisma.device.findMany({
      where: {
        AND: keywords.map(kw => ({
          OR: [
            { brand: { contains: kw, mode: 'insensitive' } },
            { model: { contains: kw, mode: 'insensitive' } },
            { slug: { contains: kw, mode: 'insensitive' } },
          ],
        })),
      },
      include: {
        currentPrices: true,
      },
      take: 20,
    });

    // 2. Search catalog master devices
    const dbDeviceMasters = await prisma.deviceMaster.findMany({
      where: {
        AND: keywords.map(kw => ({
          OR: [
            { brand: { contains: kw, mode: 'insensitive' } },
            { model: { contains: kw, mode: 'insensitive' } },
          ],
        })),
        isActive: true,
      },
      take: 20,
    });

    console.log(`Found ${dbDevices.length} in Device, ${dbDeviceMasters.length} in DeviceMaster.`);

    const deviceResults = dbDevices.map(d => {
      const flipkartPrice = d.currentPrices.find(cp => cp.seller.toLowerCase() === 'flipkart');
      const fallbackPrice = d.currentPrices[0];
      return {
        id: d.id,
        brand: d.brand,
        model: d.model,
        image: d.images?.[0] || '',
        releaseDate: d.releaseDate || undefined,
        price: flipkartPrice?.price ?? fallbackPrice?.price ?? (d.launchPrice ? Math.round(d.launchPrice * 0.85) : undefined),
        mrp: flipkartPrice?.mrp ?? fallbackPrice?.mrp ?? d.launchPrice ?? undefined,
      };
    });

    const masterResults = dbDeviceMasters.map(dm => {
      const isApple = dm.brand.toLowerCase() === 'apple' || dm.brand.toLowerCase() === 'iphone';
      const defaultImage = isApple
        ? 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop'
        : 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';
      
      return {
        id: dm.id,
        brand: dm.brand,
        model: `${dm.model} (${dm.storage})`,
        image: defaultImage,
        releaseDate: dm.launchDate || undefined,
        price: dm.basePriceExcellent,
        mrp: dm.launchPrice,
      };
    });

    const merged = [...deviceResults];
    for (const mr of masterResults) {
      const alreadyExists = merged.some(dr => {
        const drBrand = dr.brand.toLowerCase();
        const drModel = dr.model.toLowerCase();
        const mrBrand = mr.brand.toLowerCase();
        const mrModel = mr.model.toLowerCase();
        return drBrand === mrBrand && (drModel.includes(mrModel) || mrModel.includes(drModel));
      });
      if (!alreadyExists) {
        merged.push(mr);
      }
    }
    results = merged;
  }

  console.log('Results:');
  console.log(JSON.stringify(results, null, 2));
}

async function main() {
  await searchLocal('iphone');
  await searchLocal('galaxy s23');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
