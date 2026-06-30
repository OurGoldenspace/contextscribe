import { Schema, model, Document } from 'mongoose'

// Mirrors the design discussed in prep: embedded messages (bounded, always
// read together), structured summary as a nested document (queryable
// without parsing), and a TTL field for retention enforcement — included
// here for architectural completeness even though this demo doesn't run
// long enough to need it.

const MessageSchema = new Schema(
  {
    role: { type: String, enum: ['patient', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 5000 },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
)

const MedicationSchema = new Schema(
  {
    name: { type: String, required: true },
    dose: { type: String, default: '' },
    frequency: { type: String, default: '' }
  },
  { _id: false }
)

const AllergySchema = new Schema(
  {
    substance: { type: String, required: true },
    reaction: { type: String, default: '' },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'],
      default: 'UNKNOWN'
    }
  },
  { _id: false }
)

const IntakeSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },

    messages: [MessageSchema],

    structuredData: {
      chiefComplaint: String,
      hpi: String,
      medications: [MedicationSchema],
      allergies: [AllergySchema],
      pmhx: [String],
      redFlags: [String],
      confidence: {
        medications: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
        allergies: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] }
      },
      uncertain: [String]
    },

    status: {
      type: String,
      enum: ['active', 'complete', 'error'],
      default: 'active',
      index: true
    },

    // Retention enforcement pattern — not functionally exercised in this
    // demo (no real PHI, sessions aren't actually purged), but included
    // because it's the correct production design and worth being able to
    // point to and explain.
    deletionScheduledAt: { type: Date, index: { expireAfterSeconds: 0 } },

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

export interface IIntakeSession extends Document {
  sessionId: string
  messages: Array<{ role: 'patient' | 'assistant'; content: string; timestamp: Date }>
  structuredData?: {
    chiefComplaint?: string
    hpi?: string
    medications?: Array<{ name: string; dose: string; frequency: string }>
    allergies?: Array<{ substance: string; reaction: string; severity: string }>
    pmhx?: string[]
    redFlags?: string[]
    confidence?: { medications?: string; allergies?: string }
    uncertain?: string[]
  }
  status: 'active' | 'complete' | 'error'
  createdAt: Date
}

export const IntakeSession = model<IIntakeSession>('IntakeSession', IntakeSessionSchema)
