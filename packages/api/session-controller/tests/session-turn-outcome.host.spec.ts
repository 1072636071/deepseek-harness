/**
 * The `sessionTurnOutcome` projection carries the latest closed turn's
 * discriminant out of the durable log so a Session list can flag a Session a
 * human must handle. It projects the fact only: which outcomes deserve
 * attention is a client decision, so an unrecognized discriminant survives the
 * fold instead of failing a build that does not know it.
 *
 * Each closed turn replaces the recorded outcome, which is what lets a failed
 * turn clear when a later turn succeeds. `turnBoundary` folds the same
 * `turn/end` events but drops their reason, so this unit is the only wire path
 * for the outcome.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { applySessionTurnOutcome } from '../src/list.ts'
import { createSessionTestRemote, type TestSessionRemote } from './test-remote.ts'

async function harness(): Promise<{ ctx: Context; remote: TestSessionRemote; attach: (session: Session) => Promise<void> }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return {
    ctx,
    remote: createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }),
    attach: async (session) => {
      await ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
    },
  }
}

async function outcome(remote: TestSessionRemote, id: string): Promise<string | null | undefined> {
  const result = await remote.list({})
  if (!result.ok) throw new Error('list failed')
  return result.value.items.find(item => item.sessionId === id)?.projections?.values.sessionTurnOutcome?.lastTurnEnd
}

/** Close one turn with `reason` on a Session that has started. */
function closeTurn(session: Session, turn: number, reason: unknown): void {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 0 })
  session.append('step/end', { turn, step: 0 })
  session.append('turn/end', { turn, reason: reason as never })
}

describe('sessionTurnOutcome projection', () => {
  it('reports no outcome before the first closed turn', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    session.append('turn/start', { turn: 0 })
    expect(await outcome(remote, session.id)).toBeNull()
  })

  it.each(['completed', 'aborted', 'blocked', 'max-tokens', 'interrupted', 'forked'] as const)(
    'projects the %s discriminant verbatim',
    async (kind) => {
      const { ctx, remote, attach } = await harness()
      const session = ctx.sessions.create()
      await attach(session)
      closeTurn(session, 0, kind === 'aborted' ? { kind, reason: { kind: 'user' } } : { kind })
      expect(await outcome(remote, session.id)).toBe(kind)
    },
  )

  it('projects a failed turn as its error discriminant', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    closeTurn(session, 0, { kind: 'error', error: { message: 'provider exploded', code: 'UNKNOWN' } })
    expect(await outcome(remote, session.id)).toBe('error')
  })

  it('keeps only the latest turn, so a later success clears a failure', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    closeTurn(session, 0, { kind: 'error', error: { message: 'provider exploded', code: 'UNKNOWN' } })
    expect(await outcome(remote, session.id)).toBe('error')
    closeTurn(session, 1, { kind: 'completed' })
    expect(await outcome(remote, session.id)).toBe('completed')
  })

  it('returns the same state reference for every event that is not a turn/end', () => {
    const state = { lastTurnEnd: 'error' }
    for (const type of ['turn/start', 'step/start', 'step/end', 'user/message'] as const) {
      expect(applySessionTurnOutcome(state, { type } as SessionEvent)).toBe(state)
    }
    expect(state.lastTurnEnd).toBe('error')
  })

  it('replaces the state reference when a turn closes', () => {
    const state = { lastTurnEnd: null }
    const next = applySessionTurnOutcome(state, {
      type: 'turn/end', data: { turn: 0, reason: { kind: 'blocked' } },
    } as SessionEvent)
    expect(next).not.toBe(state)
    expect(next.lastTurnEnd).toBe('blocked')
  })
})
