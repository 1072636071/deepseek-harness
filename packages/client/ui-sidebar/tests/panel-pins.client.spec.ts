// @vitest-environment jsdom
/** Sidebar launcher pins start empty, stay in memory per panel id, and ignore stored choices. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPanelPins } from '../src/client/panel-pins.ts'

const KEY = 'dsh.slot.manual-order.sidebar.panellist.v1'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('sidebar panel pins', () => {
  it('keeps pinned panel ids in memory without restoring them in a new instance', () => {
    const pins = createPanelPins()
    const listener = vi.fn()
    pins.pinned.subscribe(listener)
    const initial = pins.pinned.getSnapshot()
    expect(initial).toEqual([])
    expect(pins.pinned.getSnapshot()).toBe(initial)
    pins.setPinned('notes', true)
    pins.setPinned('tasks', true)
    expect(pins.pinned.getSnapshot()).toEqual(['notes', 'tasks'])
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(createPanelPins().pinned.getSnapshot()).toEqual([])
    pins.setPinned('notes', false)
    expect(pins.pinned.getSnapshot()).toEqual(['tasks'])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignores repeated choices without republishing', () => {
    const pins = createPanelPins()
    pins.setPinned('notes', true)
    const snapshot = pins.pinned.getSnapshot()
    const listener = vi.fn()
    pins.pinned.subscribe(listener)
    pins.setPinned('notes', true)
    pins.setPinned('absent', false)
    expect(pins.pinned.getSnapshot()).toBe(snapshot)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps ids of panels that are not registered', () => {
    const pins = createPanelPins()
    pins.setPinned('removed-plugin', true)
    pins.setPinned('notes', true)
    expect(pins.pinned.getSnapshot()).toEqual(['removed-plugin', 'notes'])
  })

  it('pins Plugins like every other panel', () => {
    const pins = createPanelPins()
    pins.setPinned('plugins', true)
    expect(pins.pinned.getSnapshot()).toEqual(['plugins'])
  })

  it('ignores a legacy stored list instead of restoring it', () => {
    localStorage.setItem(KEY, JSON.stringify({ unpinned: ['notes'] }))
    const pins = createPanelPins()
    const snapshot = pins.pinned.getSnapshot()
    expect(snapshot).toEqual([])
    expect(pins.pinned.getSnapshot()).toBe(snapshot)
    pins.setPinned('notes', true)
    expect(pins.pinned.getSnapshot()).toEqual(['notes'])
  })
})
