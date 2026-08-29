/**
 * Shared HTTP/provider failure → stable Harness error code classification.
 *
 * Single source for the classes both adapters agree on: auth, terminal quota,
 * request-size caps, transient rate limits, model-context overflow, malformed
 * requests, and server faults. Adapters keep only their transport-specific
 * tail (pi-ai's stream-truncation and timeout wording; a status-bearing
 * adapter's `HTTP_<status>` fallback). Text patterns apply only in text-only
 * mode (transport flattened the failure to a message); when the HTTP status
 * survived, status equality decides and provider wording never overrides it.
 *
 * @module @deepseek-ai/dsh-llm/http-failure
 */

import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  QUOTA_EXCEEDED_CODE,
} from './error.ts'

/** Classification input: the HTTP status when transport preserved it, plus every provider detail string. */
export interface HttpFailureInput {
  /**
   * HTTP status of the failed response; omitted when the transport flattened
   * the failure to a message (stream adapters).
   */
  status?: number
  /** Provider error code, type, and message joined into one detail string. */
  detail: string
}

/** Request-size wording tied to a body/gateway cap (not model context capacity). */
const SIZE_CAP_TEXT = /\b413\b|payload too large|request body too large|failed to buffer the request body:\s*length limit exceeded/i

/** Transient request-rate wording distinct from terminal quota exhaustion. */
const RATE_LIMIT_TEXT = /\b429\b|rate.?limit/i

/** Malformed-request wording for text-only mode. */
const INVALID_REQUEST_TEXT = /\b400\b|invalid.?request/i

/**
 * Classify one provider failure to the stable Harness code both adapters share.
 *
 * Order is load-bearing and pinned by both adapters' suites: auth by status,
 * then terminal quota by detail (beats a 429 — exhaustion is not throttling),
 * then the request-size cap (beats context wording — a 413 body cap is a
 * request fault, not a model bound), then transient rate limiting, then
 * context overflow by detail, then malformed request, then server faults,
 * then the caller's fallback. Migrating a third adapter means feeding it this
 * function and mapping only its transport tail.
 *
 * Detail-driven classes stay status-scoped where a wider reading would flip
 * retryability: context overflow is recognized for a 400 (the historical
 * DeepSeek verdict) and in text-only mode, while a 5xx body quoting context
 * wording stays `SERVER` — retryable, as the transport class demands.
 * @param input - the failure's status (when known) and joined provider detail.
 * @returns the shared stable code, or `undefined` when the detail matches no
 *   shared class in text-only mode — the caller classifies its transport tail.
 */
export function normalizeHttpFailureCode(input: HttpFailureInput & { status: number }): string
export function normalizeHttpFailureCode(input: HttpFailureInput): string | undefined
export function normalizeHttpFailureCode(input: HttpFailureInput): string | undefined {
  const { status, detail } = input
  // Status equality when the transport preserved it; the same status as
  // status-bearing wording only when it did not (provider messages quoting
  // unrelated numbers must not reclassify a known status).
  const is = (httpStatus: number): boolean =>
    status === httpStatus || (status === undefined && new RegExp(`\\b${httpStatus}\\b`).test(detail))
  if (is(401) || is(403)) return 'AUTH'
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (is(413) || (status === undefined && SIZE_CAP_TEXT.test(detail))) return 'INVALID_REQUEST'
  if (is(429) || (status === undefined && RATE_LIMIT_TEXT.test(detail))) return 'RATE_LIMIT'
  if ((status === undefined || status === 400) && isContextWindowExceededError(detail)) {
    return CONTEXT_WINDOW_EXCEEDED_CODE
  }
  if (is(400) || (status === undefined && INVALID_REQUEST_TEXT.test(detail))) return 'INVALID_REQUEST'
  if (status !== undefined ? status >= 500 : /\b5\d\d\b/.test(detail)) return 'SERVER'
  return status !== undefined ? `HTTP_${status}` : undefined
}
