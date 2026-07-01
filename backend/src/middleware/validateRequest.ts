import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { ValidationError } from '../utils/errors'

export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body)
    
    if (!parsed.success) {
      const errors = parsed.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ')
      throw new ValidationError(errors)
    }
    
    // Attach validated data to request
    req.body = parsed.data
    next()
  }
}