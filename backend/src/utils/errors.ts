export class AppError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
      public retryable: boolean = false
    ) {
      super(message)
      this.name = 'AppError'
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message: string) {
      super(400, 'VALIDATION_FAILED', message, false)
    }
  }
  
  export class NotFoundError extends AppError {
    constructor(message: string) {
      super(404, 'NOT_FOUND', message, false)
    }
  }
  
  export class DatabaseError extends AppError {
    constructor(message: string) {
      super(500, 'DATABASE_ERROR', message, true)
    }
  }
  
  export class ExternalAPIError extends AppError {
    constructor(message: string, public originalError?: Error) {
      super(502, 'EXTERNAL_API_ERROR', message, true)
    }
  }
  
  // Helper to safely get error message
  export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    return 'An unexpected error occurred'
  }