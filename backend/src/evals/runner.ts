import 'dotenv/config'
import { generateSOAPNote } from '../services/noteGenerator'
import { runIntakeTurn } from '../services/intakeAgent'
import { noteEvalCases, intakeEvalCases } from './cases'
import type { SOAPNote, EvalAssertion, Message } from '../types'

// ─────────────────────────────────────────────────────────────────────────
// This is the eval harness referenced throughout the interview prep — the
// thing most candidates building a demo skip entirely. Run with:
//   npm run test:evals
// It calls the real Anthropic API for every case (no mocking — these are
// meant to catch actual model behaviour, not just code logic), so it costs
// a small amount of API credit and takes a minute or two to run.
// ─────────────────────────────────────────────────────────────────────────

function getFieldValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function assertionPasses(note: SOAPNote, assertion: EvalAssertion): boolean {
  const value = getFieldValue(note, assertion.field)

  if (assertion.contains !== undefined) {
    return typeof value === 'string' && value.toLowerCase().includes(assertion.contains.toLowerCase())
  }
  if (assertion.notContains !== undefined) {
    return typeof value === 'string' && !value.toLowerCase().includes(assertion.notContains.toLowerCase())
  }
  if (assertion.includes !== undefined) {
    return (
      Array.isArray(value) &&
      value.some((item) => typeof item === 'string' && item.toLowerCase().includes(assertion.includes!.toLowerCase()))
    )
  }
  if (assertion.maxLength !== undefined) {
    return Array.isArray(value) && value.length <= assertion.maxLength
  }
  if (assertion.equals !== undefined) {
    return value === assertion.equals
  }
  // No recognised condition on this assertion — treat as failed rather
  // than silently passing, so a malformed eval case is loud, not silent.
  return false
}

interface NoteEvalResult {
  id: string
  description: string
  passed: boolean
  blockersFailed: string[]
  warningsFailed: string[]
  crossReferenceOk: boolean
  unverifiedMedications: string[]
}

async function runNoteEvals(): Promise<NoteEvalResult[]> {
  const results: NoteEvalResult[] = []

  for (const testCase of noteEvalCases) {
    process.stdout.write(`  running: ${testCase.id} ... `)

    try {
      const result = await generateSOAPNote(testCase.transcript, testCase.intakeSummary)

      const blockersFailed: string[] = []
      const warningsFailed: string[] = []

      for (const assertion of testCase.assertions) {
        const passed = assertionPasses(result.note, assertion)
        if (!passed) {
          const label = `${assertion.field} (${JSON.stringify(assertion)})`
          if (assertion.severity === 'blocker') blockersFailed.push(label)
          else warningsFailed.push(label)
        }
      }

      // Cross-reference check is itself a blocker-level assertion baked
      // into every note eval case, not just the adversarial one — any
      // unverified medication is a hallucination regardless of which
      // case triggered it.
      if (!result.crossReferenceOk) {
        blockersFailed.push(
          `cross-reference: unverified medications [${result.unverifiedMedications.join(', ')}]`
        )
      }

      const passed = blockersFailed.length === 0
      results.push({
        id: testCase.id,
        description: testCase.description,
        passed,
        blockersFailed,
        warningsFailed,
        crossReferenceOk: result.crossReferenceOk,
        unverifiedMedications: result.unverifiedMedications
      })

      console.log(passed ? 'PASS' : 'FAIL')
    } catch (err) {
      console.log('ERROR')
      results.push({
        id: testCase.id,
        description: testCase.description,
        passed: false,
        blockersFailed: [`threw error: ${err instanceof Error ? err.message : String(err)}`],
        warningsFailed: [],
        crossReferenceOk: false,
        unverifiedMedications: []
      })
    }
  }

  return results
}

interface IntakeEvalResult {
  id: string
  description: string
  passed: boolean
  blockersFailed: string[]
}

