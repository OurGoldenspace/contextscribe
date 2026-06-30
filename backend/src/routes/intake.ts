import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { IntakeSession } from '../models/IntakeSession'
import { runIntakeTurn } from '../services/intakeAgent'
import { validateClinicalSummary, LLMOutputError } from '../services/validation'
import type { ApiResponse, IntakeSessionState, Message } from '../types'

export const intakeRouter = Router()

// ─────────────────────────────────────────────────────────────────────────
// POST /api/intake/start — creates a new session and asks the first
// question.
// ─────────────────────────────────────────────────────────────────────────
intakeRouter.post('/start', async (req: Request, res: Response) => {
  const sessionId = uuidv4()

  try {
    const result = await runIntakeTurn([])

    await IntakeSession.create({
      sessionId,
      messages: [{ role: 'assistant', content: result.assistantMessage, timestamp: new Date() }],
      status: 'active'
    })

    const response: ApiResponse<IntakeSessionState> = {
      ok: true,
      data: {
        status: 'active',
        sessionId,
        messages: [{ role: 'assistant', content: result.assistantMessage, timestamp: new Date().toISOString() }]
      },
      requestId: uuidv4()
    }
    res.json(response)
  } catch (err) {
    console.error('[intake/start] failed', err)
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Failed to start intake session',
      code: 'INTAKE_START_FAILED',
      retryable: true
    }
    res.status(500).json(response)
  }
})

// ─────────────────────────────────────────────────────────────────────────
// POST /api/intake/:sessionId/message — sends a patient message, gets the
// next question (or, if intake is complete, the structured summary).
// ─────────────────────────────────────────────────────────────────────────
const SendMessageSchema = z.object({
  message: z.string().min(1).max(2000).trim()
})

intakeRouter.post('/:sessionId/message', async (req: Request, res: Response) => {
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

  const parsed = SendMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Invalid request body',
      code: 'VALIDATION_FAILED',
      retryable: false
    }
    return res.status(400).json(response)
  }

  const session = await IntakeSession.findOne({ sessionId })
  if (!session) {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Session not found',
      code: 'SESSION_NOT_FOUND',
      retryable: false
    }
    return res.status(404).json(response)
  }

  if (session.status !== 'active') {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Session is not active',
      code: 'SESSION_NOT_ACTIVE',
      retryable: false
    }
    return res.status(409).json(response)
  }

  try {
    session.messages.push({
      role: 'patient',
      content: parsed.data.message,
      timestamp: new Date()
    })

    const history: Message[] = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString()
    }))

    const result = await runIntakeTurn(history)

    if (result.isComplete && result.summary) {
      const validatedSummary = validateClinicalSummary(result.summary)

      // Mongoose's typed subdocument for structuredData expects optional
      // fields with possible undefined; the validated summary always has
      // these as required strings, so we use set() explicitly rather than
      // relying on structural assignment to avoid the strict-mode mismatch.
      session.set('structuredData', validatedSummary)
      session.status = 'complete'
      await session.save()

      const response: ApiResponse<IntakeSessionState> = {
        ok: true,
        data: {
          status: 'complete',
          sessionId,
          messages: history,
          summary: validatedSummary
        },
        requestId: uuidv4()
      }
      return res.json(response)
    }

    session.messages.push({
      role: 'assistant',
      content: result.assistantMessage,
      timestamp: new Date()
    })
    await session.save()

    const response: ApiResponse<IntakeSessionState> = {
      ok: true,
      data: {
        status: 'active',
        sessionId,
        messages: session.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }))
      },
      requestId: uuidv4()
    }
    res.json(response)
  } catch (err) {
    console.error('[intake/message] failed', err)

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
      error: 'Failed to process message',
      code: 'INTAKE_MESSAGE_FAILED',
      retryable: true
    }
    res.status(500).json(response)
  }
})

// ─────────────────────────────────────────────────────────────────────────
// GET /api/intake/:sessionId — fetch current session state (for resuming
// or for the comparison view to pull a completed summary).
// ─────────────────────────────────────────────────────────────────────────
intakeRouter.get('/:sessionId', async (req: Request, res: Response) => {
  const session = await IntakeSession.findOne({ sessionId: req.params.sessionId })
  if (!session) {
    const response: ApiResponse<never> = {
      ok: false,
      error: 'Session not found',
      code: 'SESSION_NOT_FOUND',
      retryable: false
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<typeof session> = {
    ok: true,
    data: session,
    requestId: uuidv4()
  }
  res.json(response)
})
