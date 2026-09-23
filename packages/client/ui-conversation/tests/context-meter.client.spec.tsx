// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { ContextMeter, type ContextMeterProps } from '../src/client/skeleton/ContextMeter.tsx'
import { contextOccupancy } from '../src/client/context-occupancy.ts'
import css from '../src/client/skeleton/ContextMeter.module.css'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as ContextMeterProps['t']
const tEn = makeTranslate(en, commonEn) as ContextMeterProps['t']

const BREAKDOWN = { systemTokens: 120, toolsTokens: 21_500, messageTokens: 477_000 }

const segmentClass = css.segment
if (segmentClass === undefined) throw new Error('segment class missing from ContextMeter.module.css')

function projections(values: Record<string, unknown>): ContextMeterProps['useProjection'] {
  return (key: string) => values[key]
}

function meter(values: Record<string, unknown>, translate: ContextMeterProps['t'] = t) {
  return render(<ContextMeter useProjection={projections(values)} t={translate} />)
}

describe('ContextMeter', () => {
  it('computes occupancy only when both a numerator and capacity are known', () => {
    expect(contextOccupancy({ pressureTokens: 32_000, projectedTokens: 6_000, contextWindow: 128_000 }))
      .toEqual({ percent: 5, usedTokens: 6_000, contextWindow: 128_000 })
    expect(contextOccupancy({ pressureTokens: 32_000, contextWindow: 128_000 }))
      .toEqual({ percent: 25, usedTokens: 32_000, contextWindow: 128_000 })
    expect(contextOccupancy({ pressureTokens: 32_000 })).toBeNull()
    expect(contextOccupancy({ contextWindow: 128_000 })).toBeNull()
    expect(contextOccupancy(undefined)).toBeNull()
    expect(contextOccupancy({ pressureTokens: 300_000, contextWindow: 128_000 })?.percent).toBe(100)
  })

  it('renders nothing until both pressure and capacity are known', () => {
    expect(meter({}).container.textContent).toBe('')
    expect(meter({ contextPressure: { pressureTokens: 32_000 } }).container.textContent).toBe('')
    expect(meter({ contextPressure: { contextWindow: 128_000 } }).container.textContent).toBe('')
  })

  it('shows the occupancy ring and opens the breakdown panel on click', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    fireEvent.click(trigger)
    const panel = view.container.querySelector('[role="dialog"]')!
    expect(panel.textContent).toContain('~32K / 128K')
    expect(panel.textContent).toContain('25%')
    expect(panel.textContent).toContain('上下文已用')
    expect(panel.textContent).toContain('系统提示词~120')
    expect(panel.textContent).toContain('工具定义~21.5K')
    expect(panel.textContent).toContain('对话消息~477K')
    // The occupancy bar splits into one colored segment per composition row.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(3)
    // Clicking the trigger again toggles the panel shut.
    fireEvent.click(trigger)
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the occupancy panel as soon as the pointer hovers the ring', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    fireEvent.mouseEnter(trigger)
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()
    fireEvent.mouseLeave(trigger)
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('pins the panel on click and releases the pin on a second click', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    // Hover previews, then the click pins so the panel survives the pointer leaving.
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()
    // A second click releases the pin; a click always happens while hovering,
    // so the panel stays on as the hover preview and follows the pointer out.
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()
    fireEvent.mouseLeave(trigger)
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('forgets the hover state while capacity is absent', () => {
    // The unmounted ring receives no mouseleave, so a capacity that disappears
    // mid-hover and returns must not show a panel the pointer no longer holds.
    let values: Record<string, unknown> = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    const view = render(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    fireEvent.mouseEnter(trigger)
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()
    values = { contextPressure: { pressureTokens: 32_000 }, contextBreakdown: BREAKDOWN }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.container.textContent).toBe('')
    values = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(view.getByRole('button', { name: '上下文已用 25%' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('lets each locale own the headline word order around the reading', () => {
    const values = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    const zhView = meter(values)
    fireEvent.click(zhView.getByRole('button', { name: '上下文已用 25%' }))
    // The reading follows the label in Chinese and leads it in English; both
    // headers read as one sentence rather than a concatenated fragment.
    expect(zhView.container.querySelector('[role="dialog"]')!.textContent)
      .toMatch(/^上下文已用25%/)
    const enView = meter(values, tEn)
    fireEvent.click(enView.getByRole('button', { name: '25% of context used' }))
    expect(enView.container.querySelector('[role="dialog"]')!.textContent)
      .toMatch(/^25%of context used/)
  })

  it('draws no bar segment at zero occupancy', () => {
    const view = meter({
      contextPressure: { pressureTokens: 0, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    fireEvent.click(view.getByRole('button', { name: '上下文已用 0%' }))
    const panel = view.container.querySelector('[role="dialog"]')!
    // `.segment` carries a min-width, so a zero-width part would still paint a
    // filled sliver over an empty context.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(0)
    expect(panel.textContent).toContain('~0 / 128K')
  })

  it('reads the ring from the projected figure so a compaction shows at once', () => {
    // Same provider sample, a surface a compaction just shrank: the ring must
    // follow the projection rather than the sample it is anchored to.
    const view = meter({
      contextPressure: { pressureTokens: 32_000, projectedTokens: 3_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 2%' })
    fireEvent.click(trigger)
    expect(view.container.querySelector('[role="dialog"]')!.textContent).toContain('~3K / 128K')
  })

  it('omits the composition rows while the contextBreakdown projection is absent', () => {
    const view = meter({ contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 } })
    fireEvent.click(view.getByRole('button', { name: '上下文已用 25%' }))
    const panel = view.container.querySelector('[role="dialog"]')!
    expect(panel.textContent).toContain('~32K / 128K')
    expect(panel.textContent).not.toContain('系统提示词')
    expect(panel.textContent).not.toContain('对话消息')
    // Without composition shares, the bar falls back to one plain segment.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(1)
  })

  it('closes when capacity disappears and stays closed when it returns', () => {
    let values: Record<string, unknown> = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    const view = render(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    fireEvent.click(view.getByRole('button', { name: '上下文已用 25%' }))
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()

    values = { contextPressure: { pressureTokens: 32_000 }, contextBreakdown: BREAKDOWN }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.container.textContent).toBe('')

    values = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.getByRole('button', { name: '上下文已用 25%' }).getAttribute('aria-expanded')).toBe('false')
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on outside pointerdown and Escape — but not inside clicks', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    const openPanel = () => {
      fireEvent.click(trigger)
      return view.container.querySelector('[role="dialog"]')!
    }
    // A pointerdown inside the panel keeps it open; outside closes it.
    const again = openPanel()
    fireEvent.pointerDown(again)
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    // Escape.
    openPanel()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })
})
