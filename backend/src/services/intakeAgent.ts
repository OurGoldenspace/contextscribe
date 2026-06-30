import Anthropic from '@anthropic-ai/sdk'
import type { Message, ClinicalSummary } from '../types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// Structured per the four-section production pattern: role, constraints,
// output format, failure behaviour. This is the same shape used in the
// FirstHx-pattern prep — role boundary, hard constraints, exact schema,
// explicit "never guess" instruction.
// ─────────────────────────────────────────────────────────────────────────
const INTAKE_SYSTEM_PROMPT = `
ROLE:
You are a clinical intake assistant for a primary care clinic. Your job is
to collect a structured patient history before their appointment, covering
general primary care presentations (not a specialty clinic). You are NOT a
clinician. You do NOT assess, diagnose, recommend treatment, or offer
medical advice of any kind.

CONSTRAINTS:
- Ask only one question at a time.
- Adapt your follow-up questions based on what the patient has already said
  (e.g. if they mention chest pain, ask about onset, radiation, severity,
  and relieving/aggravating factors before moving to other topics).
- Never suggest a diagnosis or treatment, even if asked directly. If asked,
  politely redirect: "I'm not able to assess that — your clinician will
  discuss it with you at your appointment."
- Never invent information the patient did not provide.
- If you are uncertain whether a symptom or detail was actually stated by
  the patient, do not include it as confirmed — note it as uncertain.
- If the patient's response is ambiguous, ask a clarifying question rather
  than guessing.
- If the patient discloses something suggesting an emergency (e.g. severe
  chest pain with radiation, difficulty breathing, signs of stroke,
  suicidal ideation), you MUST call the flag_safety_concern tool
  immediately with severity "URGENT", and you should gently advise the
  patient that this may need urgent attention before their scheduled visit.
  Continue the intake after flagging unless the concern makes continuing
  inappropriate.
- Aim to complete intake in 8-14 exchanges. Do not pad the conversation.

OUTPUT FORMAT (only once intake is complete):
When you have gathered sufficient information (chief complaint, history of
present illness, current medications, allergies, and relevant past medical
history), respond with the exact marker <INTAKE_COMPLETE> on its own line,
followed by ONLY a valid JSON object matching this schema and nothing else:

{
  "chiefComplaint": "string — concise, in the patient's own words where possible",
  "hpi": "string — history of present illness, synthesized from the conversation",
  "medications": [{ "name": "string", "dose": "string", "frequency": "string" }],
  "allergies": [{ "substance": "string", "reaction": "string", "severity": "LOW|MEDIUM|HIGH|UNKNOWN" }],
  "pmhx": ["string array of relevant past medical history items"],
  "redFlags": ["string array — any urgent/concerning symptoms mentioned"],
  "confidence": { "medications": "HIGH|MEDIUM|LOW", "allergies": "HIGH|MEDIUM|LOW" },
  "uncertain": ["optional — field names you were not confident about"]
}

FAILURE BEHAVIOUR:
- If a field cannot be determined with confidence, leave the array empty or
  the string minimal, and list the field name in "uncertain". Never guess.
- Uncertain data is better than fabricated data.
`.trim()

// ─────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// One tool: flag_safety_concern. This keeps the agentic loop simple and
// demonstrable — the point is showing the mechanism, not building a large
// tool surface.
// ─────────────────────────────────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  {
    name: 'flag_safety_concern',
    description:
      'Flag a patient statement as a potential safety concern requiring ' +
      'attention before or independent of the scheduled appointment. Call ' +
      'this immediately when the patient discloses something suggesting an ' +
      'emergency or urgent risk.',
    input_schema: {
      type: 'object',
      properties: {
        concern: { type: 'string', description: 'Brief description of the concern' },
        severity: { type: 'string', enum: ['URGENT', 'HIGH', 'MEDIUM'] }
      },
      required: ['concern', 'severity']
    }
  }
]

export interface SafetyFlag {
  concern: string
  severity: 'URGENT' | 'HIGH' | 'MEDIUM'
}

interface AgentTurnResult {
  assistantMessage: string
  isComplete: boolean
  summary: ClinicalSummary | null
  safetyFlags: SafetyFlag[]
}

function executeTool(name: string, input: Record<string, unknown>): { result: string; flag?: SafetyFlag } {
  if (name === 'flag_safety_concern') {
    const flag: SafetyFlag = {
      concern: String(input.concern ?? 'unspecified'),
      severity: (input.severity as SafetyFlag['severity']) ?? 'MEDIUM'
    }
    // In a real system this would page a clinician or trigger an alert.
    // Here, executing the tool just acknowledges it back to the model so
    // the conversation can continue, and we surface the flag to the caller.
    return { result: 'Safety concern logged and will be reviewed by clinical staff.', flag }
  }
  return { result: 'Unknown tool' }
}

/**
 * Runs one full agentic turn: sends the conversation history to Claude,
 * executes any tool calls in a loop until the model stops using tools,
 * and parses a structured summary if intake is complete.
 */
export async function runIntakeTurn(history: Message[]): Promise<AgentTurnResult> {
  const safetyFlags: SafetyFlag[] = []

  let messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === 'patient' ? 'user' : 'assistant',
    content: m.content
  }))

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: INTAKE_SYSTEM_PROMPT,
    tools,
    messages
  })

  // Agentic loop — keep executing tool calls until the model produces a
  // final text response with no further tool use.
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      const { result, flag } = executeTool(block.name, block.input as Record<string, unknown>)
      if (flag) safetyFlags.push(flag)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result
      })
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    ]

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: INTAKE_SYSTEM_PROMPT,
      tools,
      messages
    })
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const rawText = textBlock?.text ?? ''

  if (rawText.includes('<INTAKE_COMPLETE>')) {
    const jsonPart = rawText.split('<INTAKE_COMPLETE>')[1]?.trim() ?? ''
    try {
      const clean = jsonPart.replace(/```json\n?|\n?```/g, '').trim()
      const summary = JSON.parse(clean) as ClinicalSummary
      return { assistantMessage: rawText, isComplete: true, summary, safetyFlags }
    } catch {
      // Model claimed completion but didn't produce valid JSON — treat as
      // not complete rather than crashing. The caller decides how to
      // surface this (in this demo: returned as an error state upstream).
      return { assistantMessage: rawText, isComplete: false, summary: null, safetyFlags }
    }
  }

  return { assistantMessage: rawText, isComplete: false, summary: null, safetyFlags }
}
