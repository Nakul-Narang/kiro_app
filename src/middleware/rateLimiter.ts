import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../config/database';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Redis-based rate limiter middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    keyGenerator = (req: Request) => req.ip || 'unknown'
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const redis = getRedisClient();
      const key = `rate_limit:${keyGenerator(req)}`;
      const now = Date.now();
      const window = Math.floor(now / windowMs);
      const windowKey = `${key}:${window}`;

      // Get current count for this window
      const current = await redis.get(windowKey);
      const count = current ? parseInt(current) : 0;

      if (count >= maxRequests) {
        // Rate limit exceeded
        const resetTime = (window + 1) * windowMs;
        const retryAfter = Math.ceil((resetTime - now) / 1000);

        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(resetTime).toISOString(),
          'Retry-After': retryAfter.toString()
        });

        logger.warn(`Rate limit exceeded for ${keyGenerator(req)}`, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          count,
          limit: maxRequests
        });

        res.status(429).json({
          success: false,
          error: {
            message: 'Too many requests, please try again later',
            retryAfter
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Increment counter
      const newCount = count + 1;
      await redis.setEx(windowKey, Math.ceil(windowMs / 1000), newCount.toString());

      // Set rate limit headers
      const resetTime = (window + 1) * windowMs;
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - newCount).toString(),
        'X-RateLimit-Reset': new Date(resetTime).toISOString()
      });

      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      // If Redis is down, allow the request to proceed
      next();
    }
  };
}

// Default rate limiter
export const rateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
});