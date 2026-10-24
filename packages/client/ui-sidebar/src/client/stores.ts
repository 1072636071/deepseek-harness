/**
 * Global panel list disclosure state: whether the rows past the pinned head
 * are open. Persisted per browser so a user who folds the list keeps it
 * folded; the pinned head itself is not state, it is the shell's layout
 * rhythm.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Panel-list viewing state. */
type PanelListState = {
  /** Whether the group holding the rows past the pinned head is open. */
  overflowExpanded: boolean
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type PanelListActions = {
  setOverflowExpanded: (draft: PanelListState, expanded: boolean) => void
}

/**
 * Create the panel-list disclosure store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createPanelListStore(): EngineStoreHandle<PanelListState, PanelListActions> {
  return defineStore({
    init: (): PanelListState => ({ overflowExpanded: false }),
    persist: 'dsh.sidebar.panels.v1',
    actions: {
      setOverflowExpanded: (d, expanded) => { d.overflowExpanded = expanded },
    },
  })
}
