import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { generateSOAPNote } from '../services/noteGenerator'
import type { ApiResponse } from '../types'

export const soapRouter = Router()

const GenerateSOAPSchema = z.object({
  summary: z.object({
    chiefComplaint: z.string(),
    hpi: z.string(),
    medications: z.array(z.any()),
    allergies: z.array(z.any()),
    pmhx: z.array(z.string()),
    redFlags: z.array(z.string())
  }),
  // Optional: transcript if available (for SOAP generation with visit context)
  transcript: z.string().optional()
})

/**
 * POST /api/intake/:sessionId/soap
 * 
 * Takes the completed intake summary and generates a SOAP note.
 * This is a simulation endpoint — in a real system, this would be called
 * after the clinician-patient encounter is recorded.
 * 
 * For MVP demo purposes:
 * - If transcript is provided, use it (real visit data)
 * - If not, generate a synthetic transcript from the summary for demo
 */
soapRouter.post('/:sessionId/soap', async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId
  if (typeof sessionId !== 'string') {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Invalid session ID',
      code: 'VALIDATION_FAILED',
      retryable: false
    }
    return res.status(400).json(response)
  }

  const parsed = GenerateSOAPSchema.safeParse(req.body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Invalid request body',
      code: 'VALIDATION_FAILED',
      retryable: false
    }
    return res.status(400).json(response)
  }

  try {
    const { summary, transcript } = parsed.data

    // For demo: if no transcript provided, create a synthetic one from summary
    // In production, this would come from the actual clinical encounter recording
    const visitTranscript = transcript || `
Doctor: Good morning, thanks for coming in. I see from your intake that your chief complaint is: ${summary.chiefComplaint}. Tell me a bit more about that.
Patient: ${summary.hpi}
Doctor: I see. Are you taking any medications?
Patient: Yes, ${summary.medications.map(m => `${m.name} ${m.dose}`).join(', ')}.
Doctor: Any allergies I should know about?
Patient: ${summary.allergies.length > 0 ? summary.allergies.map(a => `${a.substance} — ${a.reaction}`).join(', ') : 'No known allergies'}.
Doctor: And any significant past medical history?
Patient: ${summary.pmhx.length > 0 ? summary.pmhx.join(', ') : 'Nothing major'}.
Doctor: Alright, let me do a quick exam and we'll go from there.
    `.trim()

    // Call the existing SOAP generation service
    const result = await generateSOAPNote(visitTranscript, summary)

    if (!result.crossReferenceOk) {
      console.warn(`[SOAP generation] Cross-reference check failed for unverified medications: ${result.unverifiedMedications.join(', ')}`)
    }

    const response: ApiResponse<{ note: typeof result.note; warnings: string[] }> = {
      ok: true,
      data: {
        note: result.note,
        warnings: result.unverifiedMedications.length > 0 ? [`Unverified medications: ${result.unverifiedMedications.join(', ')}`] : []
      },
      requestId: uuidv4()
    }
    res.json(response)
  } catch (err) {
    console.error('[intake/soap] failed', err)
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Failed to generate SOAP note',
      code: 'SOAP_GENERATION_FAILED',
      retryable: true
    }
    res.status(500).json(response)
  }
})