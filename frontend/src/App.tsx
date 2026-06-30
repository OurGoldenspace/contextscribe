import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import IntakeChat from './pages/IntakeChat'
import SOAPNoteView from './pages/SOAPNoteView'
import './App.css'

export default function App() {
  return (
    <Router>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--surface-0)',
          padding: '1rem 0'
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/intake" replace />} />
          <Route path="/intake" element={<IntakeChat />} />
          <Route path="/soap-note" element={<SOAPNoteView />} />
        </Routes>
      </div>
    </Router>
  )
}