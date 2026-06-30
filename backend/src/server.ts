import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from './db'
import { intakeRouter } from './routes/intake'
import { noteRouter } from './routes/note'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 4000

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// ─────────────────────────────────────────────────────────────────────────
// Health checks — liveness vs readiness, the distinction covered in prep.
// Liveness: is the process alive at all? Readiness: is it actually able to
// serve a real request (DB reachable, Anthropic API reachable)?
// ─────────────────────────────────────────────────────────────────────────
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

app.get('/health/ready', async (_req: Request, res: Response) => {
  const dbReady = mongoose.connection.readyState === 1
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY)

  const healthy = dbReady && hasApiKey
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    checks: { mongodb: dbReady, anthropicConfigured: hasApiKey }
  })
})

app.use('/api/intake', intakeRouter)
app.use('/api/note', noteRouter)

// Global error handler — never leak stack traces to the client.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled error]', { path: req.path, method: req.method, err })
  res.status(500).json({
    ok: false,
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    retryable: false
  })
})

let server: ReturnType<typeof app.listen>

async function start(): Promise<void> {
  await connectDB()
  server = app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`)
  })
}

// Graceful shutdown — same pattern discussed in prep: stop accepting new
// connections, let in-flight requests finish, close DB connection cleanly.
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — shutting down gracefully`)
  server?.close(async () => {
    await mongoose.connection.close()
    console.log('[server] shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start().catch((err) => {
  console.error('[server] failed to start', err)
  process.exit(1)
})
