import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function safeDbMessage(message: string) {
  const cleaned = message.replace(/^.*ERROR:\s*/i, '').split('\n')[0].trim()
  if (/duplicate key/i.test(message) && /username/i.test(message)) return 'That username is taken'
  if (/duplicate key/i.test(message) && /application/i.test(message)) return 'You have already applied to this task'
  if (/password authentication|syntax error|violates|stack trace|relation /i.test(cleaned)) {
    return 'That action could not be completed'
  }
  return cleaned || 'That action could not be completed'
}

export function asRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const issue = error.issues[0]
    res.status(400).json({ error: issue?.message || 'Check the form and try again.', details: error.flatten() })
    return
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'Something went wrong. Try again.' })
}
