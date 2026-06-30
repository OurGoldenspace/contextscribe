import { z } from 'zod'
import type { ClinicalSummary, SOAPNote } from '../types'

// ─────────────────────────────────────────────────────────────────────────
// Schema validation — catches malformed or hallucinated structure.
// This is the first guardrail layer: the model's output must match this
// shape exactly, or it's rejected before it ever reaches a user.
// ─────────────────────────────────────────────────────────────────────────

export const ClinicalSummarySchema = z.object({
  chiefComplaint: z.string().min(1),
  hpi: z.string(),
  medications: z.array(
    z.object({
      name: z.string().min(1),
      dose: z.string(),
      frequency: z.string()
    })
  ),
  allergies: z.array(
    z.object({
      substance: z.string().min(1),
      reaction: z.string(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'])
    })
  ),
  pmhx: z.array(z.string()),
  redFlags: z.array(z.string()),
  confidence: z.object({
    medications: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    allergies: z.enum(['HIGH', 'MEDIUM', 'LOW'])
  }),
  uncertain: z.array(z.string()).optional()
})

export const SOAPNoteSchema = z.object({
  subjective: z.object({
    chiefComplaint: z.string(),
    hpi: z.string(),
    medications: z.array(z.string()),
    allergies: z.array(z.string())
  }),
  objective: z.object({
    notes: z.string()
  }),
  assessment: z.string(),
  plan: z.object({
    investigations: z.array(z.string()),
    treatments: z.array(z.string()),
    followUp: z.string()
  }),
  generatedWithContext: z.boolean(),
  flaggedFields: z.array(z.string())
})

export class LLMOutputError extends Error {
  details: unknown
  constructor(message: string, details: unknown) {
    super(message)
    this.name = 'LLMOutputError'
    this.details = details
  }
}

/**
 * Strips markdown code fences and parses JSON, throwing a structured
 * LLMOutputError (not a generic crash) if the model didn't return valid
 * JSON. This is the failure mode that happens most often in practice —
 * the model wraps its output in ```json fences despite instructions not to.
 */
export function parseModelJSON(raw: string): unknown {
  const clean = raw.replace(/```json\n?|\n?```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    throw new LLMOutputError('Model returned non-JSON output', { rawText: raw })
  }
}

export function validateClinicalSummary(raw: unknown): ClinicalSummary {
  const result = ClinicalSummarySchema.safeParse(raw)
  if (!result.success) {
    throw new LLMOutputError('Clinical summary failed schema validation', {
      errors: result.error.flatten()
    })
  }
  return result.data
}

export function validateSOAPNote(raw: unknown): SOAPNote {
  const result = SOAPNoteSchema.safeParse(raw)
  if (!result.success) {
    throw new LLMOutputError('SOAP note failed schema validation', {
      errors: result.error.flatten()
    })
  }
  return result.data
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-reference validation — the second, more important guardrail layer.
// Schema validation only checks shape. This checks substance: does every
// medication and allergy named in the output actually appear somewhere in
// the source material the model was given? If not, that's not a formatting
// problem — it's a hallucination, and it gets flagged rather than silently
// passed through.
// ─────────────────────────────────────────────────────────────────────────

export interface CrossReferenceResult {
  ok: boolean
  unverifiedMedications: string[]
  unverifiedAllergies: string[]
}

/**
 * Checks that every medication and allergy substance the model named in
 * its output appears (case-insensitively, substring match) somewhere in
 * the source text it was grounded on. Source text is the transcript plus,
 * if present, the intake summary's own medication/allergy names — i.e.
 * the union of everything the model was actually given to work with.
 */
export function crossReferenceSOAPNote(
  note: SOAPNote,
  sourceText: string,
  intakeContext?: ClinicalSummary
): CrossReferenceResult {
  const haystack = buildHaystack(sourceText, intakeContext)

  const unverifiedMedications = note.subjective.medications.filter(
    (med) => !mentionedIn(haystack, med)
  )
  const unverifiedAllergies = note.subjective.allergies.filter(
    (allergy) => !mentionedIn(haystack, allergy)
  )

  return {
    ok: unverifiedMedications.length === 0 && unverifiedAllergies.length === 0,
    unverifiedMedications,
    unverifiedAllergies
  }
}

function buildHaystack(sourceText: string, intakeContext?: ClinicalSummary): string {
  const parts = [sourceText.toLowerCase()]
  if (intakeContext) {
    parts.push(intakeContext.medications.map((m) => m.name).join(' ').toLowerCase())
    parts.push(intakeContext.allergies.map((a) => a.substance).join(' ').toLowerCase())
  }
  return parts.join(' ')
}

function mentionedIn(haystack: string, term: string): boolean {
  // Extract the likely substance/drug name from a string like
  // "metformin 500mg twice daily" by taking the first word — a real
  // implementation would use a drug-name extraction step, but a simple
  // first-token heuristic is sufficient to demonstrate the mechanism.
  const firstToken = term.toLowerCase().split(/[\s,(]/)[0]
  if (!firstToken) return false
  return haystack.includes(firstToken)
}
