type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class CacheService {
  private static memoryCache = new Map<string, CacheEntry<any>>();
  private static defaultTtlSeconds = 3600; // Default: 1 hour

  /**
   * Get value from cache by key
   */
  static get<T>(key: string): T | null {
    // Implement Redis check here if a Redis library and credentials are added
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set value in cache with TTL in seconds
   */
  static set<T>(key: string, value: T, ttlSeconds: number = this.defaultTtlSeconds): void {
    // Implement Redis store here if a Redis library is added
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.memoryCache.set(key, { value, expiresAt });
  }

  /**
   * Delete value from cache by key
   */
  static delete(key: string): void {
    this.memoryCache.delete(key);
  }

  /**
   * Clear all items from cache
   */
  static clear(): void {
    this.memoryCache.clear();
  }
}
