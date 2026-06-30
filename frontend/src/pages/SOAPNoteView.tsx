import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface SOAPNote {
  subjective: {
    chiefComplaint: string
    hpi: string
    medications: string
    allergies: string
    pmhx: string
  }
  objective: {
    vitals: string
    exam: string
    investigations: string
  }
  assessment: string
  plan: string
}

export default function SOAPNoteView() {
  const location = useLocation()
  const navigate = useNavigate()
  const [note, setNote] = useState<SOAPNote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { sessionId, summary } = location.state as any

  useEffect(() => {
    if (!sessionId || !summary) {
      setError('Missing session data')
      return
    }
    generateSOAP()
  }, [sessionId, summary])

  const generateSOAP = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/intake/${sessionId}/soap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary })
      })
      const data = await res.json()

      if (data.ok) {
        setNote(data.data.note)
      } else {
        setError(data.error || 'Failed to generate note')
      }
    } catch (err) {
      setError('Error generating SOAP note')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#FCEBEB', borderRadius: '8px', borderLeft: '4px solid #E24B4A' }}>
          <p style={{ color: '#791F1F', fontWeight: 500 }}>{error}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{ marginTop: '1.5rem', padding: '8px 16px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}
        >
          Go Back
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Generating SOAP note...</p>
      </div>
    )
  }

  if (!note) return null

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px' }}>Clinical Note</h1>
        <button
          onClick={() => navigate('/intake')}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          New Intake
        </button>
      </div>

      {/* SOAP Container */}
      <div style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Subjective */}
        <section style={{ borderBottom: '1px solid var(--border)', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>S — Subjective</h2>
          <div style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)' }}>
            <p style={{ marginBottom: '1rem' }}><strong>CC:</strong> {note.subjective.chiefComplaint}</p>
            <p style={{ marginBottom: '1rem' }}><strong>HPI:</strong> {note.subjective.hpi}</p>
            <p style={{ marginBottom: '1rem' }}><strong>Meds:</strong> {note.subjective.medications}</p>
            <p style={{ marginBottom: '1rem' }}><strong>Allergies:</strong> {note.subjective.allergies}</p>
            <p><strong>PMHx:</strong> {note.subjective.pmhx}</p>
          </div>
        </section>

        {/* Objective */}
        <section style={{ borderBottom: '1px solid var(--border)', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>O — Objective</h2>
          <div style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)' }}>
            <p style={{ marginBottom: '1rem' }}><strong>Vitals:</strong> {note.objective.vitals}</p>
            <p style={{ marginBottom: '1rem' }}><strong>Exam:</strong> {note.objective.exam}</p>
            <p><strong>Investigations:</strong> {note.objective.investigations}</p>
          </div>
        </section>

        {/* Assessment */}
        <section style={{ borderBottom: '1px solid var(--border)', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>A — Assessment</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)' }}>{note.assessment}</p>
        </section>

        {/* Plan */}
        <section style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem' }}>P — Plan</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)' }}>{note.plan}</p>
        </section>
      </div>

      {/* Action buttons */}
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--text-accent, #378ADD)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          Download PDF
        </button>
        <button
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--text-accent, #378ADD)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          Send to EHR
        </button>
        <button
          onClick={() => navigate('/intake')}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          New Intake
        </button>
      </div>
    </div>
  )
}
