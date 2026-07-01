import { Router, type Request, type Response, type NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { IntakeSession } from '../models/IntakeSession'
import { runIntakeTurn } from '../services/intakeAgent'
import {
  validateClinicalSummary,
  LLMOutputError
} from '../services/validation'
import type {
  ApiResponse,
  IntakeSessionState,
  Message
} from '../types'

export const intakeRouter = Router()

const SendMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000)
})

function serializeMessages(
  messages: Array<{
    role: 'patient' | 'assistant'
    content: string
    timestamp: Date
  }>
): Message[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString()
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intake/start
// Creates a new intake session and asks the first question.
// ─────────────────────────────────────────────────────────────────────────────

intakeRouter.post(
  '/start',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const sessionId = uuidv4()
    const requestId = uuidv4()

    try {
      const result = await runIntakeTurn([])
      const now = new Date()

      const session = await IntakeSession.create({
        sessionId,
        messages: [
          {
            role: 'assistant',
            content: result.assistantMessage,
            timestamp: now
          }
        ],
        status: 'active'
      })

      const response: ApiResponse<IntakeSessionState> = {
        ok: true,
        data: {
          status: 'active',
          sessionId,
          messages: serializeMessages(session.messages)
        },
        requestId
      }

      res.status(201).json(response)
    } catch (error) {
      next(error)
    }
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intake/:sessionId/message
// Adds one patient message and returns either:
// - the next intake question, or
// - the completed structured clinical summary.
// ─────────────────────────────────────────────────────────────────────────────

intakeRouter.post(
  '/:sessionId/message',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = uuidv4()
    const sessionId = req.params.sessionId

    if (
      typeof sessionId !== 'string' ||
      sessionId.trim().length === 0
    ) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid session ID',
        code: 'VALIDATION_FAILED',
        retryable: false,
        requestId
      }

      res.status(400).json(response)
      return
    }

    const parsed = SendMessageSchema.safeParse(req.body)

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Message must contain between 1 and 2000 characters',
        code: 'VALIDATION_FAILED',
        retryable: false,
        requestId
      }

      res.status(400).json(response)
      return
    }

    try {
      const session = await IntakeSession.findOne({ sessionId })

      if (!session) {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
          retryable: false,
          requestId
        }

        res.status(404).json(response)
        return
      }

      // This prevents any more model calls after intake completion.
      if (session.status === 'complete') {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'This intake session is already complete',
          code: 'INTAKE_ALREADY_COMPLETE',
          retryable: false,
          requestId
        }

        res.status(409).json(response)
        return
      }

      if (session.status !== 'active') {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'Session is not active',
          code: 'SESSION_NOT_ACTIVE',
          retryable: false,
          requestId
        }

        res.status(409).json(response)
        return
      }

      session.messages.push({
        role: 'patient',
        content: parsed.data.message,
        timestamp: new Date()
      })

      const history = serializeMessages(session.messages)

      const result = await runIntakeTurn(history)

      // Always save the assistant response, including the completion message.
      session.messages.push({
        role: 'assistant',
        content: result.assistantMessage,
        timestamp: new Date()
      })

      if (result.isComplete && result.summary) {
        const validatedSummary = validateClinicalSummary(
          result.summary
        )

        session.set('structuredData', validatedSummary)
        session.status = 'complete'

        await session.save()

        const response: ApiResponse<IntakeSessionState> = {
          ok: true,
          data: {
            status: 'complete',
            sessionId,
            messages: serializeMessages(session.messages),
            summary: validatedSummary
          },
          requestId
        }

        res.status(200).json(response)
        return
      }

      await session.save()

      const response: ApiResponse<IntakeSessionState> = {
        ok: true,
        data: {
          status: 'active',
          sessionId,
          messages: serializeMessages(session.messages)
        },
        requestId
      }

      res.status(200).json(response)
    } catch (error) {
      if (error instanceof LLMOutputError) {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'The model returned malformed output',
          code: 'LLM_OUTPUT_INVALID',
          retryable: true,
          requestId
        }

        res.status(502).json(response)
        return
      }

      next(error)
    }
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intake/:sessionId
// Returns the current state for refreshing or resuming the page.
// ─────────────────────────────────────────────────────────────────────────────

intakeRouter.get(
  '/:sessionId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = uuidv4()
    const sessionId = req.params.sessionId

    if (
      typeof sessionId !== 'string' ||
      sessionId.trim().length === 0
    ) {
      const response: ApiResponse<never> = {
        ok: false,
        error: 'Invalid session ID',
        code: 'VALIDATION_FAILED',
        retryable: false,
        requestId
      }

      res.status(400).json(response)
      return
    }

    try {
      const session = await IntakeSession.findOne({ sessionId })

      if (!session) {
        const response: ApiResponse<never> = {
          ok: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
          retryable: false,
          requestId
        }

        res.status(404).json(response)
        return
      }

      const messages = serializeMessages(session.messages)

      let state: IntakeSessionState

      if (session.status === 'complete') {
        if (!session.structuredData) {
          throw new Error(
            'Completed intake session has no structured summary'
          )
        }

        const summary = validateClinicalSummary(
          session.structuredData
        )

        state = {
          status: 'complete',
          sessionId,
          messages,
          summary
        }
      } else if (session.status === 'error') {
        state = {
          status: 'error',
          sessionId,
          code: 'SESSION_ERROR',
          retryable: true
        }
      } else {
        state = {
          status: 'active',
          sessionId,
          messages
        }
      }

      const response: ApiResponse<IntakeSessionState> = {
        ok: true,
        data: state,
        requestId
      }

      res.status(200).json(response)
    } catch (error) {
      next(error)
    }
  }
)