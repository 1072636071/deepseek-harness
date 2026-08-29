import { describe, expect, it } from 'vitest'
import { httpErrorCode } from '../src/adapter.ts'
import { classifyPiAiError } from '@deepseek-ai/dsh-llm-pi-ai'

describe('cross-adapter classification agreement', () => {
  // The same logical provider failure through both transports: DeepSeek sees
  // the HTTP status plus parsed body; pi-ai sees only flattened text (pi-ai
  // upstream discards the original Error). The shared classes must land on
  // the same stable code regardless of provider.
  const sharedFailures = [
    { name: 'auth', status: 401, body: { message: 'invalid credential' }, text: 'provider 401: invalid credential' },
    { name: 'auth 403', status: 403, body: { message: 'forbidden' }, text: 'provider 403: forbidden' },
    { name: 'terminal quota', status: 429, body: { code: 'insufficient_quota', message: 'account credits exhausted' }, text: 'insufficient quota: account credits exhausted' },
    { name: 'rate limit', status: 429, body: { message: 'request rate limit exceeded' }, text: 'provider 429: request rate limit exceeded' },
    { name: 'request size cap', status: 413, body: { message: 'payload too large' }, text: 'payload too large' },
    { name: 'context overflow', status: 400, body: { message: 'request too large for model context' }, text: "This model's maximum context length is 65536 tokens" },
    { name: 'malformed request', status: 400, body: { message: 'invalid request: bad temperature' }, text: 'invalid request: bad temperature' },
    { name: 'server fault', status: 502, body: { message: 'bad gateway' }, text: 'provider 502: bad gateway' },
  ] as const

  it.each(sharedFailures)('classifies $name identically across adapters', ({ status, body, text }) => {
    expect(httpErrorCode(status, body)).toBe(classifyPiAiError(text))
  })

  it('keeps each adapter’s transport tail outside the shared classes', () => {
    // A status outside the shared classes falls back per transport: DeepSeek
    // keeps HTTP_<status>; pi-ai's flattened text falls to its provider tail.
    expect(httpErrorCode(418)).toBe('HTTP_418')
    expect(classifyPiAiError('stream ended before a terminal response event')).toBe('TRANSPORT')
    expect(classifyPiAiError('gpt: request timed out')).toBe('TIMEOUT')
    expect(classifyPiAiError('something entirely novel')).toBe('PI_AI_ERROR')
  })
})
