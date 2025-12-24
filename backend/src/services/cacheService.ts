import { getDatabase } from '../config/database';
import logger, { loggers } from '../utils/logger';
import { Environment, isCachingEnabled } from '../config/cloud9';

/**
 * Cache Service
 * Manages caching of Cloud 9 API responses with TTL (Time-To-Live)
 */

export interface CacheMetadata {
  cache_key: string;
  last_updated: string;
  ttl_seconds: number;
  environment: Environment;
}

export class CacheService {
  private environment: Environment;

  constructor(environment: Environment = 'sandbox') {
    this.environment = environment;
  }

  /**
   * Check if cache is fresh (not expired)
   */
  isCacheFresh(cacheKey: string): boolean {
    // If caching is disabled, always return false to force API fetch
    if (!isCachingEnabled()) {
      return false;
    }

    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT cache_key, last_updated, ttl_seconds
        FROM cache_metadata
        WHERE cache_key = ? AND environment = ?
      `);

      const metadata = stmt.get(cacheKey, this.environment) as CacheMetadata | undefined;

      if (!metadata) {
        loggers.cacheMiss(cacheKey, 'metadata');
        return false;
      }

      const lastUpdated = new Date(metadata.last_updated).getTime();
      const now = Date.now();
      const age = (now - lastUpdated) / 1000; // age in seconds

      const isFresh = age < metadata.ttl_seconds;

      if (isFresh) {
        loggers.cacheHit(cacheKey, 'metadata');
      } else {
        loggers.cacheMiss(cacheKey, 'expired');
      }

      return isFresh;
    } catch (error) {
      logger.error('Error checking cache freshness', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Update cache metadata
   */
  updateCacheMetadata(cacheKey: string, ttl: number): void {
    // If caching is disabled, skip updating cache metadata
    if (!isCachingEnabled()) {
      return;
    }

    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO cache_metadata (cache_key, last_updated, ttl_seconds, environment)
        VALUES (?, datetime('now'), ?, ?)
      `);

      stmt.run(cacheKey, ttl, this.environment);

      loggers.cacheRefresh(cacheKey, ttl);
    } catch (error) {
      logger.error('Error updating cache metadata', {
        cacheKey,
        ttl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear cache for a specific key
   */
  clearCache(cacheKey: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM cache_metadata
        WHERE cache_key = ? AND environment = ?
      `);

      stmt.run(cacheKey, this.environment);

      logger.info('Cache cleared', { cacheKey, environment: this.environment });
    } catch (error) {
      logger.error('Error clearing cache', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear all cache for current environment
   */
  clearAllCache(): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM cache_metadata
        WHERE environment = ?
      `);

      stmt.run(this.environment);

      logger.info('All cache cleared', { environment: this.environment });
    } catch (error) {
      logger.error('Error clearing all cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    total: number;
    fresh: number;
    expired: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  } {
    const db = getDatabase();

    try {
      const totalStmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM cache_metadata
        WHERE environment = ?
      `);

      const freshStmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM cache_metadata
        WHERE environment = ?
        AND (julianday('now') - julianday(last_updated)) * 86400 < ttl_seconds
      `);

      const oldestStmt = db.prepare(`
        SELECT last_updated
        FROM cache_metadata
        WHERE environment = ?
        ORDER BY last_updated ASC
        LIMIT 1
      `);

      const newestStmt = db.prepare(`
        SELECT last_updated
        FROM cache_metadata
        WHERE environment = ?
        ORDER BY last_updated DESC
        LIMIT 1
      `);

      const total = (totalStmt.get(this.environment) as any).count;
      const fresh = (freshStmt.get(this.environment) as any).count;
      const oldest = oldestStmt.get(this.environment) as any;
      const newest = newestStmt.get(this.environment) as any;

      return {
        total,
        fresh,
        expired: total - fresh,
        oldestEntry: oldest?.last_updated || null,
        newestEntry: newest?.last_updated || null,
      };
    } catch (error) {
      logger.error('Error getting cache stats', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        total: 0,
        fresh: 0,
        expired: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }

  /**
   * Set environment for this cache service instance
   */
  setEnvironment(environment: Environment): void {
    this.environment = environment;
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return this.environment;
  }
}

/**
 * Factory function to create a cache service instance
 */
export function createCacheService(environment: Environment = 'sandbox'): CacheService {
  return new CacheService(environment);
}

/**
 * Singleton instance for shared use
 */
let sharedCache: CacheService | null = null;

export function getSharedCache(environment?: Environment): CacheService {
  if (!sharedCache || (environment && sharedCache.getEnvironment() !== environment)) {
    sharedCache = new CacheService(environment || 'sandbox');
  }
  return sharedCache;
}
