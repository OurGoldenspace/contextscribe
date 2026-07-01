export interface ErrorMetrics {
    total: number
    byCode: Record<string, number>
    byStatusCode: Record<number, number>
  }
  
  const metrics: ErrorMetrics = {
    total: 0,
    byCode: {},
    byStatusCode: {}
  }
  
  export function trackError(code: string, statusCode: number): void {
    metrics.total++
    metrics.byCode[code] = (metrics.byCode[code] || 0) + 1
    metrics.byStatusCode[statusCode] = (metrics.byStatusCode[statusCode] || 0) + 1
  }
  
  export function getMetrics(): ErrorMetrics {
    return metrics
  }