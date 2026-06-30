import OpenAI from 'openai'

const apiKey = process.env.OPENROUTER_API_KEY

if (!apiKey) {
  throw new Error(
    'OPENROUTER_API_KEY is missing. Add it to backend/.env.'
  )
}

export const openrouter = new OpenAI({
  apiKey,
  baseURL: 'https://openrouter.ai/api/v1'
})