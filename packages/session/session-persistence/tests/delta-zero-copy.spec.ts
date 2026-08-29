import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { DEFAULT_PREPARED_SESSION_CACHE_SIZE, PersistenceCoordinator, SessionPersistenceRevision } from '../src/index.ts'
import type { PersistenceBackend, StoredPrefix } from '../src/index.ts'

/**
 * A backend that records the batch REFERENCE it was handed, so the identity of
 * the events the coordinator delivered is observable. Storage is a plain map
 * whose contents are irrelevant to the assertions.
 */
class RecordingBackend implements PersistenceBackend<never> {
  readonly name = 'session-persistence-recording'
  readonly supportsRawArtifacts = false
  readonly batches: SessionEvent[][] = []
  private readonly store = new Map<string, { meta: SessionHeader; events: SessionEvent[] }>()

  async loadStored(id: SessionId): Promise<StoredPrefix<never> | undefined> {
    const entry = this.store.get(id)
    if (entry === undefined) return undefined
    const revision = SessionPersistenceRevision(JSON.stringify(entry))
    return { meta: structuredClone(entry.meta), events: structuredClone(entry.events), revision }
  }

  async readStoredRevision(id: SessionId): Promise<SessionPersistenceRevision | undefined> {
    const entry = this.store.get(id)
    return entry === undefined ? undefined : SessionPersistenceRevision(JSON.stringify(entry))
  }

  async appendBatch(m: SessionHeader, events: readonly SessionEvent[]): Promise<void> {
    this.batches.push(events as SessionEvent[])
    const existing = this.store.get(m.id)
    if (existing === undefined) {
      this.store.set(m.id, { meta: m, events: [...events] })
    } else {
      existing.events.push(...events)
    }
  }

  async commitRepair(m: SessionHeader, _tornMarker: undefined, closers: readonly SessionEvent[]): Promise<void> {
    const entry = this.store.get(m.id)
    if (entry !== undefined) entry.events.push(...closers)
  }

  async materializeHeader(m: SessionHeader): Promise<void> {
    this.store.set(m.id, { meta: m, events: [] })
  }

  async list(): Promise<SessionHeader[]> {
    return [...this.store.values()].map(entry => entry.meta)
  }

  async close(): Promise<void> {}
}

/** Mount the session store and a coordinator over the recording backend. */
async function mount(): Promise<{ ctx: Context; backend: RecordingBackend }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const backend = new RecordingBackend()
  const fiber = await ctx.plugin(Object.assign((inner: Context) => {
    new PersistenceCoordinator(inner, backend, { preparedSessionCacheSize: DEFAULT_PREPARED_SESSION_CACHE_SIZE, writeBatchMaxDelayMs: 5 })
  }, { inject: ['sessions'] }))
  backend.close = () => fiber.dispose()
  return { ctx, backend }
}

describe('live delta persistence path', () => {
  it('delivers session-appended events to the backend by reference (one copy total)', async () => {
    vi.useFakeTimers()
    const { ctx, backend } = await mount()
    const session = ctx.sessions.create(SessionId('zero-copy'))
    session.append('turn/start', { turn: 1 })

    // A token-level delta: session.append snapshots + deep-freezes its data
    // (the ONE necessary copy); the write-behind queue and the coordinator
    // must both retain that frozen event by reference.
    session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'hello ' } })
    session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'world' } })
    await ctx.sessions.flush(session)

    const chunkSeqs = [1, 2]
    const delivered = backend.batches.at(-1)
    expect(delivered).toBeDefined()
    for (const seq of chunkSeqs) {
      const live = session.events[seq]!
      const persisted = delivered?.find(e => e.seq === seq)
      expect(live.data).toEqual({
        turn: 1,
        step: 1,
        chunk: { type: 'text-delta', index: 0, text: seq === 1 ? 'hello ' : 'world' },
      })
      // The counting assertion: identity with the live log proves no further
      // deep copy happened after session.append materialized the event.
      expect(persisted).toBe(live)
    }
  })

  it('rejects a non-lossless-JSON event at the append boundary', async () => {
    const { ctx, backend } = await mount()
    const session = ctx.sessions.create(SessionId('negative'))
    session.append('turn/start', { turn: 1 })
    expect(() =>
      session.append('assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'text-delta', index: 0, text: 1n as never },
      }),
    ).toThrow(/non-JSON-serializable/)
    // The rejected event never enters the log nor the durable queue.
    expect(session.events).toHaveLength(1)
    await ctx.sessions.flush(session)
    const persistedSeqs = backend.batches.flat().map(e => e.seq)
    expect(persistedSeqs).toEqual([0])
  })
})
