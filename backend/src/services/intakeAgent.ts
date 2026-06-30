import OpenAI from 'openai'
import { openrouter } from '../config/openrouter'
import type { Message, ClinicalSummary } from '../types'




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
- Ask only one question at a time.
- Adapt follow-ups based on what the patient said.
- COMPLETION: Mark intake complete once you have gathered:
  1. Chief complaint (what brings them in)
  2. Duration/onset of the problem
  3. Current medications (even if none)
  4. Known allergies (even if none)
  5. Any relevant past medical history
  Do NOT pad with extra questions once you have this core data.

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

COMPLETION RULE:
- As soon as chief complaint, HPI, medications, allergies, and relevant
  past medical history have all been collected, immediately complete the
  intake.
- Do not ask the patient to confirm your summary.
- Do not ask a generic final question.
- Return <INTAKE_COMPLETE> followed by the JSON object.

SAFETY TOOL RULE:
- When an urgent concern is present, calling flag_safety_concern is
  mandatory.
- Do not merely warn the patient in text.
- Call the tool before asking the next question.
- After the tool result is returned, provide a brief urgent-care message
  and continue only when appropriate.


`.trim()

// ─────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// One tool: flag_safety_concern. This keeps the agentic loop simple and
// demonstrable — the point is showing the mechanism, not building a large
// tool surface.
// ─────────────────────────────────────────────────────────────────────────
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'flag_safety_concern',
      description:
        'Flag a patient statement as a potential safety concern requiring ' +
        'attention before or independent of the scheduled appointment. Call ' +
        'this immediately when the patient discloses something suggesting an ' +
        'emergency or urgent risk.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          concern: {
            type: 'string',
            description: 'Brief description of the concern'
          },
          severity: {
            type: 'string',
            enum: ['URGENT', 'HIGH', 'MEDIUM']
          }
        },
        required: ['concern', 'severity']
      }
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

  let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
  history.map((m) => ({
    role: m.role === 'patient' ? 'user' : 'assistant',
    content: m.content
  }))

  let response = await openrouter.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    max_tokens: 1024,
    temperature: 0,
    tools,
    messages: [
      {
        role: 'system',
        content: INTAKE_SYSTEM_PROMPT
      },
      ...messages
    ]
  })

  // Agentic loop — keep executing tool calls until the model produces a
  // final text response with no further tool use.
  while (response.choices[0]?.message?.tool_calls?.length) {
    const assistantMessage = response.choices[0].message
    const toolCalls = assistantMessage.tool_calls ?? []
  
    messages.push({
      role: 'assistant',
      content: assistantMessage.content,
      tool_calls: toolCalls
    })
  
    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') {
        continue
      }
  
      let input: Record<string, unknown> = {}
  
      try {
        input = JSON.parse(toolCall.function.arguments) as Record<
          string,
          unknown
        >
      } catch {
        input = {}
      }
  
      const { result, flag } = executeTool(
        toolCall.function.name,
        input
      )
  
      if (flag) {
        safetyFlags.push(flag)
      }
  
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result
      })
    }
  
    response = await openrouter.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0,
      tools,
      messages: [
        {
          role: 'system',
          content: INTAKE_SYSTEM_PROMPT
        },
        ...messages
      ]
    })
  }

  const rawText =
  response.choices[0]?.message?.content ?? ''

  console.log('Model response:', rawText.substring(0, 200))  // ← ADD THIS
  
  if (rawText.includes('<INTAKE_COMPLETE>')) {
    console.log('Intake marked complete!')  // ← AND THIS
    const jsonPart = rawText.split('<INTAKE_COMPLETE>')[1]?.trim() ?? ''
    console.log('JSON part:', jsonPart)  // ← AND THIS
    try {
      const clean = jsonPart.replace(/```json\n?|\n?```/g, '').trim()
      const summary = JSON.parse(clean) as ClinicalSummary
      return { assistantMessage: rawText, isComplete: true, summary, safetyFlags }
    } catch (e) {
      console.error('JSON parse failed:', e)  // ← AND THIS
      return { assistantMessage: rawText, isComplete: false, summary: null, safetyFlags }
    }
  }

  return { assistantMessage: rawText, isComplete: false, summary: null, safetyFlags }
}
