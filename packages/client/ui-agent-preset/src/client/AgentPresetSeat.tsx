/**
 * The agent-preset row on the new-session screen, beside the workspace
 * picker.
 *
 * It lives here rather than in the composer because the choice is only
 * available before a conversation starts: once a turn has run, the session's
 * history was produced under that preset's tools and the host refuses to swap
 * them. A control that spends most of its life disabled belongs on the screen
 * where it still works.
 *
 * Every selectable preset is its own button, so the row states the whole
 * roster at once and the pressed one is where the next session starts. The row
 * opens on the staged choice, which starts as the deployment default. Picking
 * stages; the choice reaches a session when one becomes current.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the hero seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentPresetSeatState } from './seat-store.ts'
import { presetDisplayText } from './locales.ts'
import { requiresCodingTools } from './settings-store.ts'
import css from './AgentPresetSeat.module.css'

/** Registration-side business face for the hero row. */
export interface AgentPresetSeatInjected {
  hooks: {
    /** Shared Developer tools preference; off hides the PTC and Minimal buttons. */
    developerTools: ObservableSnapshot<boolean>
    /** Seat snapshot bound by the renderer as useAgentPresetSeat. */
    agentPresetSeat: SnapshotStore<AgentPresetSeatState>
  }
  /** Read the roster when the row first renders. */
  load: () => Promise<void>
  /** Stage one preset for the next session; resolves to a refusal, or undefined. */
  select: (id: string) => Promise<string | undefined>
  /** Acknowledge the refusal whose Toast finished. */
  dismissRefusal: (error: AgentPresetSeatState['error']) => void
  /** Clear the one-shot introduce cue once the pressed button has played it. */
  introduced: () => void
}

/* Introduce timeline: the pressed button's characters fade up on a stagger,
   each taking the fade duration to settle. The cue clears after the last one.
   The stagger is capped twice: per tick for short CJK names, and by one shared
   reveal window so a long Latin name finishes in the same time as its CJK
   counterpart instead of dragging the run out per character. */
const INTRO_CHAR_STAGGER_MS = 40
const INTRO_TEXT_REVEAL_MS = 200
const INTRO_CHAR_FADE_MS = 400

/** Duration of a selection-refusal banner, including a revision becoming unavailable during a pick. */
const REFUSAL_HOLD_MS = 8000

/**
 * Per-character start offset for the introduce reveal.
 * @param count - character count of the shown preset name.
 * @returns milliseconds between successive character starts.
 */
function introStaggerMs(count: number): number {
  if (count <= 1) return 0
  return Math.min(INTRO_CHAR_STAGGER_MS, INTRO_TEXT_REVEAL_MS / (count - 1))
}

/** Full component props. */
export type AgentPresetSeatProps =
  PropsRuntime<'conversation.hero.agentPreset'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSeatInjected>

/**
 * Render the new-session agent-preset row.
 * @param props - composed slot props.
 * @returns The row and any pending selection refusal, or null outside the main view.
 */
export function AgentPresetSeat({
  sessionId, useSessionRetainInfo, load, select, dismissRefusal, introduced, useAgentPresetSeat, useDeveloperTools, t,
}: AgentPresetSeatProps) {
  const developerTools = useDeveloperTools(value => value)
  const state = useAgentPresetSeat(snapshot => snapshot)
  const main = useSessionRetainInfo(info => sessionId === undefined
    || (info?.retainedBy.mainView ?? 0) > 0)
  // The seq keys the banner, so picking the same broken preset twice replays
  // it rather than leaving the first one silently in place.
  const toastSeq = useRef(0)
  const [toast, setToast] = useState<{ seq: number; error: Exclude<AgentPresetSeatState['error'], string | null> } | null>(null)

  useEffect(() => {
    if (state.error !== null && typeof state.error === 'object') {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, error: state.error })
    } else setToast(null)
  }, [state.error])

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo(
    () => state.options.filter(option => developerTools || !requiresCodingTools(option)),
    [state.options, developerTools],
  )

  const chosen = state.options.find(option => option.id === state.current)
  const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)
  const label = chosenText?.name ?? state.current
  const ready = state.options.length > 0 && state.current !== ''
  // The row must never leave the reader guessing which composition the next
  // session gets, so the staged preset stays on screen even when the visible
  // roster does not list it — because Coding Tools hid it, or because the
  // roster has not caught up with a pick staged elsewhere. Pinned: shown, not
  // selectable.
  const pinned = state.current === '' || options.some(option => option.id === state.current)
    ? undefined
    : chosen ?? { id: state.current }

  // The introduce cue: the pick was staged from another screen (the settings
  // creator entry), so the pressed button announces it — each character of the
  // name fades up on a stagger (CSS owns the motion; this effect only arms it
  // and acknowledges the cue once the run is over).
  const [introducing, setIntroducing] = useState(false)
  useEffect(() => {
    if (!state.introduce || !ready) return
    const characters = Array.from(label)
    if (characters.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      introduced()
      return
    }
    setIntroducing(true)
    const done = window.setTimeout(() => {
      setIntroducing(false)
      introduced()
    }, (characters.length - 1) * introStaggerMs(characters.length) + INTRO_CHAR_FADE_MS)
    return () => { window.clearTimeout(done) }
  }, [state.introduce, ready, label, introduced])

  // A refused initial composition still needs its Toast when there is no row to show.
  if (!main) return null

  const refusal = typeof state.error === 'object' ? state.error?.reason : state.error

  /**
   * Render one preset as a button; the pressed one carries the introducer.
   * @param option - the preset this button names.
   * @param pinned - true for the current preset Coding Tools hides: shown, not selectable.
   * @returns the button element.
   */
  const optionButton = (option: { id: string }, pinned: boolean) => {
    const text = presetDisplayText(option, t)
    const active = option.id === state.current
    const characters = Array.from(text.name)
    const stagger = introStaggerMs(characters.length)
    return (
      <button
        key={option.id}
        type="button"
        className={css.option}
        aria-pressed={active}
        disabled={state.busy || pinned}
        title={text.description ?? t('noDescription')}
        onClick={() => {
          if (active) return
          void select(option.id)
        }}
      >
        {active && introducing
          ? (
            <span className={css.introText}>
              {characters.map((character, index) => (
                <span
                  key={index}
                  className={css.introChar}
                  style={{ animationDelay: `${index * stagger}ms` }}
                >
                  {character}
                </span>
              ))}
            </span>
          )
          : text.name}
      </button>
    )
  }

  return (
    <>
      {ready && (
        <div
          className={css.row}
          role="group"
          aria-label={t('seatHint')}
          title={refusal ?? undefined}
          data-agent-preset-row=""
        >
          {options.map(option => optionButton(option, false))}
          {pinned === undefined ? null : optionButton(pinned, true)}
        </div>
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={t('switchRefused', { name: presetDisplayText(toast.error.preset, t).name, reason: toast.error.reason })}
          icon={<IconWarningOutlineRegular />}
          holdMs={REFUSAL_HOLD_MS}
          // The composer card, which is the content column this row sits
          // above rather than inside — hence a page query, not `closest`.
          // Absent, the banner centers on the window, which is off-center
          // whenever the sidebar is open.
          anchor={document.querySelector<HTMLElement>('[data-composer-card]')}
          onDone={() => { dismissRefusal(toast.error) }}
        />
      )}
    </>
  )
}
