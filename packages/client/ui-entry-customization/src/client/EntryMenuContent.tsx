/** Sidebar panel rows with pin toggles, folded Conversation Views, and the plugin discovery and Creator actions. */
import {
  IconCheckOutlineRegular, IconPinFillRegular, IconPinOutlineRegular, IconPluginPinwheelOutlineRegular, IconPlusOutlineRegular,
  MenuItemButton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelActionEntry } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './EntryMenu.module.css'

/** Navigation region whose More menu hosts one registration. */
export type EntryRegion = 'sidebar' | 'conversation' | 'rightbar'

/** Region identity and footer actions injected into each registration. */
export interface EntryMenuInjected {
  /** Region of this registration; selects analytics attributes and the Creator prompt. */
  readonly region: EntryRegion
  /** Open the Plugins main list. */
  readonly browsePlugins: () => void
  /** Start a Creator draft with this region's prompt without sending it. */
  readonly createPlugin: () => void
}

// The three region owners declare the same fields; the sidebar's slot names them.
type EntryMenuContentProps = PropsRuntime<'sidebar.panellist.actions'>
  & PropsLocale<'entryCustomization'> & InjectFace<EntryMenuInjected>

/** One panel row: its label, its active mark, and the click that opens it. */
function EntryRow({ entry, onOpen, onDismiss }: {
  readonly entry: SidebarPanelActionEntry
  readonly onOpen: (id: string) => void
  readonly onDismiss: () => void
}) {
  return (
    <MenuItemButton current={entry.active === true} onSelect={() => { onDismiss(); onOpen(entry.id) }}>
      <span className={css.entryName}>
        <span className={css.entryTitle}>{entry.label}</span>
        {entry.active === true && <IconCheckOutlineRegular size={16} className={css.activeMark} />}
      </span>
    </MenuItemButton>
  )
}

/** A panel row's pin toggle, kept beside the row button so opening the panel stays the row's own click. */
function PinToggle({ entry, onPinnedChange, t }: {
  readonly entry: SidebarPanelActionEntry
  readonly onPinnedChange: (id: string, pinned: boolean) => void
  readonly t: PropsLocale<'entryCustomization'>['t']
}) {
  return (
    <button
      type="button"
      className={css.pinToggle}
      aria-pressed={entry.pinned}
      aria-label={t(entry.pinned ? 'unpin' : 'pin', { panel: entry.label })}
      onClick={() => { onPinnedChange(entry.id, !entry.pinned) }}
    >
      {entry.pinned ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />}
    </button>
  )
}

/**
 * Render the region's More menu rows: the sidebar lists every global panel with a pin toggle, the
 * Conversation menu lists folded Views without pin controls, and the guide menu lists neither.
 * @param props - Owner dismissal and pin callbacks, injected actions, and localized copy.
 * @returns Menu rows for the region's More menu.
 */
export function EntryMenuContent({
  entries, onOpen, onPinnedChange, region, onDismiss, browsePlugins, createPlugin, t,
}: EntryMenuContentProps) {
  const moreEntries = region === 'rightbar' ? [] : entries
  return <>
    {moreEntries.map(entry => region === 'sidebar'
      ? (
        <div key={entry.id} className={css.panelRow}>
          <EntryRow entry={entry} onOpen={onOpen} onDismiss={onDismiss} />
          <PinToggle entry={entry} onPinnedChange={onPinnedChange} t={t} />
        </div>
      )
      : <EntryRow key={entry.id} entry={entry} onOpen={onOpen} onDismiss={onDismiss} />)}
    <MenuItemButton separatorBefore={moreEntries.length > 0} icon={<IconPluginPinwheelOutlineRegular size={16} />}
      onSelect={() => { onDismiss(); browsePlugins() }}>
      {t('install')}
    </MenuItemButton>
    <MenuItemButton icon={<IconPlusOutlineRegular size={16} />} onSelect={() => { onDismiss(); createPlugin() }}>
      {t('create')}
    </MenuItemButton>
  </>
}
