import mongoose from 'mongoose'

const soapNoteSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    note: {
      subjective: {
        chiefComplaint: String,
        hpi: String,
        medications: String,
        allergies: String,
        pmhx: String
      },
      objective: {
        vitals: String,
        exam: String,
        investigations: String
      },
      assessment: String,
      plan: String
    }
  },
  { timestamps: true }
)

export const SOAPNote = mongoose.model('SOAPNote', soapNoteSchema)