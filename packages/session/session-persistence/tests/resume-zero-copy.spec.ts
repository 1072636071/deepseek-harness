import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import SessionPersistence, { PersistenceCoordinator, SessionPersistenceRevision } from '../src/index.ts'
import type { SessionPersistenceSnapshot } from '../src/index.ts'
import type { PersistenceBackend, StoredPrefix } from '../src/index.ts'

/** A frozen event fixture shaped like a persisted log entry. */
function frozenEvent(seq: number): SessionEvent {
  return Object.freeze({
    type: 'turn/start',
    seq,
    time: 1000 + seq,
    data: Object.freeze({ turn: seq + 1 }),
  }) as unknown as SessionEvent
}

/**
 * A store-backed service whose stored graphs are handed out frozen and FRESH
 * per read (the backend-ownership contract: fresh, mutually unaliased,
 * unretained), so the coordinator may adopt them without copying.
 */
class FrozenStorePersistence extends SessionPersistence implements PersistenceBackend<never> {
  static inject = ['sessions']

  override readonly name = 'session-persistence-frozen-store'
  override readonly supportsRawArtifacts = false

  readonly stored = new Map<string, { meta: SessionHeader; events: SessionEvent[] }>()
  private coordinator: PersistenceCoordinator<never>

  constructor(ctx: Context) {
    super(ctx)
    this.coordinator = new PersistenceCoordinator<never>(ctx, this)
  }

  locate(): undefined {
    return undefined
  }

  override create(m: SessionHeader): Promise<void> {
    return this.coordinator.create(m)
  }

  override ensureMaterialized(session: Session): Promise<void> {
    return this.coordinator.ensureMaterialized(session)
  }

  override append(id: SessionId, events: readonly SessionEvent[]): Promise<void> {
    return this.coordinator.append(id, events)
  }

  override prepare(id: SessionId, signal?: AbortSignal): ReturnType<PersistenceCoordinator['prepare']> {
    return this.coordinator.prepare(id, signal)
  }

  override inspect(id: SessionId, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    return this.coordinator.inspect(id, signal)
      .then(loaded => ({ meta: loaded.meta, events: [...loaded.events] }))
  }

  override borrowSession(id: SessionId, signal?: AbortSignal): ReturnType<PersistenceCoordinator['borrowSession']> {
    return this.coordinator.borrowSession(id, signal)
  }

  override readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    return this.coordinator.readFrom(id, fromSeq, signal)
      .then(loaded => ({ meta: loaded.meta, events: [...loaded.events] }))
  }

  override listSnapshots(): Promise<SessionPersistenceSnapshot[]> {
    return Promise.resolve([])
  }

  override load(id: SessionId): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    return this.coordinator.load(id).then(loaded => ({ meta: loaded.meta, events: [...loaded.events] }))
  }

  async loadStored(id: SessionId): Promise<StoredPrefix<never> | undefined> {
    const entry = this.stored.get(id)
    if (entry === undefined) return undefined
    const revision = SessionPersistenceRevision(JSON.stringify(entry))
    return {
      meta: structuredClone(entry.meta),
      events: structuredClone(entry.events),
      revision,
    }
  }

  async readStoredRevision(id: SessionId): Promise<SessionPersistenceRevision | undefined> {
    const entry = this.stored.get(id)
    return entry === undefined ? undefined : SessionPersistenceRevision(JSON.stringify(entry))
  }

  async appendBatch(m: SessionHeader, events: readonly SessionEvent[]): Promise<void> {
    const existing = this.stored.get(m.id)
    if (existing === undefined) {
      this.stored.set(m.id, { meta: m, events: [...events] })
    } else {
      existing.events.push(...events)
    }
  }

  async materializeHeader(m: SessionHeader): Promise<void> {
    this.stored.set(m.id, { meta: m, events: [] })
  }

  async commitRepair(m: SessionHeader, _tornMarker: undefined, closers: readonly SessionEvent[]): Promise<void> {
    const entry = this.stored.get(m.id)
    if (entry !== undefined) entry.events.push(...closers)
  }

  async list(): Promise<SessionHeader[]> {
    return [...this.stored.values()].map(entry => entry.meta)
  }

  async close(): Promise<void> {}
}

describe('resume ownership transfer', () => {
  it('restores frozen stored events without cloning the event graph', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const fiber = await ctx.plugin(FrozenStorePersistence)
    const id = SessionId('zero-copy-resume')
    const backend = ctx.sessionPersistence as unknown as FrozenStorePersistence
    backend.stored.set(id, {
      meta: { version: 0, id, createdAt: 1000 } as SessionHeader,
      events: [frozenEvent(0), frozenEvent(1)],
    })

    const frozen0 = backend.stored.get(id)!.events[0]!
    const frozen1 = backend.stored.get(id)!.events[1]!
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone')
    try {
      const preparation = await ctx.sessionPersistence.prepare(id)
      try {
        // The counting assertion: the STORED frozen events are never fed
        // through structuredClone on the resume path. (The backend itself
        // clones its store entries to satisfy its fresh-graph contract — that
        // copy is the one necessary graph materialization; the old service
        // code added a SECOND per-event clone on top of it.)
        const eventClones = cloneSpy.mock.calls.filter(([arg]) => arg === frozen0 || arg === frozen1)
        expect(eventClones).toHaveLength(0)
        // Content parity with the stored log, contiguous from zero. Both
        // stored turn/start events have their turns synthesized closed, and
        // the `session/end-seed` marker closes the restored prefix.
        const events = preparation.session.events
        expect(events[0]).toEqual(frozenEvent(0))
        expect(events[1]).toEqual(frozenEvent(1))
        expect(events.map(event => event.seq)).toEqual([0, 1, 2, 3])
        expect(events.map(event => event.type)).toEqual([
          'turn/start', 'turn/start', 'turn/end', 'session/end-seed',
        ])
      } finally {
        preparation[Symbol.dispose]()
      }
    } finally {
      cloneSpy.mockRestore()
      await fiber.dispose()
    }
  })

  it('still restores unfrozen stored events through the clone fallback', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const fiber = await ctx.plugin(FrozenStorePersistence)
    const id = SessionId('unfrozen-resume')
    const backend = ctx.sessionPersistence as unknown as FrozenStorePersistence
    backend.stored.set(id, {
      meta: { version: 0, id, createdAt: 1000 } as SessionHeader,
      events: [{ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } } as unknown as SessionEvent],
    })

    try {
      const preparation = await ctx.sessionPersistence.prepare(id)
      try {
        const events = preparation.session.events
        expect(events[0]).toEqual({ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } })
      } finally {
        preparation[Symbol.dispose]()
      }
    } finally {
      await fiber.dispose()
    }
  })

  it('a restore-mode session keeps a durable, appendable log', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const fiber = await ctx.plugin(FrozenStorePersistence)
    const id = SessionId('resume-append')
    const backend = ctx.sessionPersistence as unknown as FrozenStorePersistence
    backend.stored.set(id, {
      meta: { version: 0, id, createdAt: 1000 } as SessionHeader,
      events: [frozenEvent(0)],
    })

    try {
      const session = ctx.sessions.prepare(id, {
        seed: [frozenEvent(0)],
        meta: { version: 0, id, createdAt: 1000 } as SessionHeader,
        seedSource: 'persistence',
      })
      ctx.sessions.enter(session)
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await ctx.sessions.flush(session)

      const stored = backend.stored.get(id)
      expect(stored?.events.map(event => event.seq)).toEqual([0, 1, 2])
    } finally {
      await fiber.dispose()
    }
  })
})
