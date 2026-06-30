import { openrouter } from '../config/openrouter'
import type { ClinicalSummary, SOAPNote } from '../types'
import {
  parseModelJSON,
  validateSOAPNote,
  crossReferenceSOAPNote,
  LLMOutputError
} from './validation'



// ─────────────────────────────────────────────────────────────────────────
// This is the file that proves the thesis. One prompt template, one
// conditional instruction block. The only variable between the "with
// context" and "without context" runs is whether intakeContext is present.
// Everything else — model, max_tokens, output schema — is identical. That
// makes the comparison clean: any difference in output quality is
// attributable to the presence of upstream structured context, not to a
// different model configuration.
// ─────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(hasContext: boolean): string {
  const groundingRule = hasContext
    ? `You have been given a structured pre-visit intake summary as verified
ground truth. Treat every medication, allergy, and history item in that
summary as confirmed. Use the visit transcript to add what was discussed
during the visit itself, and to confirm or update the intake data if the
transcript explicitly contradicts it. If the transcript contradicts the
intake summary, note the discrepancy explicitly in the assessment rather
than silently overwriting either source.`
    : `You have NOT been given any pre-visit intake data. You may ONLY
document medications, allergies, and history items that are explicitly
stated in the visit transcript below. Do not infer, assume, or fill gaps
based on what would be typical for a presentation like this. If something
is not mentioned in the transcript, it does not appear in your output.`

  return `
ROLE:
You are a clinical documentation assistant. Given a visit transcript${hasContext ? ' and a pre-visit intake summary' : ''}, you generate a structured SOAP note for clinician review.

CONSTRAINTS:
${groundingRule}
- Never invent a diagnosis. The assessment should describe the clinical
  picture as presented, not assert a definitive diagnosis unless the
  transcript shows the clinician stating one.
- If you are uncertain about any field, add its name to "flaggedFields"
  rather than guessing. An uncertain field still gets your best-effort
  content, but it is marked so a human reviewer pays extra attention.
- Set "generatedWithContext" to ${hasContext} exactly — this reflects the
  actual condition this note was generated under, not a guess.

OUTPUT FORMAT:
Respond with ONLY a valid JSON object matching this schema, no preamble,
no markdown fences:

{
  "subjective": {
    "chiefComplaint": "string",
    "hpi": "string",
    "medications": ["string array — medication names only, as mentioned"],
    "allergies": ["string array — allergy substances only, as mentioned"]
  },
  "objective": { "notes": "string — anything examination-related mentioned in transcript" },
  "assessment": "string",
  "plan": {
    "investigations": ["string array"],
    "treatments": ["string array"],
    "followUp": "string"
  },
  "generatedWithContext": ${hasContext},
  "flaggedFields": ["string array of field names you were uncertain about"]
}
`.trim()
}

export interface NoteGenerationResult {
  note: SOAPNote
  crossReferenceOk: boolean
  unverifiedMedications: string[]
  unverifiedAllergies: string[]
}

/**
 * Generates a SOAP note from a transcript, optionally grounded by a
 * structured intake summary. This is called twice in the comparison demo
 * — once with intakeContext, once without — using the exact same
 * transcript, to show the effect of upstream context on output quality
 * and hallucination rate.
 */
export async function generateSOAPNote(
  transcript: string,
  intakeContext?: ClinicalSummary
): Promise<NoteGenerationResult> {
  const hasContext = intakeContext !== undefined
  const systemPrompt = buildSystemPrompt(hasContext)

  const userContent = hasContext
    ? `PRE-VISIT INTAKE SUMMARY (verified ground truth):
${JSON.stringify(intakeContext, null, 2)}

VISIT TRANSCRIPT:
${transcript}`
    : `VISIT TRANSCRIPT (no pre-visit intake available):
${transcript}`

  const response = await openrouter.chat.completions.create({
    model: 'openai/gpt-4o',
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userContent
      }
    ]
  })

  const textContent = response.choices[0]?.message?.content

  if (!textContent) {
    throw new LLMOutputError('Model returned no text content', {
      response
    })
  }

  const parsed = parseModelJSON(textContent)
  const note = validateSOAPNote(parsed)

  const crossRef = crossReferenceSOAPNote(
    note,
    transcript,
    intakeContext
  )

  return {
    note,
    crossReferenceOk: crossRef.ok,
    unverifiedMedications: crossRef.unverifiedMedications,
    unverifiedAllergies: crossRef.unverifiedAllergies
  }
}

export interface ComparisonResult {
  withContext: NoteGenerationResult
  withoutContext: NoteGenerationResult
}

export async function runComparison(
  transcript: string,
  intakeContext: ClinicalSummary
): Promise<ComparisonResult> {
  const [withContext, withoutContext] = await Promise.all([
    generateSOAPNote(transcript, intakeContext),
    generateSOAPNote(transcript)
  ])

  return {
    withContext,
    withoutContext
  }
}