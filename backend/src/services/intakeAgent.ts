import OpenAI from 'openai'

import { openrouter } from '../config/openrouter'
import type { ClinicalSummary, Message } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE_SYSTEM_PROMPT = `
ROLE:
You are a pre-visit clinical intake assistant for a primary care clinic.

Your purpose is to collect a structured patient history before the patient's
appointment. You are not a clinician and must not diagnose, assess, recommend
treatment, prescribe medication, or provide medical advice.

CONVERSATION RULES:
- Ask exactly one question at a time.
- Ask ONE question at a time
- If patient mentions a symptom, use OPQRST framework:
  O = Onset (when did it start?)
  P = Provocation/Palliation (what makes it better/worse?)
  Q = Quality (sharp? dull? aching?)
  R = Radiation (does it spread?)
  S = Severity (rate 1-10)
  T = Timing (constant or intermittent?)

EXAMPLE:
Patient: "I have chest pain"
Assistant: "When did this chest pain start?" (O = Onset)
Patient: "2 days ago"
Assistant: "Does anything make it better or worse?" (P = Provocation/Palliation)
Patient: "Worse when I walk upstairs"
Assistant: "How would you describe the pain - sharp, dull, pressure, aching?" (Q = Quality)
[Continue R, S, T...]

Once you have: CC, OPQRST details, meds, allergies, PMHx
→ Output <INTAKE_COMPLETE> followed by JSON summary
Adapt each question based on information the patient already provided.
- Do not repeat questions that have already been answered.
- Do not ask the patient to confirm a final summary.
- Do not ask generic closing questions such as:
  "Is there anything else?"
  "Do you have any questions?"
- Do not unnecessarily extend the interview.
- Aim to complete the intake in approximately 8 to 14 exchanges.
- Never invent information.
- When information is ambiguous, ask one focused clarifying question.
- When information was not clearly provided, mark it as uncertain instead of
  guessing.

INFORMATION TO COLLECT:
1. Chief complaint
2. History of present illness, including:
   - onset or duration
   - location when relevant
   - character or description when relevant
   - severity when relevant
   - aggravating or relieving factors when relevant
   - associated symptoms when relevant
3. Current medications, including whether the patient takes none
4. Allergies, including whether the patient has no known allergies
5. Relevant past medical history, including whether there is none

COMPLETION RULE:
As soon as all five required categories have been collected, complete the
intake immediately.

Do not ask another question after the required information is available.

MEDICAL BOUNDARY:
If the patient asks for a diagnosis, treatment, medical interpretation, or
SOAP note, respond briefly:

"I'm not able to assess or diagnose this. Your clinician will review the
information during your appointment."

Then continue the intake only if required information is still missing.

SAFETY RULE:
Use the flag_safety_concern tool only for a clearly urgent or potentially
dangerous symptom pattern.

Examples include:
- severe chest pain with shortness of breath, fainting, or sweating
- signs of stroke
- severe difficulty breathing
- uncontrolled bleeding
- loss of consciousness
- suicidal intent or immediate danger
- severe allergic reaction
- severe or rapidly worsening abdominal pain with high-risk features

Do not flag an ordinary symptom solely because it is described as sharp,
painful, or related to food.

Do not tell the patient repeatedly that a concern was flagged. Continue the
intake unless immediate escalation makes continuation inappropriate.

FINAL OUTPUT:
When intake is complete, respond with exactly this format:

<INTAKE_COMPLETE>
{
  "chiefComplaint": "string",
  "hpi": "string",
  "medications": [
    {
      "name": "string",
      "dose": "string",
      "frequency": "string"
    }
  ],
  "allergies": [
    {
      "substance": "string",
      "reaction": "string",
      "severity": "LOW"
    }
  ],
  "pmhx": ["string"],
  "redFlags": ["string"],
  "confidence": {
    "medications": "HIGH",
    "allergies": "HIGH"
  },
  "uncertain": []
}
</INTAKE_COMPLETE>

OUTPUT REQUIREMENTS:
- Do not use markdown code fences.
- Do not include text before <INTAKE_COMPLETE>.
- Do not include text after </INTAKE_COMPLETE>.
- Produce valid JSON.
- Use only these allergy severity values:
  LOW, MEDIUM, HIGH, UNKNOWN
- Use only these confidence values:
  HIGH, MEDIUM, LOW
- If there are no medications, use [].
- If there are no allergies, use [].
- If there is no relevant medical history, use [].
- If there are no red flags, use [].
- Never include placeholder values such as "...".
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'flag_safety_concern',
      description:
        'Record a clearly urgent or potentially dangerous patient safety concern for clinician review.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          concern: {
            type: 'string',
            description: 'A concise description of the safety concern.'
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

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SafetyFlag {
  concern: string
  severity: 'URGENT' | 'HIGH' | 'MEDIUM'
}

export interface AgentTurnResult {
  assistantMessage: string
  isComplete: boolean
  summary: ClinicalSummary | null
  safetyFlags: SafetyFlag[]
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

function executeTool(
  name: string,
  input: Record<string, unknown>
): {
  result: string
  flag?: SafetyFlag
} {
  if (name !== 'flag_safety_concern') {
    return {
      result: 'Unknown tool.'
    }
  }

  const rawSeverity = String(input.severity ?? 'MEDIUM')

  const severity: SafetyFlag['severity'] =
    rawSeverity === 'URGENT' ||
    rawSeverity === 'HIGH' ||
    rawSeverity === 'MEDIUM'
      ? rawSeverity
      : 'MEDIUM'

  const flag: SafetyFlag = {
    concern: String(input.concern ?? 'Unspecified safety concern'),
    severity
  }

  return {
    result:
      'The safety concern was recorded for clinical review. Continue collecting any remaining required intake information without repeating the warning.',
    flag
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY PARSING
// ─────────────────────────────────────────────────────────────────────────────

function extractCompletionJson(rawText: string): string | null {
  const match = rawText.match(
    /<INTAKE_COMPLETE>\s*([\s\S]*?)\s*<\/INTAKE_COMPLETE>/i
  )

  if (!match?.[1]) {
    return null
  }

  return match[1]
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function isConfidenceValue(
  value: unknown
): value is 'HIGH' | 'MEDIUM' | 'LOW' {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW'
}

function isAllergySeverity(
  value: unknown
): value is 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' {
  return (
    value === 'LOW' ||
    value === 'MEDIUM' ||
    value === 'HIGH' ||
    value === 'UNKNOWN'
  )
}

function normalizeClinicalSummary(value: unknown): ClinicalSummary {
  if (!value || typeof value !== 'object') {
    throw new Error('Summary is not an object')
  }

  const input = value as Record<string, unknown>

  const medications = Array.isArray(input.medications)
    ? input.medications.map((item) => {
        const medication =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {}

        return {
          name: String(medication.name ?? '').trim(),
          dose: String(medication.dose ?? '').trim(),
          frequency: String(medication.frequency ?? '').trim()
        }
      })
    : []

  const allergies = Array.isArray(input.allergies)
    ? input.allergies.map((item) => {
        const allergy =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {}

        const rawSeverity = allergy.severity

        return {
          substance: String(allergy.substance ?? '').trim(),
          reaction: String(allergy.reaction ?? '').trim(),
          severity: isAllergySeverity(rawSeverity)
            ? rawSeverity
            : 'UNKNOWN'
        }
      })
    : []

  const confidenceInput =
    input.confidence && typeof input.confidence === 'object'
      ? (input.confidence as Record<string, unknown>)
      : {}

  const medicationsConfidence = confidenceInput.medications
  const allergiesConfidence = confidenceInput.allergies

  const summary: ClinicalSummary = {
    chiefComplaint: String(input.chiefComplaint ?? '').trim(),
    hpi: String(input.hpi ?? '').trim(),
    medications,
    allergies,
    pmhx: Array.isArray(input.pmhx)
      ? input.pmhx.map((item) => String(item))
      : [],
    redFlags: Array.isArray(input.redFlags)
      ? input.redFlags.map((item) => String(item))
      : [],
    confidence: {
      medications: isConfidenceValue(medicationsConfidence)
        ? medicationsConfidence
        : 'LOW',
      allergies: isConfidenceValue(allergiesConfidence)
        ? allergiesConfidence
        : 'LOW'
    },
    uncertain: Array.isArray(input.uncertain)
      ? input.uncertain.map((item) => String(item))
      : []
  }

  if (!summary.chiefComplaint) {
    throw new Error('Summary is missing chiefComplaint')
  }

  if (!summary.hpi) {
    throw new Error('Summary is missing hpi')
  }

  return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL REQUEST
// ─────────────────────────────────────────────────────────────────────────────

async function createCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) {
  return openrouter.chat.completions.create({
    model: 'openai/gpt-4o',
    temperature: 0,
    max_tokens: 1400,
    tools,
    tool_choice: 'auto',
    messages: [
      {
        role: 'system',
        content: INTAKE_SYSTEM_PROMPT
      },
      ...messages
    ]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AGENT TURN
// ─────────────────────────────────────────────────────────────────────────────

export async function runIntakeTurn(
  history: Message[]
): Promise<AgentTurnResult> {
  const safetyFlags: SafetyFlag[] = []

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    history.map((message) => ({
      role: message.role === 'patient' ? 'user' : 'assistant',
      content: message.content
    }))

  let response = await createCompletion(messages)

  let loopCount = 0
  const maximumToolLoops = 5

  while (
    response.choices[0]?.message?.tool_calls?.length &&
    loopCount < maximumToolLoops
  ) {
    loopCount += 1

    const modelMessage = response.choices[0].message
    const toolCalls = modelMessage.tool_calls ?? []

    messages.push({
      role: 'assistant',
      content: modelMessage.content,
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
        console.warn('[intake-agent] Invalid tool arguments', {
          toolName: toolCall.function.name
        })
      }

      const toolResult = executeTool(
        toolCall.function.name,
        input
      )

      if (toolResult.flag) {
        safetyFlags.push(toolResult.flag)
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult.result
      })
    }

    response = await createCompletion(messages)
  }

  const rawText =
    response.choices[0]?.message?.content?.trim() ?? ''

  const completionJson = extractCompletionJson(rawText)

  if (!completionJson) {
    return {
      assistantMessage:
        rawText ||
        'Could you provide a little more information about your current concern?',
      isComplete: false,
      summary: null,
      safetyFlags
    }
  }

  try {
    const parsedValue: unknown = JSON.parse(completionJson)
    const summary = normalizeClinicalSummary(parsedValue)

    const combinedRedFlags = [
      ...summary.redFlags,
      ...safetyFlags.map(
        (flag) => `${flag.severity}: ${flag.concern}`
      )
    ]

    summary.redFlags = Array.from(new Set(combinedRedFlags))

    return {
      assistantMessage:
        'Thank you. Your intake is complete and ready for clinician review.',
      isComplete: true,
      summary,
      safetyFlags
    }
  } catch (error) {
    console.error('[intake-agent] Failed to parse completion summary', {
      error:
        error instanceof Error
          ? error.message
          : 'Unknown parsing error',
      rawText
    })

    return {
      assistantMessage:
        'I need one more moment to complete your intake. Could you briefly restate your main concern?',
      isComplete: false,
      summary: null,
      safetyFlags
    }
  }
}