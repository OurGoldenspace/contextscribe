import { v4 as uuidv4 } from 'uuid'
import { IntakeSession } from '../models/IntakeSession'
import { runIntakeTurn } from './intakeAgent'
import { validateClinicalSummary } from './validation'
import { NotFoundError, DatabaseError } from '../utils/errors'
import { logger } from '../utils/logger'

export class IntakeService {
  async startSession(): Promise<{ sessionId: string; firstQuestion: string }> {
    const sessionId = uuidv4()

    try {
      const result = await runIntakeTurn([])

      await IntakeSession.create({
        sessionId,
        messages: [
          {
            role: 'assistant',
            content: result.assistantMessage,
            timestamp: new Date()
          }
        ],
        status: 'active'
      })

      logger.info('Intake session started', { sessionId })

      return {
        sessionId,
        firstQuestion: result.assistantMessage
      }
    } catch (err) {
      logger.error('Failed to start intake session', err instanceof Error ? err : undefined)
      throw new DatabaseError('Failed to start intake session')
    }
  }

  async processMessage(
    sessionId: string,
    userMessage: string
  ): Promise<{
    sessionId: string
    nextQuestion?: string
    isComplete: boolean
    summary?: any
  }> {
    try {
      const session = await IntakeSession.findOne({ sessionId })

      if (!session) {
        throw new NotFoundError(`Session ${sessionId} not found`)
      }

      if (session.status !== 'active') {
        throw new Error('Session is not active')
      }

      // Add patient message
      session.messages.push({
        role: 'patient',
        content: userMessage,
        timestamp: new Date()
      })

      // Get next question or completion
      const result = await runIntakeTurn(
        session.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }))
      )

      // Add assistant response
      session.messages.push({
        role: 'assistant',
        content: result.assistantMessage,
        timestamp: new Date()
      })

      // Check completion
      if (result.isComplete && result.summary) {
        const validatedSummary = validateClinicalSummary(result.summary)
        session.set('structuredData', validatedSummary)
        session.status = 'complete'

        logger.info('Intake completed', { sessionId, fields: Object.keys(validatedSummary) })

        await session.save()

        return {
          sessionId,
          isComplete: true,
          summary: validatedSummary
        }
      }

      await session.save()

      logger.debug('Message processed', { sessionId, messageCount: session.messages.length })

      return {
        sessionId,
        nextQuestion: result.assistantMessage,
        isComplete: false
      }
    } catch (err) {
      logger.error('Failed to process message', err instanceof Error ? err : undefined, {
        sessionId
      })
      throw err
    }
  }

  async getSession(sessionId: string) {
    try {
      const session = await IntakeSession.findOne({ sessionId })

      if (!session) {
        throw new NotFoundError(`Session ${sessionId} not found`)
      }

      return session
    } catch (err) {
      logger.error('Failed to fetch session', err instanceof Error ? err : undefined)
      throw err
    }
  }
}

export const intakeService = new IntakeService()