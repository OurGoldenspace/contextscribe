import mongoose from 'mongoose'

const soapNoteSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    note: {
      subjective: { chiefComplaint: String, hpi: String, medications: String, allergies: String, pmhx: String },
      objective: { vitals: String, exam: String, investigations: String },
      assessment: String,
      plan: String
    },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

export const SOAPNote = mongoose.model('SOAPNote', soapNoteSchema)