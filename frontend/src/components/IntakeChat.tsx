import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent
} from 'react'

type MessageRole = 'patient' | 'assistant'

interface Message {
  role: MessageRole
  content: string
  timestamp: string
}

interface Medication {
  name: string
  dose: string
  frequency: string
}

interface Allergy {
  substance: string
  reaction: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
}

interface ClinicalSummary {
  chiefComplaint: string
  hpi: string
  medications: Medication[]
  allergies: Allergy[]
  pmhx: string[]
  redFlags: string[]
  confidence: {
    medications: 'HIGH' | 'MEDIUM' | 'LOW'
    allergies: 'HIGH' | 'MEDIUM' | 'LOW'
  }
  uncertain: string[]
}

interface IntakeSessionState {
  status: 'active' | 'complete'
  sessionId: string
  messages: Message[]
  summary?: ClinicalSummary
}

interface SOAPNote {
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}

interface ApiSuccess<T> {
  ok: true
  data: T
  requestId?: string
}

interface ApiFailure {
  ok: false
  error: string
  code?: string
  retryable?: boolean
  requestId?: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

const API_BASE_URL = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE_URL
  : import.meta.env.VITE_API_BASE_URL ??
    'http://localhost:4000'

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL is not configured'
  )
}

async function parseApiResponse<T>(
  response: Response
): Promise<T> {
  const text = await response.text()

  if (!text.trim()) {
    throw new Error(
      `Backend returned an empty response (HTTP ${response.status})`
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `Backend returned invalid JSON (HTTP ${response.status}): ${text.slice(
        0,
        200
      )}`
    )
  }
}

function formatList(values: string[]): string {
  return values.length > 0
    ? values.join(', ')
    : 'None reported'
}

