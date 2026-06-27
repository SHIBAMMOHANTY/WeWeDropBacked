import { ScrapedProduct, ScrapedSpecs } from '@/lib/mobile/interfaces';

export class ScraperService {
  private static userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private static getHeaders() {
    return {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };
  }

  /**
   * Helper to replace image template URL placeholders with real sizes
   */
  private static formatImageUrl(urlTemplate: string): string {
    if (!urlTemplate) return '';
    return urlTemplate
      .replace('{@width}', '350')
      .replace('{@height}', '350')
      .replace('{@quality}', '70');
  }

  /**
   * Helper to extract Brand from a product title
   */
  private static parseBrand(title: string): string {
    const brands = [
      'apple', 'samsung', 'oneplus', 'xiaomi', 'redmi', 'mi', 'realme',
      'vivo', 'oppo', 'google', 'motorola', 'infinix', 'tecno', 'poco',
      'asus', 'nothing', 'iqoo', 'honor', 'nokia'
    ];
    const lowerTitle = title.toLowerCase();
    const matched = brands.find(brand => lowerTitle.includes(brand));
    
    if (matched) {
      return matched.charAt(0).toUpperCase() + matched.slice(1);
    }
    // Fallback: return the first word of the title
    return title.split(' ')[0] || 'Unknown';
  }

  /**
   * Helper to estimate release date based on phone model
   */
  private static estimateReleaseDate(title: string): string {
    const lower = title.toLowerCase();
    
    // Apple iPhone models
    if (lower.includes('iphone 16')) return '2024-09-20';
    if (lower.includes('iphone 15')) return '2023-09-22';
    if (lower.includes('iphone 14')) return '2022-09-16';
    if (lower.includes('iphone 13')) return '2021-09-24';
    if (lower.includes('iphone 12')) return '2020-10-23';
    if (lower.includes('iphone 11')) return '2019-09-20';
    if (lower.includes('iphone xs') || lower.includes('iphone xr')) return '2018-09-21';
    
    // Samsung S series
    if (lower.includes('s24') || lower.includes('galaxy s24')) return '2024-01-31';
    if (lower.includes('s23') || lower.includes('galaxy s23')) return '2023-02-17';
    if (lower.includes('s22') || lower.includes('galaxy s22')) return '2022-02-25';
    if (lower.includes('s21') || lower.includes('galaxy s21')) return '2021-01-29';
    
    // Generic fallback: match any year in text or default to 2 years ago
    const yearMatch = title.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      return `${yearMatch[1]}-01-01`;
    }
    
