// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { LlmConfigurableProvider, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsDescribeFace, SettingsMirrorSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  ModelVisibilityDirectory,
  hiddenModelsOf,
  joinVisibilityDirectory,
} from '../src/client/visibility.ts'

/** One namespace carrying a provider profile with a `models` array. */
function namespace(ns: string, value: unknown): SettingsNamespaceView {
  return { ns, value: value as never, schema: {}, base: undefined, user: undefined, applies: true, secrets: {}, revision: 1 }
}

/** A minimal describe mirror face over a mutable snapshot. */
function mirror(initial: SettingsMirrorSnapshot) {
  const store = createSnapshotStore<SettingsMirrorSnapshot>(initial)
  const face: SettingsDescribeFace = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => { return store.subscribe(listener) },
    ensure: () => Promise.resolve(),
    acceptView: () => {},
    namespace: () => undefined,
  }
  return { face, store }
}

const PROVIDER: LlmConfigurableProvider = {
  provider: 'deepseek-official',
  displayName: 'DeepSeek',
  settingsNs: 'llm-deepseek',
  settingsPath: ['config', 'official'],
}

describe('hiddenModelsOf', () => {
  it('hides only rows with an explicit visible: false', () => {
    const resolved = joinVisibilityDirectory([PROVIDER], mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [
              { id: 'flash', visible: false },
              { id: 'pro', visible: true },
              { id: 'hidden-noflag' },
            ] } },
          }),
        ],
      }, error: null,
    }).face)[0]
    expect(hiddenModelsOf(resolved)).toEqual(new Set(['flash']))
  })

  it('treats a provider without a models array as all-visible', () => {
    const resolved = joinVisibilityDirectory([PROVIDER], mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', { config: { official: {} } }),
        ],
      }, error: null,
    }).face)[0]
    expect(hiddenModelsOf(resolved)).toEqual(new Set())
  })

  it('treats a provider with no namespace view as all-visible', () => {
    const resolved = joinVisibilityDirectory([PROVIDER], mirror({
      status: 'ready', view: { writable: true, hasDocument: true, namespaces: [] }, error: null,
    }).face)[0]
    expect(hiddenModelsOf(resolved)).toEqual(new Set())
  })
})

describe('ModelVisibilityDirectory', () => {
  it('publishes the hidden set and reloads the catalog only on change', async () => {
    const mirrorFace = mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'flash' }] } },
          }),
        ],
      }, error: null,
    })
    const onChange = vi.fn()
    const providers = vi.fn().mockResolvedValue([PROVIDER])
    const dir = new ModelVisibilityDirectory(providers, mirrorFace.face, onChange)
    await dir.refresh()

    const snapshot = dir.store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.hidden.size).toBe(0)
    // No hidden models → no catalog reload on the initial resolve.
    expect(onChange).not.toHaveBeenCalled()
    dir.dispose()
  })

  it('derives hidden ids and notifies a change exactly once', async () => {
    const mirrorFace = mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'flash', visible: false }] } },
          }),
        ],
      }, error: null,
    })
    const onChange = vi.fn()
    const providers = vi.fn().mockResolvedValue([PROVIDER])
    const dir = new ModelVisibilityDirectory(providers, mirrorFace.face, onChange)
    await dir.refresh()

    const snapshot = dir.store.getSnapshot()
    expect(snapshot.hidden.get('deepseek-official')).toEqual(new Set(['flash']))
    // A change from the empty baseline reloads the catalog once.
    expect(onChange).toHaveBeenCalledTimes(1)

    // Re-derive with identical sources does not fire again.
    await dir.refresh()
    expect(onChange).toHaveBeenCalledTimes(1)
    dir.dispose()
  })

  it('reflects a visibility toggled back to visible via a document update', async () => {
    const mirrorFace = mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'flash', visible: false }] } },
          }),
        ],
      }, error: null,
    })
    const onChange = vi.fn()
    const dir = new ModelVisibilityDirectory(
      () => Promise.resolve([PROVIDER]),
      mirrorFace.face,
      onChange,
    )
    await dir.refresh()
    expect(dir.store.getSnapshot().hidden.get('deepseek-official')).toEqual(new Set(['flash']))

    // A describe after the host folded the write (visible→true) re-derives.
    mirrorFace.store.set({
      status: 'ready', error: null, view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'flash', visible: true }] } },
          }),
        ],
      },
    })
    await dir.refresh()
    expect(dir.store.getSnapshot().hidden.size).toBe(0)
    dir.dispose()
  })

  it('publishes an error state when the mirror fails, and stays loading before an answer', () => {
    const loading = mirror({ status: 'idle', view: undefined, error: null })
    const dir = new ModelVisibilityDirectory(() => Promise.resolve([PROVIDER]), loading.face, vi.fn())
    expect(dir.store.getSnapshot().status).toBe('loading')

    loading.store.set({ status: 'ready', view: undefined, error: 'settings unavailable' })
    expect(dir.store.getSnapshot().status).toBe('error')
    expect(dir.store.getSnapshot().error).toBe('settings unavailable')
    dir.dispose()
  })

  it('unsubscribes the mirror on dispose and stops refreshing', async () => {
    const mirrorFace = mirror({
      status: 'ready', view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'flash', visible: false }] } },
          }),
        ],
      }, error: null,
    })
    const onChange = vi.fn()
    const providers = vi.fn().mockResolvedValue([PROVIDER])
    const dir = new ModelVisibilityDirectory(providers, mirrorFace.face, onChange)
    await dir.refresh()
    expect(onChange).toHaveBeenCalledTimes(1)

    dir.dispose()
    // A later mirror change must not reach a disposed directory.
    mirrorFace.store.set({
      status: 'ready', error: null, view: {
        writable: true, hasDocument: true, namespaces: [
          namespace('llm-deepseek', {
            config: { official: { models: [{ id: 'pro', visible: false }] } },
          }),
        ],
      },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
