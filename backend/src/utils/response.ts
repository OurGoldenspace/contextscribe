export interface ApiResponse<T> {
    ok: boolean
    data?: T
    error?: string
    code?: string
    timestamp: string
    requestId: string
  }
  
  export function successResponse<T>(
    data: T,
    requestId: string
  ): ApiResponse<T> {
    return {
      ok: true,
      data,
      timestamp: new Date().toISOString(),
      requestId
    }
  }
  
  export function errorResponse(
    error: string,
    code: string,
    requestId: string
  ): Omit<ApiResponse<never>, 'data'> {
    return {
      ok: false,
      error,
      code,
      timestamp: new Date().toISOString(),
      requestId
    }
  }