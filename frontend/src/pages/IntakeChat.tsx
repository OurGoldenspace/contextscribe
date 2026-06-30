import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Message {
  role: 'assistant' | 'patient'
  content: string
  timestamp?: string
}

interface IntakeSummary {
  chiefComplaint: string
  hpi: string
  medications: Array<{ name: string; dose: string; frequency: string }>
  allergies: Array<{ substance: string; reaction: string; severity: string }>
  pmhx: string[]
  redFlags: string[]
}

export default function IntakeChat() {
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<IntakeSummary | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const startIntake = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/intake/start', { method: 'POST' })
      const data = await res.json()
      
      if (data.ok) {
        setSessionId(data.data.sessionId)
        setMessages([
          {
            role: 'assistant',
            content: data.data.messages[0].content,
            timestamp: new Date().toISOString()
          }
        ])
      }
    } catch (err) {
      console.error('Failed to start intake:', err)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userInput.trim() || !sessionId) return

    const newMessages: Message[] = [
      ...messages,
      { role: 'patient', content: userInput, timestamp: new Date().toISOString() }
    ]
    setMessages(newMessages)
    setUserInput('')
    setLoading(true)

    try {
      const res = await fetch(`/api/intake/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput })
      })
      const data = await res.json()

      if (data.ok) {
        if (data.data.status === 'complete') {
          setIsComplete(true)
          setSummary(data.data.summary)
        } else {
          setMessages([
            ...newMessages,
            {
              role: 'assistant',
              content: data.data.messages[data.data.messages.length - 1].content,
              timestamp: new Date().toISOString()
            }
          ])
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setLoading(false)
    }
  }

  // Not started yet
  if (!sessionId) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '1rem' }}>ContextScribe Intake</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
          Pre-visit structured history collection. Patient answers clinically relevant questions before the appointment, giving the clinician complete context and eliminating hallucinations.
        </p>
        <button
          onClick={startIntake}
          disabled={loading}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--text-accent, #378ADD)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          {loading ? 'Starting...' : 'Start Intake'}
        </button>
      </div>
    )
  }

  // Intake in progress
  if (!isComplete) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '0.5rem' }}>Pre-Visit History</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Session {sessionId.slice(0, 8)}...</p>
        </div>

        {/* Chat history */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'var(--surface-2)'
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: msg.role === 'patient' ? 'flex-end' : 'flex-start'
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: msg.role === 'patient' ? 'var(--text-accent, #378ADD)' : 'var(--surface-1)',
                  color: msg.role === 'patient' ? 'white' : 'var(--text-primary)',
                  lineHeight: '1.5'
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Listening...
            </div>
          )}
        </div>

        {/* Input form */}
        <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Your response..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '16px',
              fontFamily: 'inherit'
            }}
          />
          <button
            type="submit"
            disabled={loading || !userInput.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--text-accent, #378ADD)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: loading || !userInput.trim() ? 0.5 : 1
            }}
          >
            Send
          </button>
        </form>
      </div>
    )
  }

  // Intake complete — show summary + option to generate SOAP
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '0.5rem', color: 'var(--text-accent, #378ADD)' }}>
          ✓ Intake Complete
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Pre-visit context collected. Ready for clinician review.
        </p>
      </div>

      {summary && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '1rem' }}>Structured Summary</h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Chief Complaint
            </label>
            <p style={{ fontSize: '16px' }}>{summary.chiefComplaint}</p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              History of Present Illness
            </label>
            <p style={{ fontSize: '14px', lineHeight: '1.6' }}>{summary.hpi}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Medications
              </label>
              {summary.medications.length > 0 ? (
                <ul style={{ fontSize: '14px', marginLeft: '1.5rem' }}>
                  {summary.medications.map((m, i) => (
                    <li key={i}>
                      {m.name} {m.dose} {m.frequency}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>None reported</p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Allergies
              </label>
              {summary.allergies.length > 0 ? (
                <ul style={{ fontSize: '14px', marginLeft: '1.5rem' }}>
                  {summary.allergies.map((a, i) => (
                    <li key={i}>
                      {a.substance} ({a.reaction}) — {a.severity}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>NKDA</p>
              )}
            </div>
          </div>

          {summary.pmhx.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Past Medical History
              </label>
              <p style={{ fontSize: '14px' }}>{summary.pmhx.join(', ')}</p>
            </div>
          )}

          {summary.redFlags.length > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#FCEBEB', borderRadius: '8px', borderLeft: '4px solid #E24B4A' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#A32D2D', marginBottom: '0.5rem', fontWeight: 500 }}>
                ⚠ Red Flags Detected
              </label>
              <p style={{ fontSize: '14px', color: '#791F1F' }}>{summary.redFlags.join(', ')}</p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => navigate('/soap', { state: { sessionId, summary } })}
          style={{
            flex: 1,
            padding: '12px 24px',
            backgroundColor: 'var(--text-accent, #378ADD)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Generate SOAP Note
        </button>
        <button
          onClick={() => {
            setSessionId('')
            setMessages([])
            setSummary(null)
            setIsComplete(false)
          }}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Start New Intake
        </button>
      </div>
    </div>
  )
}
