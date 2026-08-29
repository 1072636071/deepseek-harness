import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { BoundedTextBuffer } from '../src/session.ts'

/**
 * The historical whole-string implementation, kept verbatim as the parity
 * reference: `value += text` + `split('\n')` + `Array.from` tail scan. The
 * line-deque implementation must be observationally identical.
 */
function utf8TailReference(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let bytes = 0
  let start = chars.length
  while (start > 0) {
    const next = Buffer.byteLength(chars[start - 1] as string)
    if (bytes + next > maxBytes) break
    bytes += next
    start -= 1
  }
  return { text: chars.slice(start).join(''), truncated: true }
}

class ReferenceBuffer {
  private value = ''
  private dropped = false

  constructor(
    private readonly maxBytes: number,
    private readonly maxLines?: number,
  ) {}

  append(text: string): void {
    if (text.length === 0) return
    this.value += text
    if (this.maxLines !== undefined) {
      const lines = this.value.split('\n')
      if (lines.length > this.maxLines) {
        this.value = lines.slice(lines.length - this.maxLines).join('\n')
        this.dropped = true
      }
    }
    const tail = utf8TailReference(this.value, this.maxBytes)
    this.value = tail.text
    this.dropped ||= tail.truncated
  }

  consume(): { delta: string; truncated: boolean } {
    const delta = this.value
    const truncated = this.dropped
    this.value = ''
    this.dropped = false
    return { delta, truncated }
  }

  snapshot(): { text: string; truncated: boolean } {
    return { text: this.value, truncated: this.dropped }
  }
}

/** Deterministic PRNG so property failures reproduce exactly. */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

// ASCII, newlines, 2-byte, 3-byte, and 4-byte (surrogate pair) characters —
// every UTF-8 length class the terminal can decode.
const ALPHABET = ['a', 'Z', ' ', '\n', 'ß', '中', '😀', '🎉']

function randomChunks(random: () => number, count: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < count; index += 1) {
    let chunk = ''
    const size = 1 + Math.floor(random() * 24)
    for (let unit = 0; unit < size; unit += 1) {
      chunk += ALPHABET[Math.floor(random() * ALPHABET.length)] as string
    }
    chunks.push(chunk)
  }
  return chunks
}

const CONFIGS: { bytes: number; lines?: number }[] = [
  { bytes: 7 },
  { bytes: 37 },
  { bytes: 64, lines: 5 },
  { bytes: 100, lines: 3 },
  { bytes: 13, lines: 2 },
]

describe('BoundedTextBuffer parity with the whole-string reference', () => {
  it('matches snapshot, consume, and truncation across randomized chunk streams', () => {
    for (const config of CONFIGS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const random = lcg(seed * 7919)
        const chunks = randomChunks(random, 120)
        const actual = new BoundedTextBuffer(config.bytes, config.lines)
        const expected = new ReferenceBuffer(config.bytes, config.lines)
        let consumedActual: { delta: string; truncated: boolean } | undefined
        let consumedExpected: { delta: string; truncated: boolean } | undefined
        for (let index = 0; index < chunks.length; index += 1) {
          actual.append(chunks[index] as string)
          expected.append(chunks[index] as string)
          expect(actual.snapshot()).toEqual(expected.snapshot())
          // Interleave consumes: both buffers must agree on what was drained.
          if (index % 17 === 16) {
            consumedActual = actual.consume()
            consumedExpected = expected.consume()
            expect(consumedActual).toEqual(consumedExpected)
          }
        }
        expect(actual.consume()).toEqual(expected.consume())
      }
    }
  })

  it('cuts on code-point boundaries when the budget lands inside a multibyte character', () => {
    // '😀' is a surrogate pair (4 UTF-8 bytes). The flat backward scan stops
    // BEFORE a code point that does not fit, so a 3-byte budget keeps nothing
    // of 'ab😀' — the cut never lands inside a code point.
    const buffer = new BoundedTextBuffer(3)
    buffer.append('ab😀')
    expect(buffer.snapshot()).toEqual({ text: '', truncated: true })

    const tight = new BoundedTextBuffer(3)
    tight.append('x')
    tight.append('😀')
    expect(tight.snapshot()).toEqual({ text: '', truncated: true })

    // A 5-byte budget keeps the pair whole once it fits ('b😀' = 5 bytes),
    // and drops the preceding ASCII without touching the pair.
    const fits = new BoundedTextBuffer(5)
    fits.append('ab😀')
    expect(fits.snapshot()).toEqual({ text: 'b😀', truncated: true })
  })

  it('keeps multibyte characters intact when they straddle chunk boundaries', () => {
    const buffer = new BoundedTextBuffer(1024)
    buffer.append('基准')
    buffer.append('测试')
    expect(buffer.snapshot()).toEqual({ text: '基准测试', truncated: false })
  })

  it('stays bounded under sustained high-volume output', () => {
    const bytes = 4096
    const lines = 64
    const buffer = new BoundedTextBuffer(bytes, lines)
    for (let index = 0; index < 4000; index += 1) {
      buffer.append(`line-${index}-${'x'.repeat(48)}\n`)
      const snapshot = buffer.snapshot()
      expect(Buffer.byteLength(snapshot.text)).toBeLessThanOrEqual(bytes)
      expect(snapshot.text.split('\n')).toHaveLength(Math.min(lines, index + 2))
    }
    expect(buffer.snapshot().truncated).toBe(true)
  })

  it('appends at throughput independent of the retention cap (no O(cap) scan)', () => {
    const totalChunks = 1200
    const chunk = 'x'.repeat(2048) + '\n'
    const run = (maxBytes: number): number => {
      const buffer = new BoundedTextBuffer(maxBytes)
      const started = performance.now()
      for (let index = 0; index < totalChunks; index += 1) buffer.append(chunk)
      return performance.now() - started
    }
    // Identical volume, 8x the cap. The whole-string implementation's cost
    // grows with the cap (O(cap) per chunk); the deque implementation does not.
    const smallCap = run(256 * 1024)
    const largeCap = run(2 * 1024 * 1024)
    expect(largeCap).toBeLessThan(Math.max(400, smallCap * 3))
    // And both stay comfortably fast in absolute terms (the O(n²) baseline
    // needs seconds for this volume at the 2 MB cap).
    expect(largeCap).toBeLessThan(2000)
  })
})
