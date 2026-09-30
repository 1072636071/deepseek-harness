// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { RunningStatus } from '../src/client/chat/RunningStatus.tsx'
import { deepDivingPool, en, zh } from '../src/client/locale.ts'

const t = makeTranslate(zh, commonZh)
const tEn = makeTranslate(en, commonEn)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function statusHarness(startTime?: number, opts: { activeLocale?: () => string; translate?: typeof t } = {}) {
  const translate = opts.translate ?? t
  const view = render(<RunningStatus startTime={startTime} activeLocale={opts.activeLocale} t={translate} />)
  return {
    ...view,
    content: () => view.container.querySelector('[data-chat-running] > :last-child'),
    set: (nextStartTime?: number) => {
      view.rerender(<RunningStatus startTime={nextStartTime} activeLocale={opts.activeLocale} t={translate} />)
    },
  }
}

describe('RunningStatus', () => {
  it('waits for an open Turn start before allocating its clock', () => {
    const view = statusHarness()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
    view.set(1_000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.querySelectorAll('[data-shimmer="true"]')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    view.set()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the indicator mounted while a continuous run moves to the next Turn', () => {
    const view = statusHarness(1_000)
    const content = view.content()
    const status = view.getByRole('status')
    const initialText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(initialText)
    view.set(7_000)
    expect(view.content()).toBe(content)
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(vi.getTimerCount()).toBe(1)
    const nextTurnText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(nextTurnText)
    expect(view.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('深度求索中')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the duration nonnegative when the start is ahead of the local clock', () => {
    const view = statusHarness(6_000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
  })

  it('draws one playful phrase per mount for a pooled locale', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const phrase = deepDivingPool.zh[0]!
    const view = statusHarness(1_000, { activeLocale: () => 'zh' })
    expect(view.content()?.textContent).toBe(`${phrase} · 用时 4秒 ···`)
    expect(view.getByRole('status').textContent).toBe(phrase)
    // The clock tick re-renders the elapsed time and never re-draws the phrase.
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(view.content()?.textContent).toBe(`${phrase} · 用时 6秒 ···`)
    expect(view.getByRole('status').textContent).toBe(phrase)
  })

  it('draws the English bucket through the English dictionary', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const view = statusHarness(1_000, { activeLocale: () => 'en', translate: tEn })
    expect(view.content()?.textContent).toBe(`${deepDivingPool.en[0]!} · 4s ···`)
  })

  it('keeps the static copy for a locale id without a phrase bucket', () => {
    const view = statusHarness(1_000, { activeLocale: () => 'ja' })
    expect(view.content()?.textContent).toBe('深度求索中，用时 4秒 ···')
    expect(view.getByRole('status').textContent).toBe('深度求索中')
  })

})
