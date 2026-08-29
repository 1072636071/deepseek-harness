import { describe, expect, it } from 'vitest'
import { CONTEXT_WINDOW_EXCEEDED_CODE, normalizeHttpFailureCode, QUOTA_EXCEEDED_CODE } from '../src/index.ts'

describe('normalizeHttpFailureCode', () => {
  it('classifies by status when transport preserved it, ignoring provider wording', () => {
    // A message quoting unrelated numbers must not reclassify a known status.
    expect(normalizeHttpFailureCode({ status: 400, detail: 'error 401 in request log' })).toBe('INVALID_REQUEST')
    expect(normalizeHttpFailureCode({ status: 403, detail: 'forbidden' })).toBe('AUTH')
    expect(normalizeHttpFailureCode({ status: 429, detail: 'slow down' })).toBe('RATE_LIMIT')
    expect(normalizeHttpFailureCode({ status: 418, detail: '' })).toBe('HTTP_418')
  })

  it('matches status-bearing wording only in text-only mode', () => {
    expect(normalizeHttpFailureCode({ detail: 'provider 401: unauthorized' })).toBe('AUTH')
    expect(normalizeHttpFailureCode({ detail: 'provider 429: request rate limit exceeded' })).toBe('RATE_LIMIT')
    expect(normalizeHttpFailureCode({ detail: 'HTTP 502 from gateway' })).toBe('SERVER')
  })

  it('ranks detail-driven classes over statuses in the pinned order', () => {
    // Terminal quota beats transient 429 throttling.
    expect(normalizeHttpFailureCode({ status: 429, detail: 'insufficient_quota account credits exhausted' }))
      .toBe(QUOTA_EXCEEDED_CODE)
    // A 413 body cap is a request fault even when the body mentions context.
    expect(normalizeHttpFailureCode({ status: 413, detail: 'context_length_exceeded' })).toBe('INVALID_REQUEST')
    // Context overflow beats a 400 invalid-request verdict…
    expect(normalizeHttpFailureCode({ status: 400, detail: 'request too large for model context' }))
      .toBe(CONTEXT_WINDOW_EXCEEDED_CODE)
    expect(normalizeHttpFailureCode({ status: 400, detail: 'invalid input: temperature exceeds maximum' }))
      .toBe('INVALID_REQUEST')
    // …but a 5xx stays the retryable transport class even when its body quotes
    // context wording: retryability follows the transport class.
    expect(normalizeHttpFailureCode({ status: 503, detail: 'maximum context length 65536 tokens exceeded' }))
      .toBe('SERVER')
    // Size-cap wording is text-only (a known status decides by equality).
    expect(normalizeHttpFailureCode({ detail: 'request body too large for the 413 gateway cap' }))
      .toBe('INVALID_REQUEST')
    // Nothing matches in text-only mode: the caller classifies its transport tail.
    expect(normalizeHttpFailureCode({ detail: 'other side closed' })).toBeUndefined()
  })
})
