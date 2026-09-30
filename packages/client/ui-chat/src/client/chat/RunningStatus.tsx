/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState } from 'react'
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { pickDeepDivingPhrase } from '../locale.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import { RunningWhaleTail } from './RunningWhaleTail.tsx'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

interface RunningStatusProps {
  readonly startTime: number | undefined
  /** Active locale id behind the deep-diving phrase pool; omitted renders the static copy. */
  readonly activeLocale?: (() => LocaleId) | undefined
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start time, active locale reader, and localized copy.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, activeLocale, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  // One playful phrase drawn at mount for the whole run; the per-second clock tick
  // re-renders but never re-draws it. A locale id without a bucket misses the pool
  // and keeps the static `chat.deepDiving` copy.
  const [phrase] = useState(() => activeLocale === undefined ? undefined : pickDeepDivingPhrase(activeLocale()))
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  const duration = startTime === undefined ? undefined
    : formatRunDuration(Math.max(1000, now - startTime), t).map(part => part.text).join('')
  const label = duration === undefined ? t('chat.deepDiving')
    : phrase === undefined ? t('chat.deepDivingFor', { duration })
      : t('chat.deepDivingPhraseFor', { phrase, duration })
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{phrase ?? t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
