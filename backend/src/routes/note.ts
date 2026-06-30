import OpenAI from 'openai'
import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { generateSOAPNote, runComparison } from '../services/noteGenerator'
import { ClinicalSummarySchema, LLMOutputError } from '../services/validation'
import type { ApiResponse } from '../types'

export const noteRouter = Router()

const GenerateNoteSchema = z.object({
  transcript: z.string().min(1).max(8000),
  intakeContext: ClinicalSummarySchema.optional()
})

// ─────────────────────────────────────────────────────────────────────────
// POST /api/note/generate — single-mode generation (with or without
// context depending on whether intakeContext is supplied).
// ─────────────────────────────────────────────────────────────────────────
noteRouter.post('/generate', async (req: Request, res: Response) => {
  const parsed = GenerateNoteSchema.safeParse(req.body)
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
    const result = await generateSOAPNote(parsed.data.transcript, parsed.data.intakeContext)
    const response: ApiResponse<typeof result> = { ok: true, data: result, requestId: uuidv4() }
    res.json(response)
  } catch (err) {
    console.error('[note/generate] failed', err)
    if (err instanceof LLMOutputError) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Model returned malformed output',
        code: 'LLM_OUTPUT_INVALID',
        retryable: true
      }
      return res.status(502).json(response)
    }
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Failed to generate note',
      code: 'NOTE_GENERATION_FAILED',
      retryable: true
    }
    res.status(500).json(response)
  }
})

// ─────────────────────────────────────────────────────────────────────────
// POST /api/note/compare — THE headline demo endpoint. Runs the same
// transcript through both the with-context and without-context paths and
// returns both, including cross-reference results, so the difference is
// directly visible.
// ─────────────────────────────────────────────────────────────────────────
const CompareSchema = z.object({
  transcript: z.string().min(1).max(8000),
  intakeContext: ClinicalSummarySchema
})

noteRouter.post('/compare', async (req: Request, res: Response) => {
  const parsed = CompareSchema.safeParse(req.body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Invalid request body — comparison requires both a transcript and an intakeContext',
      code: 'VALIDATION_FAILED',
      retryable: false
    }
    return res.status(400).json(response)
  }

  try {
    const result = await runComparison(parsed.data.transcript, parsed.data.intakeContext)
    const response: ApiResponse<typeof result> = { ok: true, data: result, requestId: uuidv4() }
    res.json(response)
  } catch (err) {
    console.error('[note/compare] failed', err)
    if (err instanceof LLMOutputError) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Model returned malformed output during comparison',
        code: 'LLM_OUTPUT_INVALID',
        retryable: true
      }
      return res.status(502).json(response)
    }
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Failed to run comparison',
      code: 'COMPARISON_FAILED',
      retryable: true
    }
    res.status(500).json(response)
  }
})
