import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { intakeRouter } from './routes/intake'
import { soapRouter } from './routes/soap'

const app = express()

app.use(express.json())

// CORS for localhost (change domain in production)
app.use(cors({
  origin: ['http://localhost:5173', process.env.FRONTEND_URL],
  credentials: true
}))

app.use('/api/intake', intakeRouter)
app.use('/api/intake', soapRouter)  // POST /api/intake/:sessionId/soap

app.listen(3000, () => {
  console.log('Backend running on :3000')
})