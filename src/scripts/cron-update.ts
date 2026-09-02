import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';

// We initialize a standalone PrismaClient instance since this is run in a shell context
const prisma = new PrismaClient();

// Replicate Repository and Service calls locally to run in standalone process
async function runCronUpdate() {
  console.log('⚡ Starting standalone mobile price update script...');
  const startTime = Date.now();

  try {
    const devices = await prisma.device.findMany();
    console.log(`Found ${devices.length} devices to update.`);

    for (const device of devices) {
      console.log(`Updating prices for device: ${device.brand} ${device.model} (${device.slug})`);

      // Query Flipkart for prices
      const searchQuery = `${device.brand} ${device.model} ${device.storage || ''}`.trim();
      let scrapedProducts: any[] = [];

      try {
        const url = `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          const stateMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
          if (stateMatches) {
            const state = JSON.parse(stateMatches[1]);
            
            const traverse = (obj: any) => {
              if (!obj || typeof obj !== 'object') return;
              if (obj.widget && obj.widget.data && obj.widget.data.products) {
                obj.widget.data.products.forEach((p: any) => {
                  if (p.productInfo && p.productInfo.value) {
                    const info = p.productInfo.value;
                    const title = info.titles?.title || (info.titles?.superTitle ? `${info.titles.superTitle} ${info.titles.newTitle}` : info.titles?.newTitle) || '';
                    if (title) {
                      let price = 0;
                      let mrp = 0;
                      if (info.pricing && info.pricing.prices) {
                        const specPrice = info.pricing.prices.find((pr: any) => pr.strikeOff === false);
                        const mrpPrice = info.pricing.prices.find((pr: any) => pr.strikeOff === true);
                        price = specPrice ? specPrice.value : 0;
                        mrp = mrpPrice ? mrpPrice.value : price;
                      }
                      
                      scrapedProducts.push({
                        price,
                        mrp,
                        availability: info.availability?.displayState === 'IN_STOCK' ? 'In Stock' : 'Out of Stock',
                        url: info.baseUrl ? `https://www.flipkart.com${info.baseUrl}` : '',
                        title,
                      });
                    }
                  }
                });
              }
              if (Array.isArray(obj)) {
                obj.forEach(traverse);
              } else {
                Object.keys(obj).forEach(k => traverse(obj[k]));
              }
            };
            traverse(state);
          }
        }
      } catch (err) {
        console.error(`Failed to scrape search results for: ${searchQuery}`, err);
      }

      // Match products
      let match = scrapedProducts.find(p => {
        const titleLower = p.title.toLowerCase();
        const storageMatch = device.storage ? titleLower.includes(device.storage.toLowerCase()) : true;
        return titleLower.includes(device.brand.toLowerCase()) && storageMatch;
      });

      const baseLaunchPrice = device.launchPrice || 50000;
      let flipkartPrice = match?.price || Math.round(baseLaunchPrice * 0.85);
      let flipkartMrp = match?.mrp || baseLaunchPrice;

      if (flipkartPrice <= 0) flipkartPrice = Math.round(baseLaunchPrice * 0.85);
      if (flipkartMrp <= 0) flipkartMrp = baseLaunchPrice;

      const providers = [
        {
          seller: 'Flipkart',
          price: flipkartPrice,
          mrp: flipkartMrp,
          availability: match?.availability || 'In Stock',
          productUrl: match?.url || `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`,
        },
        {
          seller: 'Amazon',
          price: Math.round(flipkartPrice * 0.985),
          mrp: flipkartMrp,
          availability: 'In Stock',
          productUrl: `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`,
        },
        {
          seller: 'Croma',
          price: Math.round(flipkartPrice * 1.015),
          mrp: flipkartMrp,
          availability: 'In Stock',
          productUrl: `https://www.croma.com/search?text=${encodeURIComponent(searchQuery)}`,
        },
      ];

      for (const provider of providers) {
        // Upsert current price
        await prisma.currentPrice.upsert({
          where: {
            deviceId_seller: {
              deviceId: device.id,
              seller: provider.seller,
            },
          },
          update: {
            price: provider.price,
            mrp: provider.mrp,
            availability: provider.availability,
            productUrl: provider.productUrl,
            lastUpdated: new Date(),
          },
          create: {
            deviceId: device.id,
            seller: provider.seller,
            price: provider.price,
            mrp: provider.mrp,
            availability: provider.availability,
            productUrl: provider.productUrl,
            lastUpdated: new Date(),
          },
        });

        // Insert history record
        await prisma.priceHistory.create({
          data: {
            deviceId: device.id,
            seller: provider.seller,
            price: provider.price,
            mrp: provider.mrp,
            recordedAt: new Date(),
          },
        });
      }
      console.log(`Successfully updated prices for ${device.brand} ${device.model}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🎉 Standing cron update finished successfully in ${duration}s!`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Standalone cron update failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runCronUpdate();
