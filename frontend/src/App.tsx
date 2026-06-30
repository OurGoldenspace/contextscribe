import { useState } from 'react'

// Placeholder App — confirms backend connectivity end-to-end. The real
// IntakeChat and ComparisonView components get built in Sprint 3.
function App() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function checkBackend() {
    setStatus('checking')
    try {
      const res = await fetch('/api/intake/start', { method: 'OPTIONS' })
      // OPTIONS may 404 on some setups — what we're really checking is
      // that the dev proxy reaches the backend at all, not the route logic.
      setStatus(res.status < 500 ? 'ok' : 'error')
      setMessage(`Backend responded with status ${res.status}`)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '60px auto', padding: 20 }}>
      <h1>ContextScribe</h1>
      <p style={{ color: '#555' }}>
        Adaptive clinical intake + context-aware SOAP note generation.
      </p>
      <button onClick={checkBackend} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Test backend connection
      </button>
      {status !== 'idle' && (
        <p style={{ marginTop: 16 }}>
          Status: <strong>{status}</strong>
          {message && <span> — {message}</span>}
        </p>
      )}
    </div>
  )
}

export default App
