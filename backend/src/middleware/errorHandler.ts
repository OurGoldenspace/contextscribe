import { Request, Response, NextFunction } from 'express'
import { AppError, getErrorMessage } from '../utils/errors'
import { v4 as uuidv4 } from 'uuid'

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const errorId = uuidv4()
  const timestamp = new Date().toISOString()

  // Log the error
  console.error(
    JSON.stringify({
      errorId,
      timestamp,
      path: req.path,
      method: req.method,
      message: getErrorMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
      statusCode: err instanceof AppError ? err.statusCode : 500
    })
  )

  // If it's an AppError, use its status code
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: err.message,
      code: err.code,
      retryable: err.retryable,
      errorId,
      timestamp
    })
    return
  }

  // Otherwise, generic 500 error
  res.status(500).json({
    ok: false,
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    retryable: false,
    errorId,
    timestamp
  })
}