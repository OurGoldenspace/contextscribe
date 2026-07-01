export interface Metrics {
    intakeSessions: number
    completedIntakes: number
    avgConfidenceScore: number
    redFlagsDetected: number
    hallucinations: number
    avgSessionDuration: number
    totalTokensUsed: number
    estimatedCost: number
  }
  
  class MetricsCollector {
    private metrics: Metrics = {
      intakeSessions: 0,
      completedIntakes: 0,
      avgConfidenceScore: 0,
      redFlagsDetected: 0,
      hallucinations: 0,
      avgSessionDuration: 0,
      totalTokensUsed: 0,
      estimatedCost: 0
    }
  
    recordSession(duration: number, tokensUsed: number, cost: number): void {
      this.metrics.intakeSessions++
      this.metrics.totalTokensUsed += tokensUsed
      this.metrics.estimatedCost += cost
    }
  
    recordCompletion(confidenceScore: number, redFlags: number, hallucinations: number): void {
      this.metrics.completedIntakes++
      this.metrics.avgConfidenceScore =
        (this.metrics.avgConfidenceScore * (this.metrics.completedIntakes - 1) + confidenceScore) /
        this.metrics.completedIntakes
      this.metrics.redFlagsDetected += redFlags
      this.metrics.hallucinations += hallucinations
    }
  
    getMetrics(): Metrics {
      return this.metrics
    }
  }
  
  export const metricsCollector = new MetricsCollector()