    return '2024-06-01'; // general default
  }

  private static cleanModelName(title: string, brand: string): string {
    let clean = title;
    
    // Extract storage (e.g. 128 GB, 256GB, 1TB)
    let storage = '';
    const storageMatch = title.match(/\b(\d+)\s*(GB|TB)\b/i);
    if (storageMatch) {
      storage = `${storageMatch[1]}${storageMatch[2].toUpperCase()}`;
    }

    // Remove everything from the first parenthesis or comma
    clean = clean.split('(')[0].split(',')[0].trim();

    // Remove the brand name from the beginning if it exists
    const brandRegex = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    clean = clean.replace(brandRegex, '').trim();

    // Ensure 5g is capitalized
    clean = clean.replace(/\b5g\b/i, '5G').replace(/\b4g\b/i, '4G');

    if (storage && !clean.includes(storage)) {
      clean = `${clean} (${storage})`;
    }

    // Fallback if cleaning stripped too much
    return clean || title.split('(')[0].trim();
  }

  /**
   * Search devices on Flipkart and parse results
   */
  static async search(query: string, page: number = 1): Promise<ScrapedProduct[]> {
    try {
      const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&page=${page}`;
      
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.warn(`Flipkart search failed with status ${response.status}. Trying Yahoo search fallback...`);
        return this.searchViaYahoo(query);
      }

      const html = await response.text();
      const stateMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      
      if (!stateMatches) {
        console.warn('Flipkart initial state not found. Trying Yahoo search fallback...');
        return this.searchViaYahoo(query);
      }

      const state = JSON.parse(stateMatches[1]);
      const products: ScrapedProduct[] = [];

      // Recursive finder for products in React state
      const traverse = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        
        if (obj.widget && obj.widget.data && obj.widget.data.products) {
          obj.widget.data.products.forEach((p: any) => {
            if (p.productInfo && p.productInfo.value) {
              const info = p.productInfo.value;
              const rawTitle = info.titles?.newTitle || info.titles?.title || '';
              
              if (!rawTitle) return;

              // Parse pricing details
              let price = 0;
              let mrp = 0;
              if (info.pricing && info.pricing.prices) {
                const specPrice = info.pricing.prices.find((pr: any) => pr.strikeOff === false);
                const mrpPrice = info.pricing.prices.find((pr: any) => pr.strikeOff === true);
                price = specPrice ? specPrice.value : 0;
                mrp = mrpPrice ? mrpPrice.value : price;
              }

              // Parse image
              let image = '';
              if (info.media && info.media.images && info.media.images.length > 0) {
                image = this.formatImageUrl(info.media.images[0].url);
              }

              const availability = info.availability?.displayState === 'IN_STOCK' ? 'In Stock' : 'Out of Stock';
              const brand = this.parseBrand(rawTitle);

              products.push({
                id: info.id,
                brand,
                model: this.cleanModelName(rawTitle, brand),
                image,
                releaseDate: this.estimateReleaseDate(rawTitle),
                price,
                mrp,
                url: info.baseUrl ? `https://www.flipkart.com${info.baseUrl}` : undefined,
                availability,
                keySpecs: info.keySpecs || [],
              });
            }
          });
        }

        if (Array.isArray(obj)) {
          obj.forEach(traverse);
        } else {
          Object.keys(obj).forEach(key => traverse(obj[key]));
        }
      };

      traverse(state);
      return products;
    } catch (error) {
      console.error('Error during Flipkart search scraping. Trying Yahoo search fallback...', error);
      return this.searchViaYahoo(query);
    }
  }

  private static async searchViaYahoo(query: string): Promise<ScrapedProduct[]> {
    try {
      const url = `https://search.yahoo.com/search?p=site:flipkart.com+${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return [];

      const html = await response.text();
      const products: ScrapedProduct[] = [];
      const regex = /<a\s+[^>]*?href="([^"]*)"[^>]*>([\s\S]*?<\/h3>)/gi;
      
      let match;
      const seenPids = new Set<string>();
      const tasks: Promise<any>[] = [];
      const maxResults = 4;

      while ((match = regex.exec(html)) !== null && tasks.length < maxResults) {
        const href = match[1];
        try {
          if (href.includes('/RU=')) {
            const parts = href.split('/RU=');
            const encoded = parts[1].split('/RK=')[0];
            const decodedUrl = decodeURIComponent(encoded);
            
            if (decodedUrl.includes('flipkart.com') && decodedUrl.includes('/p/')) {
              let pid = '';
              try {
                const urlObj = new URL(decodedUrl);
                pid = urlObj.searchParams.get('pid') || '';
              } catch (e) {
                // ignore URL parsing error
              }
              if (!pid) {
                pid = decodedUrl.split('/p/')[1]?.split('?')[0] || '';
              }
              
              if (pid && !seenPids.has(pid)) {
                seenPids.add(pid);
                
                const pId = pid;
                tasks.push(
                  this.fetchDetails(decodedUrl).then(specs => {
                    if (specs) {
                      return {
                        id: pId,
                        brand: specs.brand,
                        model: specs.model,
                        image: specs.images[0] || '',
                        releaseDate: specs.releaseDate,
                        price: specs.price,
                        mrp: specs.launchPrice,
                        url: decodedUrl,
                        availability: 'In Stock',
                        keySpecs: [],
                      };
                    }
                    return null;
                  })
                );
              }
            }
          }
        } catch (err) {
          // ignore
        }
      }

      const results = await Promise.all(tasks);
      for (const res of results) {
        if (res) products.push(res);
      }
      return products;
    } catch (error) {
      console.error('Error during Yahoo search fallback scraping:', error);
      return [];
    }
  }

  /**
   * Fetch a single product detail page and parse specifications
   */
  static async fetchDetails(productUrlPath: string): Promise<ScrapedSpecs | null> {
    try {
      const url = productUrlPath.startsWith('http')
        ? productUrlPath
        : `https://www.flipkart.com${productUrlPath}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.warn(`Flipkart product fetch failed with status ${response.status}. Falling back.`);
        return null;
      }

      const html = await response.text();
      const stateMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);

      if (!stateMatches) {
        return null;
      }

      const state = JSON.parse(stateMatches[1]);

      // Collect all strings from the state for heuristic analysis
      const textStrings = new Set<string>();
      const images: string[] = [];

      const collect = (obj: any) => {
        if (!obj) return;
        if (typeof obj === 'string') {
          textStrings.add(obj.trim());
        } else if (Array.isArray(obj)) {
          obj.forEach(collect);
        } else if (typeof obj === 'object') {
          // If we find image URL, extract it
          if (obj.url && typeof obj.url === 'string' && obj.url.includes('rukmini')) {
            images.push(this.formatImageUrl(obj.url));
          }
          Object.keys(obj).forEach(k => collect(obj[k]));
        }
      };

      collect(state);

      // Parse pricing to get selling price and MRP/launch price
      let sellingPrice = 0;
      let launchPrice = 0;
      const findDetailsPricing = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.finalPrice === 'number' && typeof obj.mrp === 'number') {
          sellingPrice = obj.finalPrice;
          launchPrice = obj.mrp;
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(findDetailsPricing);
        } else {
          Object.keys(obj).forEach(k => {
            if (sellingPrice === 0) findDetailsPricing(obj[k]);
          });
        }
      };
      findDetailsPricing(state);

      if (sellingPrice === 0) {
        // Fallback pricing finder
        const findFallbackPrice = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (typeof obj.primaryProductPrice === 'number' && obj.primaryProductPrice > 0) {
            sellingPrice = obj.primaryProductPrice;
            launchPrice = obj.primaryProductPrice;
            return;
          }
          if (Array.isArray(obj)) {
            obj.forEach(findFallbackPrice);
          } else {
            Object.keys(obj).forEach(k => {
              if (sellingPrice === 0) findFallbackPrice(obj[k]);
            });
          }
        };
        findFallbackPrice(state);
      }

      // Extraction heuristics
      let display = '';
      let processor = '';
      let ram = '';
      let storage = '';
      let battery = '';
      let camera = '';
      let os = '';
      let title = 'Unknown Phone';

      // Find title in state
      const traverseTitle = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.title && typeof obj.title === 'string' && obj.title.includes('(')) {
          title = obj.title;
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(traverseTitle);
        } else {
          Object.keys(obj).forEach(k => traverseTitle(obj[k]));
        }
      };
      traverseTitle(state);

      for (const txt of Array.from(textStrings)) {
        const lower = txt.toLowerCase();

        // RAM extraction
        if (!ram && /\b\d+\s*gb\s*ram\b/i.test(txt)) {
          ram = txt.match(/\b\d+\s*gb\s*ram\b/i)![0];
        }
        // Storage extraction
        if (!storage && /\b\d+\s*(?:gb|tb)\s*(?:rom|storage|internal)\b/i.test(txt)) {
          storage = txt.match(/\b\d+\s*(?:gb|tb)\s*(?:rom|storage|internal)\b/i)![0];
        } else if (!storage && /\b(?:128|256|512)\s*(?:gb|tb)\b/i.test(txt) && !lower.includes('ram')) {
          storage = txt.match(/\b(?:128|256|512)\s*(?:gb|tb)\b/i)![0];
        }
        // Battery extraction
        if (!battery && /\b\d{4,5}\s*mah\b/i.test(txt)) {
          battery = txt.match(/\b\d{4,5}\s*mah\b/i)![0];
        }
        // Display extraction
        if (!display && /\b\d+(?:\.\d+)?\s*(?:inch|inches)\b/i.test(txt)) {
          display = txt;
        }
        // Processor extraction
        if (!processor && (lower.includes('processor') || lower.includes('chipset') || lower.includes('bionic') || lower.includes('snapdragon') || lower.includes('helio') || lower.includes('dimensity'))) {
          if (txt.length < 100 && !lower.includes('rear') && !lower.includes('front')) {
            processor = txt;
          }
        }
        // Camera extraction
        if (!camera && (lower.includes('camera') || lower.includes('mp')) && (lower.includes('rear') || lower.includes('setup') || lower.includes('+'))) {
          if (txt.length < 120 && (txt.includes('MP') || txt.includes('Megapixel'))) {
            camera = txt;
          }
        }
        // OS extraction
        if (!os && (lower.startsWith('ios ') || lower.startsWith('android ') || lower.includes('operating system'))) {
          if (txt.length < 50) {
            os = txt;
          }
        }
      }

      const brand = this.parseBrand(title);
      // Clean model name
      let model = title.split('(')[0]?.trim() || title;
      if (model.startsWith(brand)) {
        model = model.substring(brand.length).trim();
      }

      // Deduplicate images and format
      const uniqueImages = Array.from(new Set(images)).slice(0, 5);

      return {
        brand,
        model,
        display: display || undefined,
        processor: processor || undefined,
        ram: ram || undefined,
        storage: storage || undefined,
        battery: battery || undefined,
        camera: camera || undefined,
        os: os || undefined,
        images: uniqueImages,
        launchPrice: launchPrice || 69900, // Default estimate if missing
        price: sellingPrice || launchPrice || 59900,
        releaseDate: this.estimateReleaseDate(title),
      };
    } catch (error) {
      console.error('Error during Flipkart details scraping:', error);
      return null;
    }
  }

  /**
   * Fallback spec parser when detailed page fetch fails (e.g. 403)
   */
  static parseSpecsFromKeySpecs(
    title: string,
    keySpecs: string[],
    image: string,
    price: number,
    mrp: number
  ): ScrapedSpecs {
    const brand = this.parseBrand(title);
    let model = title.split('(')[0]?.trim() || title;
    if (model.startsWith(brand)) {
      model = model.substring(brand.length).trim();
    }

    let display = '';
    let processor = '';
    let ram = '';
    let storage = '';
    let battery = '';
    let camera = '';
    let os = brand.toLowerCase() === 'apple' ? 'iOS 17' : 'Android 14';

    for (const spec of keySpecs) {
      const lower = spec.toLowerCase();
      if (lower.includes('display') || lower.includes('screen') || lower.includes('inch') || lower.includes('cm')) {
        display = spec;
      } else if (lower.includes('processor') || lower.includes('chip') || lower.includes('bionic') || lower.includes('snapdragon')) {
        processor = spec;
      } else if (lower.includes('ram')) {
        ram = spec;
      } else if (lower.includes('rom') || lower.includes('storage') || lower.includes('internal')) {
        storage = spec;
      } else if (lower.includes('battery') || lower.includes('mah')) {
        battery = spec;
      } else if (lower.includes('camera') || lower.includes('rear') || lower.includes('front') || lower.includes('mp')) {
        if (!camera || lower.includes('rear') || lower.includes('+')) {
          camera = spec;
        }
      }
    }

    // Extrapolate storage from title if keySpecs extraction failed
    if (!storage) {
      const storageMatch = title.match(/\b\d+\s*(?:gb|tb)\b/i);
      if (storageMatch) storage = storageMatch[0];
    }
    
    // Extrapolate RAM from title or defaults
    if (!ram) {
      const ramMatch = title.match(/\b\d+\s*gb\s*ram\b/i);
      if (ramMatch) {
        ram = ramMatch[0];
      } else {
        ram = brand.toLowerCase() === 'apple' ? '6 GB RAM' : '8 GB RAM';
      }
    }
    
    if (!battery) {
      battery = brand.toLowerCase() === 'apple' ? '3349 mAh' : '5000 mAh';
    }

    return {
      brand,
      model,
      display: display || '6.1 inch OLED Display',
      processor: processor || (brand.toLowerCase() === 'apple' ? 'A16 Bionic Chip' : 'Octa Core Processor'),
      ram,
      storage: storage || '128GB',
      battery,
      camera: camera || '48MP Rear Camera',
      os,
      images: [image],
      launchPrice: mrp || price || 50000,
      releaseDate: this.estimateReleaseDate(title),
    };
  }
}
