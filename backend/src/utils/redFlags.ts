const RED_FLAG_PATTERNS = [
    { keyword: 'chest pain', severity: 'CRITICAL', action: 'Urgent review' },
    { keyword: 'difficulty breathing', severity: 'CRITICAL', action: 'Urgent review' },
    { keyword: 'severe headache', severity: 'HIGH', action: 'Immediate review' },
    { keyword: 'loss of consciousness', severity: 'CRITICAL', action: 'Emergency' },
    { keyword: 'uncontrolled bleeding', severity: 'CRITICAL', action: 'Emergency' },
    { keyword: 'suicidal', severity: 'CRITICAL', action: 'Emergency hotline' }
  ]
  
  export function detectRedFlags(text: string): Array<{ flag: string; severity: string; action: string }> {
    const flags: Array<{ flag: string; severity: string; action: string }> = []
    const lowerText = text.toLowerCase()
  
    for (const pattern of RED_FLAG_PATTERNS) {
      if (lowerText.includes(pattern.keyword)) {
        flags.push({
          flag: pattern.keyword,
          severity: pattern.severity,
          action: pattern.action
        })
      }
    }
  
    return flags
  }