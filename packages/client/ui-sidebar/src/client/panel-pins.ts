/** In-memory pin choices for the global panel launchers. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

const NO_PANELS: readonly string[] = []

/** Pinned panel ids and their only mutation. */
export interface PanelPins {
  /** Pinned panel ids in choice order; every panel starts unpinned, and ids of panels that are not registered stay listed. */
  readonly pinned: ObservableSnapshot<readonly string[]>
  /**
   * Pin or unpin one panel launcher.
   * @param id - Panel id.
   * @param pinned - Whether the panel row joins the sidebar navigation.
   */
  readonly setPinned: (id: string, pinned: boolean) => void
}

/**
 * Create the in-memory pinned panel list; the snapshot keeps its reference until the list changes.
 * @returns Pinned panel ids and the pin mutation.
 */
export function createPanelPins(): PanelPins {
  const store = createSnapshotStore<{ readonly pinned: readonly string[] }>({ pinned: NO_PANELS })
  return {
    pinned: { getSnapshot: () => store.getSnapshot().pinned, subscribe: listener => store.subscribe(listener) },
    setPinned: (id, pinned) => {
      const current = store.getSnapshot().pinned
      if (pinned === current.includes(id)) return
      store.set({ pinned: pinned ? [...current, id] : current.filter(entry => entry !== id) })
    },
  }
}
