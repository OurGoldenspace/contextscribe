import 'dotenv/config'

import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import mongoose from 'mongoose'

import { loadConfig } from './config/env'
import { connectDB } from './db'
import { intakeRouter } from './routes/intake'
import { noteRouter } from './routes/note'
import { soapRouter } from './routes/soap'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'

const app = express()

// Load configuration
const config = loadConfig()
const PORT = config.PORT

const allowedOrigins = [
  'http://localhost:5173',
  'https://contextscribe.vercel.app',
  config.FRONTEND_URL
].filter((origin): origin is string => Boolean(origin))

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
)

app.use(express.json({ limit: '1mb' }))

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    })
  })
  
  next()
})

// Liveness check: confirms that the Node process is running.
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true
  })
})

// Readiness check: confirms that required dependencies are available.
app.get('/health/ready', (_req: Request, res: Response) => {
  const dbReady = mongoose.connection.readyState === 1
  const openRouterConfigured = Boolean(
    process.env.OPENROUTER_API_KEY
  )

  const healthy = dbReady && openRouterConfigured

  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    checks: {
      mongodb: dbReady,
      openrouterConfigured: openRouterConfigured
    }
  })
})

// Application routes
app.use('/api/intake', intakeRouter)
app.use('/api/intake', soapRouter)
app.use('/api/note', noteRouter)

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
    retryable: false
  })
})

// Error handler (MUST be last)
app.use(errorHandler)

let server: ReturnType<typeof app.listen> | undefined

async function start(): Promise<void> {
  try {
    await connectDB()
    logger.info('Database connected')

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('Server listening', { port: PORT })
    })
  } catch (error) {
    logger.error('Failed to start server', error instanceof Error ? error : undefined)
    process.exit(1)
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`)

  const closeDatabase = async (): Promise<void> => {
    try {
      await mongoose.connection.close()
      logger.info('MongoDB connection closed')
    } catch (error) {
      logger.error('Failed to close MongoDB connection', error instanceof Error ? error : undefined)
    }
  }

  if (!server) {
    await closeDatabase()
    process.exit(0)
    return
  }

  server.close(async (error) => {
    if (error) {
      logger.error('Failed to close HTTP server', error instanceof Error ? error : undefined)
      await closeDatabase()
      process.exit(1)
      return
    }

    await closeDatabase()
    logger.info('Shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

start().catch((error) => {
  logger.error('Failed to start server', error instanceof Error ? error : undefined)
  process.exit(1)
})