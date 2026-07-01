import { sanitizeInput } from '../sanitize'

describe('sanitizeInput', () => {
  it('removes XSS attempts', () => {
    const malicious = '<script>alert("xss")</script>Hello'
    const result = sanitizeInput(malicious)
    expect(result).not.toContain('<script>')
  })

  it('preserves normal text', () => {
    const normal = 'I have chest pain'
    const result = sanitizeInput(normal)
    expect(result).toBe(normal)
  })
})