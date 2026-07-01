import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { generateSOAPNote } from '../services/noteGenerator'
import type { ApiResponse, ClinicalSummary } from '../types'

export const soapRouter = Router()

const GenerateSOAPSchema = z.object({
  summary: z.object({
    chiefComplaint: z.string().min(1),
    hpi: z.string().min(1),

    medications: z.array(
      z.object({
        name: z.string().min(1),
        dose: z.string().optional().default(''),
        frequency: z.string().default('')
      })
    ),

    allergies: z.array(
      z.object({
        substance: z.string().min(1),
        reaction: z.string().default(''),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']).default('UNKNOWN')
      })
    ),

    pmhx: z.array(z.string()),
    redFlags: z.array(z.string()),

    confidence: z.object({
      medications: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      allergies: z.enum(['HIGH', 'MEDIUM', 'LOW'])
    }),

    uncertain: z.array(z.string()).optional().default([])
  }),

  transcript: z.string().optional()
})

soapRouter.post(
  '/:sessionId/soap',
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params.sessionId

    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid session ID',
        code: 'VALIDATION_FAILED',
        retryable: false,
        requestId: uuidv4()
      }

      res.status(400).json(response)
      return
    }

    const parsed = GenerateSOAPSchema.safeParse(req.body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid request body',
        code: 'VALIDATION_FAILED',
        retryable: false,
        requestId: uuidv4()
      }

      res.status(400).json(response)
      return
    }

    try {
      const { transcript } = parsed.data

      const summary: ClinicalSummary = parsed.data.summary

      const medicationText =
        summary.medications.length > 0
          ? summary.medications
              .map((medication) => {
                const dose = medication.dose ?? ''
                const frequency = medication.frequency ?? ''

                return [medication.name, dose, frequency]
                  .filter(Boolean)
                  .join(' ')
              })
              .join(', ')
          : 'None'

      const allergyText =
        summary.allergies.length > 0
          ? summary.allergies
              .map((allergy) => {
                const reaction =
                  allergy.reaction || 'reaction not specified'

                return `${allergy.substance} — ${reaction}`
              })
              .join(', ')
          : 'No known allergies'

      const medicalHistoryText =
        summary.pmhx.length > 0
          ? summary.pmhx.join(', ')
          : 'No significant past medical history reported'

      const visitTranscript =
        transcript?.trim() ||
        `
Doctor: Good morning. I see from your intake that your main concern is ${summary.chiefComplaint}. Can you tell me more about it?

Patient: ${summary.hpi}

Doctor: Are you currently taking any medications?

Patient: ${medicationText}.

Doctor: Do you have any allergies?

Patient: ${allergyText}.

Doctor: Do you have any significant past medical history?

Patient: ${medicalHistoryText}.

Doctor: Thank you. I will review this information and continue with the assessment.
        `.trim()

      const result = await generateSOAPNote(
        visitTranscript,
        summary
      )

      if (!result.crossReferenceOk) {
        console.warn('[SOAP generation] Cross-reference check failed', {
          sessionId,
          unverifiedMedications: result.unverifiedMedications
        })
      }

      const warnings =
        result.unverifiedMedications.length > 0
          ? [
              `Unverified medications: ${result.unverifiedMedications.join(
                ', '
              )}`
            ]
          : []

      const response: ApiResponse<{
        note: typeof result.note
        warnings: string[]
      }> = {
        ok: true,
        data: {
          note: result.note,
          warnings
        },
        requestId: uuidv4()
      }

      res.status(200).json(response)
    } catch (error) {
      console.error('[intake/soap] failed', {
        sessionId,
        error
      })

      const response: ApiResponse<never> = {
        ok: false,
        error: 'Failed to generate SOAP note',
        code: 'SOAP_GENERATION_FAILED',
        retryable: true,
        requestId: uuidv4()
      }

      res.status(500).json(response)
    }
  }
)