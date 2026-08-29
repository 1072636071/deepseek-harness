import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx
}

describe('Session.eventsReversed', () => {
  it('yields the log newest-first, matching the reversed snapshot', async () => {
    const ctx = await mount()
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const reversed = [...session.eventsReversed()]
    expect(reversed.map(event => event.type)).toEqual(['turn/end', 'turn/start'])
    expect(reversed).toEqual([...session.events].reverse())
  })

  it('supports early termination without touching the whole log', async () => {
    const ctx = await mount()
    const session = ctx.sessions.create()
    for (let turn = 1; turn <= 50; turn += 1) {
      session.append('turn/start', { turn })
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    // A backward scan that stops at the first match is the whole point.
    let visited = 0
    for (const event of session.eventsReversed()) {
      visited += 1
      if (event.type === 'turn/end') break
    }
    expect(visited).toBe(1)
  })

  it('captures the log prefix at iteration start', async () => {
    const ctx = await mount()
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })

    const iterator = session.eventsReversed()
    const first = iterator.next()
    expect(first.done).toBe(false)
    // Appends during iteration are not visited: the prefix was captured.
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const rest = [...iterator].map(event => event.type)
    expect(rest).not.toContain('turn/end')
  })
})
