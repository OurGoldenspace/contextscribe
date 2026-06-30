import 'dotenv/config'
import { runComparison } from './backend/src/services/noteGenerator'

// ─────────────────────────────────────────────────────────────────────────
// Run with: npm run demo:comparison
//
// This is your interview artifact. It runs the SAME visit transcript
// through the SAME model with the SAME prompt shape, with the only
// variable being presence vs. absence of upstream structured intake
// context — and prints a readable side-by-side so you can describe (or
// screenshot) exactly what changes.
//
// The transcript here is deliberately adversarial in the same style as
// the eval suite's hardest case: hypertension is discussed and a decision
// to "start a medication" is made, but no specific drug is ever named by
// either party. A model with no grounding context is statistically
// inclined to fill that gap with a plausible-sounding drug name. A model
// grounded in structured intake data — which in this scenario correctly
// has NO prior antihypertensive on file, because this is explicitly a new
// diagnosis — has no information to hallucinate from and should leave the
// medication unspecified rather than invent one.
// ─────────────────────────────────────────────────────────────────────────

const transcript = `
Doctor: Your blood pressure today is 162 over 98, which is higher than I'd like to see.
Patient: It's been creeping up the last few months according to my home monitor.
Doctor: Are you taking anything for it currently?
Patient: No, this would be the first time starting something for blood pressure.
Doctor: Okay. Given how consistently elevated this has been, I think it's time we start treatment.
Patient: Whatever you think is best, doctor. I trust your judgment.
Doctor: I'll send a prescription to your pharmacy today and I want to see you back in four weeks to check how you're tolerating it and recheck your numbers.
Patient: Sounds good, thank you.
`.trim()

const intakeContext = {
  chiefComplaint: 'Elevated home blood pressure readings',
  hpi:
    'Patient reports home blood pressure readings consistently elevated over the past several months, ' +
    'no prior treatment for hypertension. Asymptomatic — denies chest pain, headache, visual changes.',
  medications: [], // explicitly none — this patient has never been on antihypertensive therapy
  allergies: [],
  pmhx: [],
  redFlags: [],
  confidence: { medications: 'HIGH' as const, allergies: 'HIGH' as const }
}

async function main(): Promise<void> {
  console.log('\n=== ContextScribe: Upstream Context Comparison ===\n')
  console.log('Running identical transcript through identical model, only variable')
  console.log('changed: presence vs. absence of structured intake context.\n')
  console.log('─'.repeat(72))
  console.log('TRANSCRIPT (same for both runs):')
  console.log('─'.repeat(72))
  console.log(transcript)
  console.log()

  const { withContext, withoutContext } = await runComparison(transcript, intakeContext)

  console.log('═'.repeat(72))
  console.log('WITH UPSTREAM INTAKE CONTEXT')
  console.log('═'.repeat(72))
  console.log(JSON.stringify(withContext.note, null, 2))
  console.log(
    `\nCross-reference check: ${withContext.crossReferenceOk ? 'PASSED — every medication/allergy traces to source' : 'FAILED'}`
  )
  if (!withContext.crossReferenceOk) {
    console.log(`  Unverified medications: ${withContext.unverifiedMedications.join(', ')}`)
  }

  console.log('\n' + '═'.repeat(72))
  console.log('WITHOUT UPSTREAM INTAKE CONTEXT')
  console.log('═'.repeat(72))
  console.log(JSON.stringify(withoutContext.note, null, 2))
  console.log(
    `\nCross-reference check: ${withoutContext.crossReferenceOk ? 'PASSED — every medication/allergy traces to source' : 'FAILED'}`
  )
  if (!withoutContext.crossReferenceOk) {
    console.log(`  Unverified medications: ${withoutContext.unverifiedMedications.join(', ')}`)
  }

  console.log('\n' + '─'.repeat(72))
  console.log('SUMMARY')
  console.log('─'.repeat(72))
  console.log(
    `With-context medications listed: [${withContext.note.subjective.medications.join(', ') || 'none'}]`
  )
  console.log(
    `Without-context medications listed: [${withoutContext.note.subjective.medications.join(', ') || 'none'}]`
  )
  console.log(
    '\nIf the without-context run lists a specific drug name, that is a hallucination —' +
      '\nno drug was ever named in the transcript. This is the failure mode FirstHx\'s' +
      '\nupstream-context architecture is specifically designed to eliminate.\n'
  )
}

main().catch((err) => {
  console.error('Comparison script failed:', err)
  process.exit(1)
})