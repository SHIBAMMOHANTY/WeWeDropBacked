export interface ScrapedProduct {
  id: string; // Flipkart PID
  brand: string;
  model: string;
  image: string;
  releaseDate?: string;
  price?: number;
  mrp?: number;
  url?: string;
  availability?: string;
  keySpecs?: string[];
}

export interface ScrapedSpecs {
  brand: string;
  model: string;
  display?: string;
  processor?: string;
  ram?: string;
  storage?: string;
  battery?: string;
  camera?: string;
  os?: string;
  images: string[];
  launchPrice?: number;
  price?: number;
  releaseDate?: string;
}

export interface PriceItem {
  seller: string;
  price: number;
  mrp?: number;
  availability: string;
  productUrl: string;
  lastUpdated: Date;
}

export interface MarketPriceResponse {
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  prices: PriceItem[];
}

export interface QuoteRequest {
  brand: string;
  model: string;
  storage: string;
  condition: 'excellent' | 'good' | 'average' | string;
  batteryHealth: number;
  screenDamage: boolean;
  accessories: string[];
}

export interface QuoteResponse {
  estimatedPrice: number;
  minPrice: number;
  maxPrice: number;
  confidenceScore: number;
}
