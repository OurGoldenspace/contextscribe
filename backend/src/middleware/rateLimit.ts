import { Request, Response, NextFunction } from 'express'

const requestCounts = new Map<string, { count: number; resetTime: number }>()

const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30 // 30 requests per minute per IP
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown'
  const now = Date.now()
  const userLimit = requestCounts.get(ip)

  // Reset if window expired
  if (!userLimit || userLimit.resetTime < now) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT.windowMs })
    next()
    return
  }

  // Increment count
  userLimit.count++

  if (userLimit.count > RATE_LIMIT.maxRequests) {
    res.status(429).json({
      ok: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryable: true
    })
    return
  }

  next()
}