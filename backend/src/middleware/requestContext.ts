import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

declare global {
  namespace Express {
    interface Request {
      id: string
    }
  }
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  req.id = uuidv4()
  
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      JSON.stringify({
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      })
    )
  })
  
  next()
}

// In server.ts:
// app.use(requestContext)