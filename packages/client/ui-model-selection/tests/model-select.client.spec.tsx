// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import type { ModelVisibilityState } from '../src/client/visibility.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

afterEach(cleanup)

describe('ModelSelect reasoning effort', () => {
  it('renders effort names without descriptions and submits the effort as part of the session selection', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High',
    })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /推理等级/ }))
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['Off', 'High', 'Max'])
    expect(screen.queryByText('Largest budget')).toBeNull()

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Max/ }))
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
      expect(trigger.getAttribute('aria-label')).toBe('选择模型，当前 DeepSeek-V4-Flash，推理等级 Max')
    })
  })

  it('offers provider default only when the adapter does not configure a model default', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'model',
          name: 'Model',
          reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] },
        }],
      }],
      current: { provider: 'provider', model: 'model' },
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', {
      name: '选择模型，当前 Model，推理等级 Default',
    }))
    fireEvent.click(screen.getByRole('menuitem', { name: /推理等级/ }))
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['Default', 'Standard'])
  })

  it('shows the durable model id when the catalog has no matching display name', () => {
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'removed-model' },
    }))
    const select = vi.fn().mockResolvedValue(true)
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: '选择模型，当前 deepseek-official/removed-model' })
    expect(trigger.textContent).toContain('deepseek-official/removed-model')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem', { name: /推理等级/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.queryByRole('menuitemradio', { name: 'removed-model' })).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
    expect(screen.queryByText('Fast catalog description')).toBeNull()
  })

  it('shows loading until the catalog and Session projection are both ready', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: null,
      routable: null,
      groups: [],
      status: 'loading',
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    expect(screen.getByRole('button', { name: '正在加载模型…' }).textContent)
      .toContain('正在加载模型…')
    directory.set(state())
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High',
      })).toBeTruthy()
    })
  })

  it('announces a rejected selection as a transient toast and keeps the in-menu strip for loads', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async () => {
      directory.set(state({ groups, status: 'error', error: 'model-unavailable: session already contains images' }))
      return false
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    const toast = await screen.findByRole('alert')
    expect(toast.textContent).toContain('模型操作失败：model-unavailable: session already contains images')
    // The selection failure does not render the in-menu load strip (no Retry).
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const load = vi.fn()
    render(<ModelSelect
      locked={false}
      available={false}
      directory={createSnapshotStore(state())}
      load={load}
      select={vi.fn().mockResolvedValue(false)}
      t={t}
    />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('ModelSelect two-column layout', () => {
  const multi = (): ModelDirectoryState => state({
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    groups: [
      {
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-sonnet', name: 'Claude Sonnet' },
          { id: 'claude-opus', name: 'Claude Opus' },
        ],
      },
    ],
  })

  it('opens the model pane with the current provider in the right column', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))

    // Left column lists every provider.
    expect(screen.getAllByRole('menuitem').map(item => item.textContent))
      .toEqual(['DeepSeek', 'Anthropic'])
    // Right column shows only the current provider's models.
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['DeepSeek-V4-Flash', 'DeepSeek-V4-Pro'])
  })

  it('switches the right column when another provider is selected', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Flash/ })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio', { name: /Claude/ })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Anthropic' }))
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['Claude Sonnet', 'Claude Opus'])
    expect(screen.queryByRole('menuitemradio', { name: /DeepSeek-V4/ })).toBeNull()
  })

  it('selects a model from the right column and lands on the active provider', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection, groups: multi().groups }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Anthropic' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Claude Opus/ }))

    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'anthropic',
        model: 'claude-opus',
      })
    })
  })

  it('lands the right column on the first provider when the current selection is not advertised', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'voyager', model: 'gone' },
      groups: multi().groups,
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    // Fallback: first advertised group (DeepSeek) fills the right column.
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent))
      .toEqual(['DeepSeek-V4-Flash', 'DeepSeek-V4-Pro'])
  })

  it('exposes the active provider and its model list to assistive tech', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))

    const activeProvider = screen.getByRole('menuitem', { name: 'DeepSeek' })
    expect(activeProvider.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Anthropic' }).getAttribute('aria-current'))
      .toBeNull()
    // The provider names its model group through aria-controls.
    const controls = activeProvider.getAttribute('aria-controls') ?? ''
    const group = controls.length > 0 ? document.getElementById(controls) : null
    expect(group).not.toBeNull()
    expect(group?.getAttribute('role')).toBe('group')
    expect(group?.getAttribute('aria-label')).toBe('DeepSeek')
    // The right column carries the provider's models.
    expect(group?.textContent).toContain('DeepSeek-V4-Flash')
  })

  it('shows a provider-empty message only for the active group without models', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'empty', model: 'x' },
      groups: [
        { id: 'empty', name: 'Empty', models: [] },
        { id: 'full', name: 'Full', models: [{ id: 'm1', name: 'Model-One' }] },
      ],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))

    // The active (empty) provider renders the empty message, not the full one.
    expect(screen.getByText('没有可用的模型。')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }))
    expect(screen.queryByText('没有可用的模型。')).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'Model-One' })).toBeTruthy()
  })

  it('falls back to the first advertised provider when a refresh drops the active one', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    const { rerender } = render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Flash/ })).toBeTruthy()

    // Refresh answers without DeepSeek; the pane must land on the new first
    // group rather than leave the right column blank.
    directory.set(state({
      current: { provider: 'anthropic', model: 'claude-sonnet' },
      groups: [{
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-sonnet', name: 'Claude Sonnet' },
          { id: 'claude-opus', name: 'Claude Opus' },
        ],
      }],
    }))
    rerender(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)
    expect(screen.getByRole('menuitemradio', { name: /Claude Sonnet/ })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio', { name: /DeepSeek-V4/ })).toBeNull()
  })

  it('navigates providers and selects a model with the keyboard', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multi())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection, groups: multi().groups }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))

    // Arrow keys move across the flattened menuitem set: providers then the
    // active provider's models.
    const deepseek = screen.getByRole('menuitem', { name: 'DeepSeek' })
    deepseek.focus()
    fireEvent.keyDown(deepseek, { key: 'ArrowDown' })
    const anthropic = screen.getByRole('menuitem', { name: 'Anthropic' })
    expect(document.activeElement).toBe(anthropic)
    // ArrowDown past the last provider reaches the active group's first model.
    fireEvent.keyDown(anthropic, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('DeepSeek-V4-Flash')
    // ArrowDown again reaches the active group's second model (not the current
    // selection, so choosing it must submit).
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('DeepSeek-V4-Pro')
    fireEvent.click(document.activeElement as HTMLElement)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      })
    })
  })
})

