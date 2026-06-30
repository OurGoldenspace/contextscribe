// Shared types — the contract between intake agent, note generator, and frontend.
// Designed as discriminated unions so illegal states are unrepresentable.

export interface Message {
    role: 'patient' | 'assistant'
    content: string
    timestamp: string
  }
  
  export interface ClinicalSummary {
    chiefComplaint: string
    hpi: string
    medications: Medication[]
    allergies: Allergy[]
    pmhx: string[]
    redFlags: string[]
    confidence: {
      medications: Confidence
      allergies: Confidence
    }
    uncertain?: string[]
  }
  
  export interface Medication {
    name: string
    dose: string
    frequency: string
  }
  
  export interface Allergy {
    substance: string
    reaction: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  }
  
  export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
  
  // Discriminated union — an intake session can only be in one of these shapes.
  // You cannot access `summary` unless status is 'complete'.
  export type IntakeSessionState =
    | { status: 'active'; sessionId: string; messages: Message[] }
    | { status: 'complete'; sessionId: string; messages: Message[]; summary: ClinicalSummary }
    | { status: 'error'; sessionId: string; code: string; retryable: boolean }
  
  export interface SOAPNote {
    subjective: {
      chiefComplaint: string
      hpi: string
      medications: string[]
      allergies: string[]
    }
    objective: {
      notes: string
    }
    assessment: string
    plan: {
      investigations: string[]
      treatments: string[]
      followUp: string
    }
    generatedWithContext: boolean
    flaggedFields: string[]
  }
  
  // Generic API response wrapper — used on every endpoint.
  export type ApiResponse<T> =
    | {
        ok: true
        data: T
        requestId?: string
      }
    | {
        ok: false
        error: string
        code: string
        retryable: boolean
        requestId?: string
      }
  
  export interface EvalAssertion {
    field: string
    severity: 'blocker' | 'warning'
    // exactly one of these is set
    contains?: string
    notContains?: string
    includes?: string
    equals?: unknown
    maxLength?: number
    not?: string
  }
  
  export interface EvalCase {
    id: string
    description: string
    transcript: string
    intakeSummary?: ClinicalSummary // omitted = test the no-context path deliberately
    assertions: EvalAssertion[]
  }
  
  export interface EvalCaseResult {
    id: string
    description: string
    passed: boolean
    blockersFailed: string[]
    warningsFailed: string[]
    output: SOAPNote
  }
  
  export interface EvalReport {
    passRate: number
    passed: boolean
    results: EvalCaseResult[]
  }
  