export default function IntakeChat() {
  const [sessionId, setSessionId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<
    'starting' | 'active' | 'complete' | 'error'
  >('starting')
  const [summary, setSummary] =
    useState<ClinicalSummary | null>(null)
  const [soapNote, setSoapNote] =
    useState<SOAPNote | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isGeneratingSOAP, setIsGeneratingSOAP] =
    useState(false)
  const [error, setError] = useState('')

  const messagesEndRef = useRef<HTMLDivElement | null>(
    null
  )
  const hasStartedRef = useRef(false)

  const intakeComplete = status === 'complete'

  useEffect(() => {
    if (hasStartedRef.current) {
      return
    }

    hasStartedRef.current = true
    void startIntake()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    })
  }, [messages])

  async function startIntake(): Promise<void> {
    setStatus('starting')
    setError('')
    setSummary(null)
    setSoapNote(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/intake/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )

      const body =
        await parseApiResponse<
          ApiResponse<IntakeSessionState>
        >(response)

      if (!response.ok || !body.ok) {
        throw new Error(
          body.ok
            ? 'Failed to start intake'
            : body.error
        )
      }

      setSessionId(body.data.sessionId)
      setMessages(body.data.messages)
      setStatus(body.data.status)
      setSummary(body.data.summary ?? null)
    } catch (requestError) {
      console.error(
        '[intake/start] failed',
        requestError
      )

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to start the intake'
      )

      setStatus('error')
    }
  }

  async function sendMessage(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault()

    const trimmedMessage = input.trim()

    if (
      !trimmedMessage ||
      !sessionId ||
      isSending ||
      intakeComplete
    ) {
      return
    }

    setInput('')
    setError('')
    setIsSending(true)

    const temporaryPatientMessage: Message = {
      role: 'patient',
      content: trimmedMessage,
      timestamp: new Date().toISOString()
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      temporaryPatientMessage
    ])

    try {
      const response = await fetch(
        `${API_BASE_URL}/intake/${sessionId}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: trimmedMessage
          })
        }
      )

      const body =
        await parseApiResponse<
          ApiResponse<IntakeSessionState>
        >(response)

      if (!response.ok || !body.ok) {
        throw new Error(
          body.ok
            ? 'Failed to send message'
            : body.error
        )
      }

      setMessages(body.data.messages)
      setStatus(body.data.status)
      setSummary(body.data.summary ?? null)

      if (body.data.status === 'complete') {
        setInput('')
      }
    } catch (requestError) {
      console.error(
        '[intake/message] failed',
        requestError
      )

      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message !== temporaryPatientMessage
        )
      )

      setInput(trimmedMessage)

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to send the message'
      )
    } finally {
      setIsSending(false)
    }
  }

  async function generateSOAPNote(): Promise<void> {
    if (
      !sessionId ||
      !summary ||
      isGeneratingSOAP
    ) {
      return
    }

    setError('')
    setIsGeneratingSOAP(true)

    try {
      const response = await fetch(
        `${API_BASE_URL}/intake/${sessionId}/soap`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary
          })
        }
      )

      const body = await parseApiResponse<
        ApiResponse<{
          note: SOAPNote
          warnings?: string[]
        }>
      >(response)

      if (!response.ok || !body.ok) {
        throw new Error(
          body.ok
            ? 'Failed to generate SOAP note'
            : body.error
        )
      }

      setSoapNote(body.data.note)
    } catch (requestError) {
      console.error(
        '[soap/generate] failed',
        requestError
      )

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to generate the SOAP note'
      )
    } finally {
      setIsGeneratingSOAP(false)
    }
  }

  function restartIntake(): void {
    hasStartedRef.current = true
    setSessionId('')
    setMessages([])
    setInput('')
    setSummary(null)
    setSoapNote(null)
    setError('')
    void startIntake()
  }

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>
              ContextScribe
            </p>

            <h1 style={styles.title}>
              Pre-visit intake
            </h1>

            <p style={styles.subtitle}>
              Answer one question at a time. Your
              responses will be organized for clinician
              review.
            </p>
          </div>

          <span
            style={{
              ...styles.statusBadge,
              background:
                intakeComplete
                  ? '#dcfce7'
                  : status === 'error'
                    ? '#fee2e2'
                    : '#dbeafe',
              color:
                intakeComplete
                  ? '#166534'
                  : status === 'error'
                    ? '#991b1b'
                    : '#1d4ed8'
            }}
          >
            {status === 'starting'
              ? 'Starting'
              : status === 'active'
                ? 'In progress'
                : status === 'complete'
                  ? 'Complete'
                  : 'Error'}
          </span>
        </header>

        <div style={styles.chatCard}>
          <div style={styles.messages}>
            {status === 'starting' &&
              messages.length === 0 && (
                <p style={styles.emptyText}>
                  Starting your intake…
                </p>
              )}

            {messages.map((message, index) => (
              <div
                key={`${message.timestamp}-${index}`}
                style={{
                  ...styles.messageRow,
                  justifyContent:
                    message.role === 'patient'
                      ? 'flex-end'
                      : 'flex-start'
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(message.role === 'patient'
                      ? styles.patientBubble
                      : styles.assistantBubble)
                  }}
                >
                  <strong style={styles.messageLabel}>
                    {message.role === 'patient'
                      ? 'You'
                      : 'Intake assistant'}
                  </strong>

                  <p style={styles.messageText}>
                    {message.content}
                  </p>
                </div>
              </div>
            ))}

            {isSending && (
              <div
                style={{
                  ...styles.messageRow,
                  justifyContent: 'flex-start'
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...styles.assistantBubble
                  }}
                >
                  <p style={styles.messageText}>
                    Thinking…
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={sendMessage}
            style={styles.form}
          >
            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey
                ) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={
                intakeComplete
                  ? 'Intake is complete'
                  : 'Type your answer…'
              }
              disabled={
                intakeComplete ||
                isSending ||
                status === 'starting' ||
                status === 'error'
              }
              rows={3}
              style={styles.textarea}
            />

            <button
              type="submit"
              disabled={
                !input.trim() ||
                isSending ||
                intakeComplete ||
                status !== 'active'
              }
              style={{
                ...styles.primaryButton,
                opacity:
                  !input.trim() ||
                  isSending ||
                  intakeComplete ||
                  status !== 'active'
                    ? 0.55
                    : 1
              }}
            >
              {isSending
                ? 'Sending…'
                : 'Send'}
            </button>
          </form>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <strong>
              Something went wrong.
            </strong>

            <p style={styles.errorText}>
              {error}
            </p>
          </div>
        )}

        {summary && (
          <section style={styles.summaryCard}>
            <div style={styles.sectionHeader}>
              <div>
                <p style={styles.eyebrow}>
                  Structured intake
                </p>

                <h2 style={styles.sectionTitle}>
                  Clinical summary
                </h2>
              </div>

              <button
                type="button"
                onClick={restartIntake}
                style={styles.secondaryButton}
              >
                Start new intake
              </button>
            </div>

            <div style={styles.summaryGrid}>
              <SummaryField
                label="Chief complaint"
                value={summary.chiefComplaint}
              />

              <SummaryField
                label="History of present illness"
                value={summary.hpi}
              />

              <SummaryField
                label="Medications"
                value={
                  summary.medications.length > 0
                    ? summary.medications
                        .map((medication) =>
                          [
                            medication.name,
                            medication.dose,
                            medication.frequency
                          ]
                            .filter(Boolean)
                            .join(' ')
                        )
                        .join(', ')
                    : 'None reported'
                }
              />

              <SummaryField
                label="Allergies"
                value={
                  summary.allergies.length > 0
                    ? summary.allergies
                        .map(
                          (allergy) =>
                            `${allergy.substance}: ${
                              allergy.reaction ||
                              'reaction not specified'
                            }`
                        )
                        .join(', ')
                    : 'No known allergies reported'
                }
              />

              <SummaryField
                label="Past medical history"
                value={formatList(summary.pmhx)}
              />

              <SummaryField
                label="Red flags"
                value={formatList(summary.redFlags)}
              />

              <SummaryField
                label="Uncertain fields"
                value={formatList(
                  summary.uncertain
                )}
              />
            </div>

            <button
              type="button"
              onClick={generateSOAPNote}
              disabled={isGeneratingSOAP}
              style={{
                ...styles.primaryButton,
                marginTop: '1.25rem',
                opacity: isGeneratingSOAP
                  ? 0.55
                  : 1
              }}
            >
              {isGeneratingSOAP
                ? 'Generating SOAP note…'
                : 'Generate SOAP note'}
            </button>
          </section>
        )}

        {soapNote && (
          <section style={styles.soapCard}>
            <p style={styles.eyebrow}>
              Clinician documentation
            </p>

            <h2 style={styles.sectionTitle}>
              Generated SOAP note
            </h2>

            <SOAPSection
              title="Subjective"
              value={soapNote.subjective}
            />

            <SOAPSection
              title="Objective"
              value={soapNote.objective}
            />

            <SOAPSection
              title="Assessment"
              value={soapNote.assessment}
            />

            <SOAPSection
              title="Plan"
              value={soapNote.plan}
            />
          </section>
        )}
      </section>
    </main>
  )
}

function SummaryField({
  label,
  value
}: {
  label: string
  value: string
}) {
  return (
    <div style={styles.summaryField}>
      <strong style={styles.summaryLabel}>
        {label}
      </strong>

      <p style={styles.summaryValue}>
        {value || 'Not provided'}
      </p>
    </div>
  )
}

function SOAPSection({
  title,
  value
}: {
  title: string
  value?: string
}) {
  return (
    <div style={styles.soapSection}>
      <h3 style={styles.soapTitle}>
        {title}
      </h3>

      <p style={styles.soapText}>
        {value || 'Not documented'}
      </p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '2rem 1rem',
    background: '#f8fafc'
  },

  container: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto'
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1.5rem'
  },

  eyebrow: {
    margin: '0 0 0.35rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#2563eb'
  },

  title: {
    margin: 0,
    fontSize: '2rem',
    color: '#0f172a'
  },

  subtitle: {
    margin: '0.5rem 0 0',
    maxWidth: '620px',
    color: '#64748b',
    lineHeight: 1.6
  },

  statusBadge: {
    borderRadius: '999px',
    padding: '0.45rem 0.8rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },

  chatCard: {
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
    boxShadow:
      '0 10px 30px rgba(15, 23, 42, 0.06)'
  },

  messages: {
    minHeight: '420px',
    maxHeight: '560px',
    overflowY: 'auto',
    padding: '1.25rem'
  },

  emptyText: {
    color: '#64748b',
    textAlign: 'center'
  },

  messageRow: {
    display: 'flex',
    marginBottom: '1rem'
  },

  messageBubble: {
    maxWidth: '75%',
    borderRadius: '14px',
    padding: '0.85rem 1rem'
  },

  patientBubble: {
    background: '#2563eb',
    color: '#ffffff',
    borderBottomRightRadius: '4px'
  },

  assistantBubble: {
    background: '#f1f5f9',
    color: '#0f172a',
    borderBottomLeftRadius: '4px'
  },

  messageLabel: {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.75rem',
    opacity: 0.8
  },

  messageText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.55
  },

  form: {
    display: 'flex',
    gap: '0.75rem',
    padding: '1rem',
    borderTop: '1px solid #e2e8f0',
    background: '#ffffff'
  },

  textarea: {
    flex: 1,
    resize: 'vertical',
    minHeight: '70px',
    padding: '0.8rem',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    outline: 'none'
  },

  primaryButton: {
    alignSelf: 'flex-end',
    border: 'none',
    borderRadius: '10px',
    padding: '0.8rem 1.1rem',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer'
  },

  secondaryButton: {
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    padding: '0.65rem 0.9rem',
    background: '#ffffff',
    color: '#334155',
    fontWeight: 600,
    cursor: 'pointer'
  },

  errorBox: {
    marginTop: '1rem',
    padding: '1rem',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    background: '#fef2f2',
    color: '#991b1b'
  },

  errorText: {
    margin: '0.35rem 0 0'
  },

  summaryCard: {
    marginTop: '1.5rem',
    padding: '1.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
    boxShadow:
      '0 10px 30px rgba(15, 23, 42, 0.05)'
  },

  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem'
  },

  sectionTitle: {
    margin: 0,
    color: '#0f172a'
  },

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginTop: '1.25rem'
  },

  summaryField: {
    padding: '1rem',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    background: '#f8fafc'
  },

  summaryLabel: {
    display: 'block',
    marginBottom: '0.4rem',
    color: '#334155'
  },

  summaryValue: {
    margin: 0,
    color: '#475569',
    lineHeight: 1.5
  },

  soapCard: {
    marginTop: '1.5rem',
    padding: '1.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff'
  },

  soapSection: {
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0'
  },

  soapTitle: {
    margin: '0 0 0.5rem',
    color: '#0f172a'
  },

  soapText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    color: '#475569',
    lineHeight: 1.6
  }
}