describe('ModelSelect visibility filtering', () => {
  const visibility = (hiddenIds: readonly string[]): SnapshotStore<ModelVisibilityState> =>
    createSnapshotStore<ModelVisibilityState>({
      status: 'ready',
      error: null,
      hidden: new Map([['deepseek-official', new Set(hiddenIds)]]),
    })

  it('hides profiles that are configured as not visible', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ],
      }],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      visibility={visibility(['deepseek-v4-pro'])}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' })).toBeNull()
  })

  it('keeps the current selection listed even when hidden', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ],
      }],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      visibility={visibility(['deepseek-v4-flash'])}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
    // The hidden current selection is still checked (aria-checked stays true).
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })
      .getAttribute('aria-checked')).toBe('true')
  })

  it('shows the empty message when the active provider advertises no models', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [],
      }],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      visibility={visibility([])}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    // A provider with no models renders the existing empty message.
    expect(screen.getByText('没有可用的模型。')).toBeTruthy()
  })

  it('re-renders immediately when the visibility store changes', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'flash', name: 'Flash' },
          { id: 'pro', name: 'Pro' },
        ],
      }],
    }))
    const visibilityStore = createSnapshotStore<ModelVisibilityState>({
      status: 'ready', error: null, hidden: new Map(),
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      visibility={visibilityStore}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.getByRole('menuitemradio', { name: 'Pro' })).toBeTruthy()

    // A document update hides Pro behind the scenes; the open menu reflects it
    // without any load/refresh.
    visibilityStore.set({ status: 'ready', error: null, hidden: new Map([['deepseek-official', new Set(['pro'])]]) })
    await waitFor(() => {
      expect(screen.queryByRole('menuitemradio', { name: 'Pro' })).toBeNull()
    })
    expect(screen.getByRole('menuitemradio', { name: 'Flash' })).toBeTruthy()
  })

  it('shows the empty message when every model in the provider is hidden', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'other', model: 'elsewhere' },
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'flash', name: 'Flash' },
          { id: 'pro', name: 'Pro' },
        ],
      }],
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      visibility={visibility(['flash', 'pro'])}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue(true)}
      t={t}
    />)

    fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    // Both models hidden and neither is the current selection → empty message.
    expect(screen.queryByRole('menuitemradio')).toBeNull()
    expect(screen.getByText('没有可用的模型。')).toBeTruthy()
  })
})
