# Database Schema

## IntakeSession

```typescript
{
  _id: ObjectId,
  sessionId: string (unique, UUID),
  messages: [{
    role: 'patient' | 'assistant',
    content: string,
    timestamp: Date
  }],
  status: 'active' | 'complete' | 'error',
  structuredData: {
    chiefComplaint: string,
    hpi: string,
    medications: [{
      name: string,
      dose: string,
      frequency: string
    }],
    allergies: [{
      substance: string,
      reaction: string,
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
    }],
    pmhx: string[],
    redFlags: string[],
    confidence: {
      medications: 'HIGH' | 'MEDIUM' | 'LOW',
      allergies: 'HIGH' | 'MEDIUM' | 'LOW'
    },
    uncertain: string[]
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Indices