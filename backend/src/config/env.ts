import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().url('Invalid MongoDB URI'),
  OPENROUTER_API_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
})

export type Env = z.infer<typeof EnvSchema>

let config: Env | null = null

export function loadConfig(): Env {
  if (config) return config

  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    const errors = parsed.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${errors}`)
  }

  config = parsed.data
  return config
}

export function getConfig(): Env {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.')
  return config
}