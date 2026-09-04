import { prisma } from '@/lib/prisma';

export class DeviceGenerator {
  private static brands = [
    'Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Redmi', 'Vivo', 'Oppo',
    'Google', 'Motorola', 'Realme', 'Poco', 'Nothing', 'IQOO', 'Honor',
    'Nokia', 'Asus'
  ];

  private static slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  static async generateAndSave(query: string): Promise<any[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Parse brand
    let brand = 'Unknown';
    const lowerQuery = trimmed.toLowerCase();
    const matchedBrand = this.brands.find(b => lowerQuery.includes(b.toLowerCase()));
    
    if (matchedBrand) {
      brand = matchedBrand;
    } else {
      // Use the first word capitalized
      const firstWord = trimmed.split(' ')[0];
      brand = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    }

    // Parse model name: remove brand name from query
    let model = trimmed;
    const brandRegex = new RegExp(brand, 'gi');
    model = model.replace(brandRegex, '').trim();
    
    // Capitalize first letters of model
    model = model.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    if (!model || model.length < 2) {
      model = trimmed.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    // Clean up double spaces
    model = model.replace(/\s+/g, ' ');

    // Guess launch price base
    let baseLaunchPrice = 45000;
    const lowerModel = model.toLowerCase();
    const brandLower = brand.toLowerCase();

    if (brandLower === 'apple' || brandLower === 'iphone') {
      if (lowerModel.includes('pro max')) {
        baseLaunchPrice = 139900;
      } else if (lowerModel.includes('pro')) {
        baseLaunchPrice = 119900;
      } else if (lowerModel.includes('plus')) {
        baseLaunchPrice = 89900;
      } else {
        baseLaunchPrice = 79900;
      }
    } else if (brandLower === 'samsung') {
      if (lowerModel.includes('ultra') || lowerModel.includes('s24 ultra') || lowerModel.includes('s23 ultra')) {
        baseLaunchPrice = 124999;
      } else if (lowerModel.includes('fold')) {
        baseLaunchPrice = 154999;
      } else if (lowerModel.includes('flip')) {
        baseLaunchPrice = 94999;
      } else if (lowerModel.includes('s24') || lowerModel.includes('s23') || lowerModel.includes('s22')) {
        baseLaunchPrice = 79999;
      } else {
        baseLaunchPrice = 24999; // budget
      }
    } else if (brandLower === 'oneplus') {
      if (lowerModel.includes('nord')) {
        baseLaunchPrice = 29999;
      } else {
        baseLaunchPrice = 64999;
      }
    } else {
      if (lowerModel.includes('pro') || lowerModel.includes('ultra')) {
        baseLaunchPrice = 74999;
      } else if (lowerModel.includes('lite') || lowerModel.includes('play')) {
        baseLaunchPrice = 19999;
      }
    }

    // Guess release year/date
    let releaseDate = '2024-01-15';
    if (lowerModel.includes('17')) {
      releaseDate = '2025-09-20';
    } else if (lowerModel.includes('16')) {
      releaseDate = '2024-09-20';
    } else if (lowerModel.includes('15')) {
      releaseDate = '2023-09-22';
    } else if (lowerModel.includes('14')) {
      releaseDate = '2022-09-16';
    } else if (lowerModel.includes('13')) {
      releaseDate = '2021-09-24';
    } else if (lowerModel.includes('24') || lowerModel.includes('s24')) {
      releaseDate = '2024-01-31';
    } else if (lowerModel.includes('23') || lowerModel.includes('s23')) {
      releaseDate = '2023-02-17';
    }

    // Setup images
    const image = brandLower === 'apple' || brandLower === 'iphone'
      ? 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop'
      : 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';

    // Generate 128GB and 256GB variations
    const storages = ['128GB', '256GB'];
    const createdDevices = [];

    for (const storage of storages) {
      const displayModelName = `${model} (${storage})`;
      const slug = this.slugify(`${brand} ${model} ${storage}`);
      const launchPrice = baseLaunchPrice + (storage === '256GB' ? 10000 : 0);

      try {
        // Double check if device already exists to avoid unique constraint violations
        let device = await prisma.device.findUnique({
          where: { slug },
          include: {
            currentPrices: true,
          }
        });

        if (!device) {
          device = await prisma.device.create({
            data: {
              slug,
              brand,
              model: displayModelName,
              storage,
              images: [image],
              launchPrice,
              releaseDate,
              display: brandLower === 'apple' ? '6.1 inch Super Retina XDR' : '6.7 inch AMOLED Display',
              processor: brandLower === 'apple' ? 'Apple A-Series Chip' : 'Octa Core Processor',
              ram: storage === '256GB' ? '12 GB RAM' : '8 GB RAM',
              battery: brandLower === 'apple' ? '3349 mAh' : '5000 mAh',
              camera: '50MP Rear Camera',
              os: brandLower === 'apple' ? 'iOS 17' : 'Android 14',
            },
            include: {
              currentPrices: true,
            }
          });

          // Record clean initial estimated price
          const flipkartPrice = Math.round(launchPrice * 0.85);
          const providers = [
            { seller: 'Flipkart', price: flipkartPrice, mrp: launchPrice }
          ];

          const currentPrices = [];
          for (const provider of providers) {
            const cp = await prisma.currentPrice.create({
              data: {
                deviceId: device.id,
                seller: provider.seller,
                price: provider.price,
                mrp: provider.mrp,
                availability: 'In Stock',
                productUrl: `https://www.flipkart.com/search?q=${encodeURIComponent(brand + ' ' + displayModelName)}`
              }
            });
            currentPrices.push(cp);

            await prisma.priceHistory.create({
              data: {
                deviceId: device.id,
                seller: provider.seller,
                price: provider.price,
                mrp: provider.mrp,
              }
            });
          }
          device.currentPrices = currentPrices;
        }

        createdDevices.push(device);
      } catch (err) {
        console.error('Error creating generated device:', err);
      }
    }

    return createdDevices;
  }
}
