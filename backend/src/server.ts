import 'dotenv/config'

import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'
import cors from 'cors'
import mongoose from 'mongoose'

import { connectDB } from './db'
import { intakeRouter } from './routes/intake'
import { noteRouter } from './routes/note'
import { soapRouter } from './routes/soap'

const app = express()
const PORT = Number(process.env.PORT) || 4000

app.use(  
  cors({
    origin: 'http://localhost:5173',
    credentials: true
  })
)

app.use(express.json({ limit: '1mb' }))

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

// soapRouter defines POST /:sessionId/soap,
// so the complete route becomes:
// POST /api/intake/:sessionId/soap
app.use('/api/intake', soapRouter)

app.use('/api/note', noteRouter)

// Handle routes that do not exist.
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
    retryable: false
  })
})

// Global error handler.
// Keep this after all routes and middleware.
app.use(
  (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error('[unhandled error]', {
      path: req.path,
      method: req.method,
      error: err.message
    })

    res.status(500).json({
      ok: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      retryable: false
    })
  }
)

let server: ReturnType<typeof app.listen> | undefined

async function start(): Promise<void> {
  await connectDB()

  server = app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`)
  })
}

async function shutdown(signal: string): Promise<void> {
  console.log(
    `[server] ${signal} received — shutting down gracefully`
  )

  const closeDatabase = async (): Promise<void> => {
    try {
      await mongoose.connection.close()
      console.log('[db] MongoDB connection closed')
    } catch (error) {
      console.error('[db] failed to close MongoDB connection', error)
    }
  }

  if (!server) {
    await closeDatabase()
    process.exit(0)
    return
  }

  server.close(async (error) => {
    if (error) {
      console.error('[server] failed to close HTTP server', error)
      await closeDatabase()
      process.exit(1)
      return
    }

    await closeDatabase()
    console.log('[server] shutdown complete')
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
  console.error('[server] failed to start', error)
  process.exit(1)
})



