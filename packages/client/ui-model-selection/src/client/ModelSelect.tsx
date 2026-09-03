/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron), each
 * drilling into its own list — the provider-grouped model list over the shared
 * directory, and the effort levels — plus an optional model-config row that hands
 * off to the settings panel when a navigation callback is injected. The trigger
 * (313:14108's ToggleButton) shows both: model name + effort in the caption
 * tone. Data and submission ride the SAME per-session ModelDirectory as the
 * /model popup; exact-model reasoning metadata and the selected effort come
 * from the Host rather than a client-owned vocabulary. A rejected selection
 * announces through the shared transient Toast anchored to the composer
 * card; the in-menu strip with Retry remains the catalog-load surface.
 */
import {
  useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type FocusEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelVisibilityState } from './visibility.ts'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'

/** Which pane the dropdown shows: the two-row root or one drilled-in list. */
type Pane = 'root' | 'model' | 'effort'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}

/** Shared empty set for "this provider hides nothing" lookups. */
const EMPTY_SET: ReadonlySet<string> = new Set()

/** Empty visibility store: a render without an injected visibility hides nothing. */
const EMPTY_VISIBILITY = createSnapshotStore<ModelVisibilityState>({
  status: 'ready', error: null, hidden: new Map(),
})

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export function ModelSelect(
  { locked, available, directory, visibility, load, select, openModelConfig, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  // The visibility snapshot (hidden model ids per provider); empty while the
  // settings scene is absent, so hiding only ever reflects a real configuration.
  const visibilityState = useSyncExternalStore(
    fn => visibility?.subscribe(fn) ?? EMPTY_VISIBILITY.subscribe(fn),
    () => (visibility ?? EMPTY_VISIBILITY).getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  // The provider whose models fill the right pane column. Reset to the current
  // selection's group (falling back to the first) every time the model pane
  // opens, so re-entering the list lands on the provider already in use.
  const [activeGroup, setActiveGroup] = useState<string | undefined>(undefined)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
      })),
    ], [reasoning, t])
  const busy = state.status === 'selecting'

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  // A catalog refresh may drop the provider the pane was showing; fall back to
  // the first advertised group rather than leaving the right column blank.
  useEffect(() => {
    if (activeGroup === undefined) return
    if (!state.groups.some(group => group.id === activeGroup)) {
      setActiveGroup(state.groups[0]?.id)
    }
  }, [state.groups, activeGroup])

  if (!available) return null

  const show = (): void => {
    setPane('root')
    setOpen(true)
    reload()
  }

  const openModelPane = (): void => {
    // Land the right column on the provider already serving this session,
    // when the catalog still carries it; otherwise the first advertised group.
    const current = state.current?.provider
    setActiveGroup(
      state.groups.some(group => group.id === current) ? current
        : state.groups[0]?.id,
    )
    setPane('model')
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      // Escape backs out of a drilled pane first, then closes.
      if (pane !== 'root') setPane('root')
      else close(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  const settleSelection = (accepted: boolean): void => {
    if (accepted) {
      if (rootRef.current !== null) close(true)
      return
    }
    const message = directory.getSnapshot().error
    if (message !== null) {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('error.action', { message }) })
    }
  }

  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const waiting = state.current === null && state.status === 'loading'
  const modelLabel = waiting
    ? t('trigger.loading')
    : currentChoice?.model.name
      ?? (state.current === null ? t('trigger.fallback') : `${state.current.provider}/${state.current.model}`)
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = waiting
    ? t('trigger.loading')
    : state.current === null
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  itemRefs.current = []
  let itemIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onRootKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) {
            close()
          } else {
            show()
          }
        }}
      >
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          className={css.menu}
          role="menu"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <>
              <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={openModelPane}>
                <span className={css.cellLabel}>{t('menu.model')}</span>
                <span className={css.cellValue}>{modelLabel}</span>
                <IconChevronRightOutline14 className={css.cellChevron} />
              </button>
              {reasoning !== undefined && (
                <button ref={itemRef()} type="button" role="menuitem" className={css.cell} onClick={() => { setPane('effort') }}>
                  <span className={css.cellLabel}>{t('menu.effort')}</span>
                  <span className={css.cellValue}>{effortLabel}</span>
                  <IconChevronRightOutline14 className={css.cellChevron} />
                </button>
              )}
              {/* The config row leaves the menu for the settings panel, so it
                  carries no drilled value; the empty cell keeps the chevron
                  right-aligned with the rows above. Absent navigation
                  capability hides the whole row (no dead control). */}
              {openModelConfig !== undefined && (
                <button
                  ref={itemRef()}
                  type="button"
                  role="menuitem"
                  className={css.cell}
                  onClick={() => {
                    close()
                    openModelConfig()
                  }}
                >
                  <span className={css.cellLabel}>{t('menu.config')}</span>
                  <span className={css.cellValue} />
                  <IconChevronRightOutline14 className={css.cellChevron} />
                </button>
              )}
            </>
          )}

          {pane === 'model' && (
            <>
              {state.status === 'loading' && (
                <div className={css.status}>{t('status.loading')}</div>
              )}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              )}
              {state.failures.map(failure => (
                <div className={css.warning} key={failure.id}>
                  <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                </div>
              ))}
              <div className={css.columns}>
                <div className={css.providerColumn}>
                  {state.groups.map((group) => {
                    const active = activeGroup === group.id
                    return (
                      <button
                        ref={itemRef()}
                        type="button"
                        role="menuitem"
                        aria-current={active ? 'true' : undefined}
                        aria-controls={`${id}-models-${group.id}`}
                        className={clsx(css.providerOption, active && css.providerActive)}
                        key={group.id}
                        onClick={() => { setActiveGroup(group.id) }}
                      >
                        <span className={css.providerName}>{group.name}</span>
                      </button>
                    )
                  })}
                </div>
                <div className={css.modelColumn}>
                  {(() => {
                    const activeGroupState = state.groups.find(group => group.id === activeGroup)
                    if (activeGroupState === undefined) {
                      return state.status === 'ready'
                        ? <div className={css.empty}>{t('empty.models')}</div>
                        : null
                    }
                    const hiddenModels = visibilityState.hidden.get(activeGroupState.id) ?? EMPTY_SET
                    // Visible = every advertised model except those hidden and
                    // not the current selection. The empty message follows the
                    // FILTERED count, so a provider whose models are all hidden
                    // (and none is the current selection) shows it too.
                    const visibleModels = activeGroupState.models.filter((model) => {
                      const selected = state.current?.provider === activeGroupState.id
                        && state.current.model === model.id
                      return !hiddenModels.has(model.id) || selected
                    })
                    const empty = state.status === 'ready' && visibleModels.length === 0
                      ? <div className={css.empty}>{t('empty.models')}</div>
                      : null
                    return (
                      <div id={`${id}-models-${activeGroupState.id}`} role="group" aria-label={activeGroupState.name}>
                        {visibleModels.map((model) => {
                          const selected = state.current?.provider === activeGroupState.id
                            && state.current.model === model.id
                          return (
                            <button
                              ref={itemRef()}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              className={clsx(css.option, selected && css.selected)}
                              key={model.id}
                              title={model.name}
                              disabled={busy}
                              onClick={() => {
                                choose({ provider: activeGroupState.id, model: model.id })
                              }}
                            >
                              <span className={css.optionCopy}>
                                <span className={css.modelName}>{model.name}</span>
                              </span>
                              <span className={css.check}>
                                {selected ? <IconCheckOutline16 /> : null}
                              </span>
                            </button>
                          )
                        })}
                        {empty}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </>
          )}

          {pane === 'effort' && (
            <>
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              {effortChoices.length === 0
                ? <div className={css.empty}>{t('empty.efforts')}</div>
                : effortChoices.map(level => (
                  <button
                    ref={itemRef()}
                    type="button"
                    role="menuitemradio"
                    aria-checked={effectiveEffort === level.effort}
                    className={clsx(css.option, effectiveEffort === level.effort && css.selected)}
                    key={level.key}
                    disabled={busy}
                    onClick={() => { chooseEffort(level.effort) }}
                  >
                    <span className={css.optionCopy}>
                      <span className={css.modelName}>{level.label}</span>
                    </span>
                    <span className={css.check}>
                      {effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}
                    </span>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