async function runIntakeEvals(): Promise<IntakeEvalResult[]> {
  const results: IntakeEvalResult[] = []

  for (const testCase of intakeEvalCases) {
    process.stdout.write(`  running: ${testCase.id} ... `)

    try {
      let history: Message[] = []
      let finalSummary: Awaited<ReturnType<typeof runIntakeTurn>>['summary'] = null
      let anySafetyFlag = false

      // Kick off the conversation
      let turn = await runIntakeTurn(history)
      history.push({ role: 'assistant', content: turn.assistantMessage, timestamp: new Date().toISOString() })
      if (turn.safetyFlags.length > 0) anySafetyFlag = true

      // Feed each scripted patient response in sequence
      for (const response of testCase.patientResponses) {
        history.push({ role: 'patient', content: response, timestamp: new Date().toISOString() })
        turn = await runIntakeTurn(history)
        if (turn.safetyFlags.length > 0) anySafetyFlag = true

        if (turn.isComplete && turn.summary) {
          finalSummary = turn.summary
          break
        }
        history.push({ role: 'assistant', content: turn.assistantMessage, timestamp: new Date().toISOString() })
      }

      const blockersFailed: string[] = []

      for (const assertion of testCase.assertions) {
        if (assertion.expectSafetyFlag !== undefined) {
          if (anySafetyFlag !== assertion.expectSafetyFlag) {
            blockersFailed.push(`expected safetyFlagTriggered=${assertion.expectSafetyFlag}, got ${anySafetyFlag}`)
          }
          continue
        }

        const value = finalSummary ? getFieldValue(finalSummary, assertion.field) : undefined

        let passed = false
        if (assertion.contains !== undefined) {
          passed = typeof value === 'string' && value.toLowerCase().includes(assertion.contains.toLowerCase())
        } else if (assertion.includes !== undefined) {
          passed =
            Array.isArray(value) &&
            value.some((item) => typeof item === 'string' && item.toLowerCase().includes(assertion.includes!.toLowerCase()))
        }

        if (!passed) {
          blockersFailed.push(`${assertion.field}: ${JSON.stringify(assertion)} (got: ${JSON.stringify(value)})`)
        }
      }

      const passed = blockersFailed.length === 0
      results.push({ id: testCase.id, description: testCase.description, passed, blockersFailed })
      console.log(passed ? 'PASS' : 'FAIL')
    } catch (err) {
      console.log('ERROR')
      results.push({
        id: testCase.id,
        description: testCase.description,
        passed: false,
        blockersFailed: [`threw error: ${err instanceof Error ? err.message : String(err)}`]
      })
    }
  }

  return results
}

async function main(): Promise<void> {
  const thresholdArg = process.argv.find((a) => a.startsWith('--threshold'))
  const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1] ?? '0.8') : 0.8

  console.log('\n=== ContextScribe Eval Suite ===\n')

  console.log('SOAP note generation evals:')
  const noteResults = await runNoteEvals()

  console.log('\nIntake agent evals:')
  const intakeResults = await runIntakeEvals()

  const allResults = [...noteResults, ...intakeResults]
  const passCount = allResults.filter((r) => r.passed).length
  const passRate = passCount / allResults.length

  console.log('\n=== Results ===\n')
  for (const r of allResults) {
    console.log(`${r.passed ? '✓' : '✗'} ${r.id} — ${r.description}`)
    if (!r.passed) {
      for (const b of r.blockersFailed) console.log(`    BLOCKER: ${b}`)
    }
  }

  console.log(`\nPass rate: ${(passRate * 100).toFixed(1)}% (${passCount}/${allResults.length})`)
  console.log(`Threshold: ${(threshold * 100).toFixed(1)}%`)

  if (passRate < threshold) {
    console.log('\nFAILED — pass rate below threshold\n')
    process.exit(1)
  }

  console.log('\nPASSED\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Eval runner crashed:', err)
  process.exit(1)
})