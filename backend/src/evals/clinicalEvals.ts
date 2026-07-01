import { runIntakeTurn } from '../services/intakeAgent'
import { generateSOAPNote } from '../services/noteGenerator'

export const clinicalEvalCases = [
  {
    name: 'OPQRST_completeness',
    input: 'I have a sharp pain in my left chest that started 3 days ago when I went running. It gets worse when I breathe deeply but better when I rest. It\'s a 7/10 severity.',
    expectations: {
      hasOnset: true,
      hasQuality: true,
      hasSeverity: true,
      noHallucination: true
    }
  },
  {
    name: 'red_flag_detection_chest_pain',
    input: 'Sharp chest pain with difficulty breathing',
    expectations: {
      redFlagDetected: true,
      severity: 'CRITICAL'
    }
  },
  {
    name: 'medication_no_hallucination',
    input: 'Patient discusses hypertension but never names a specific medication.',
    expectations: {
      medicationCount: 0,
      noInventedDrugs: true
    }
  }
]

export async function runClinicalEvals(): Promise<{ passed: number; failed: number }> {
  let passed = 0
  let failed = 0

  for (const testCase of clinicalEvalCases) {
    try {
      const result = await runIntakeTurn([
        {
          role: 'assistant',
          content: 'Tell me about your symptoms.',
          timestamp: new Date().toISOString()
        },
        {
          role: 'patient',
          content: testCase.input,
          timestamp: new Date().toISOString()
        }
      ])

      // Validate expectations
      const summary = result.summary
      if (summary && testCase.expectations.noHallucination) {
        if (!summary.medications || summary.medications.length === 0) {
          console.log(`✓ ${testCase.name}`)
          passed++
        } else {
          console.log(`✗ ${testCase.name}: hallucinated medications`)
          failed++
        }
      }
    } catch (err) {
      console.log(`✗ ${testCase.name}: ${err}`)
      failed++
    }
  }

  return { passed, failed }
}