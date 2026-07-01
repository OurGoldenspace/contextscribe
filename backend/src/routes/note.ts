import { Router, type Request, type Response, type NextFunction } from 'express'
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
noteRouter.post(
  '/generate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = GenerateNoteSchema.safeParse(req.body)
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid request body',
        code: 'VALIDATION_FAILED',
        retryable: false
      }
      res.status(400).json(response)
      return
    }

    try {
      const result = await generateSOAPNote(parsed.data.transcript, parsed.data.intakeContext)
      const response: ApiResponse<typeof result> = { ok: true, data: result, requestId: uuidv4() }
      res.json(response)
    } catch (err) {
      if (err instanceof LLMOutputError) {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'Model returned malformed output',
          code: 'LLM_OUTPUT_INVALID',
          retryable: true
        }
        res.status(502).json(response)
        return
      }
      next(err)
    }
  }
)

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

noteRouter.post(
  '/compare',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = CompareSchema.safeParse(req.body)
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid request body — comparison requires both a transcript and an intakeContext',
        code: 'VALIDATION_FAILED',
        retryable: false
      }
      res.status(400).json(response)
      return
    }

    try {
      const result = await runComparison(parsed.data.transcript, parsed.data.intakeContext)
      const response: ApiResponse<typeof result> = { ok: true, data: result, requestId: uuidv4() }
      res.json(response)
    } catch (err) {
      if (err instanceof LLMOutputError) {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'Model returned malformed output during comparison',
          code: 'LLM_OUTPUT_INVALID',
          retryable: true
        }
        res.status(502).json(response)
        return
      }
      next(err)
    }
  }
)