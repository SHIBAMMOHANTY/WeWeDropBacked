import { ScrapedProduct, ScrapedSpecs } from '@/lib/mobile/interfaces';

export class ScraperService {
  private static userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

  /**
   * Search devices on Flipkart and parse results
   */
  static async search(query: string, page: number = 1): Promise<ScrapedProduct[]> {
    try {
      const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&page=${page}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        console.warn(`Flipkart search failed with status ${response.status}. Trying DuckDuckGo fallback...`);
        return this.searchViaDuckDuckGo(query);
      }

      const html = await response.text();
      const stateMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      
      if (!stateMatches) {
        console.warn('Flipkart initial state not found. Trying DuckDuckGo fallback...');
        return this.searchViaDuckDuckGo(query);
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
              const title = info.titles?.title || info.titles?.newTitle || '';
              
              if (!title) return;

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

              // Determine availability
              const availability = info.availability?.displayState === 'IN_STOCK' ? 'In Stock' : 'Out of Stock';

              products.push({
                id: info.id,
                brand: this.parseBrand(title),
                model: info.titles?.newTitle || title,
                image,
                releaseDate: this.estimateReleaseDate(title),
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
      console.error('Error during Flipkart search scraping. Trying DuckDuckGo fallback...', error);
      return this.searchViaDuckDuckGo(query);
    }
  }

  private static async searchViaDuckDuckGo(query: string): Promise<ScrapedProduct[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=site:flipkart.com+${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return [];

      const html = await response.text();
      const products: ScrapedProduct[] = [];
      const regex = /<a\s+[^>]*?class="[^"]*?result__a[^"]*?"[^>]*?href="[^"]*?uddg=([^"&]*)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      
      let match;
      const seenPids = new Set<string>();

      while ((match = regex.exec(html)) !== null) {
        const encodedUrl = match[1];
        const rawTitle = match[2];
        try {
          const decodedUrl = decodeURIComponent(encodedUrl);
          if (decodedUrl.includes('flipkart.com') && decodedUrl.includes('/p/')) {
            const title = rawTitle.replace(/<[^>]*>/g, '').replace(/\s*-\s*Flipkart/gi, '').trim();
            const pid = decodedUrl.split('/p/')[1]?.split('?')[0] || '';
            
            if (pid && !seenPids.has(pid)) {
              seenPids.add(pid);
              
              const brand = this.parseBrand(title);
              const brandLower = brand.toLowerCase();
              
              // Guess specs and launchPrice
              const isApple = brandLower === 'apple' || brandLower === 'iphone';
              const image = isApple
                ? 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop'
                : 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';
              
              const releaseDate = this.estimateReleaseDate(title);
              
              // Estimate launchPrice base
              let launchPrice = 45000;
              const lowerTitle = title.toLowerCase();
              if (isApple) {
                if (lowerTitle.includes('pro max')) launchPrice = 139900;
                else if (lowerTitle.includes('pro')) launchPrice = 119900;
                else if (lowerTitle.includes('plus')) launchPrice = 89900;
                else launchPrice = 79900;
              } else if (brandLower === 'samsung') {
                if (lowerTitle.includes('ultra')) launchPrice = 124999;
                else if (lowerTitle.includes('fold')) launchPrice = 154999;
                else if (lowerTitle.includes('flip')) launchPrice = 94999;
                else if (lowerTitle.includes('s24') || lowerTitle.includes('s23') || lowerTitle.includes('s22')) launchPrice = 79999;
                else launchPrice = 24999;
              } else if (brandLower === 'oneplus') {
                if (lowerTitle.includes('nord')) launchPrice = 29999;
                else launchPrice = 64999;
              }
              
              // Adjust launch price slightly if storage is in title
              if (lowerTitle.includes('256 gb') || lowerTitle.includes('256gb')) launchPrice += 10000;
              else if (lowerTitle.includes('512 gb') || lowerTitle.includes('512gb')) launchPrice += 20000;
              else if (lowerTitle.includes('1 tb') || lowerTitle.includes('1tb')) launchPrice += 40000;

              const price = Math.round(launchPrice * 0.85);

              products.push({
                id: pid,
                brand,
                model: title,
                image,
                releaseDate,
                price,
                mrp: launchPrice,
                url: decodedUrl,
                availability: 'In Stock',
                keySpecs: [],
              });
            }
          }
        } catch (err) {
          // ignore
        }
      }
      return products;
    } catch (error) {
      console.error('Error during DuckDuckGo search fallback scraping:', error);
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
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
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

      // Parse pricing to get launch price / MRP
      let launchPrice: number | undefined;
      const traversePricing = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.strikeOff === true && typeof obj.value === 'number') {
          launchPrice = obj.value;
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(traversePricing);
        } else {
          Object.keys(obj).forEach(k => traversePricing(obj[k]));
        }
      };
      traversePricing(state);

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
