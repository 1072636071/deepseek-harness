/**
 * Provider model visibility: the client-side reader over the settings profile.
 *
 * Visibility is a per-model boolean stored beside that model in its provider's
 * settings profile `models` array (absence reads as visible). The profile is a
 * schema-validated document the Host owns; Schemastery keeps unknown fields on
 * a non-strict object, and the settings mutate/describe transport preserves
 * them, so no Host catalog change is needed. Built-in routes with no `models`
 * array contribute nothing and read as all-visible.
 *
 * This directory derives the hidden-model set from the settings describe
 * mirror and the configurable-provider directory, publishing one reactive
 * snapshot the session selectors read when rendering the catalog. It is a pure
 * selector over those two sources: the one `settings.describe` reader stays
 * the mirror, and the provider→(namespace,path) mapping comes from the LLM
 * directory the Host already reports.
 */

import type { JsonValue, LlmConfigurableProvider, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** The reactive visibility directory the session selectors read. */
export interface ModelVisibilityState {
  /** Whether the last derivation completed without a settings-read failure. */
  status: 'loading' | 'ready' | 'error'
  /** Whole-derivation failure text; null while none. */
  error: string | null
  /** Provider route id → the model ids that provider's profile hides. */
  hidden: ReadonlyMap<string, ReadonlySet<string>>
}

/** The described configuration a provider directory entry names. */
interface ConfigurableWithNs extends LlmConfigurableProvider {
  /** The namespace view the entry's settingsNs resolved to, when it exists. */
  view: SettingsNamespaceView | undefined
}

/**
 * Resolve the provider directory against the settings mirror, pairing each
 * entry with the namespace view its settingsNs names. Providers whose
 * namespace is absent keep an undefined view (treated as all-visible).
 * @param providers - the Host-reported configurable-provider directory.
 * @param describe - the settings describe face (shared mirror snapshot).
 */
export function joinVisibilityDirectory(
  providers: readonly LlmConfigurableProvider[],
  describe: SettingsDescribeFace,
): readonly ConfigurableWithNs[] {
  const snapshot = describe.getSnapshot()
  const byNs = new Map<string, SettingsNamespaceView>()
  for (const view of snapshot.view?.namespaces ?? []) byNs.set(view.ns, view)
  return providers.map(entry => ({
    ...entry,
    view: byNs.get(entry.settingsNs),
  }))
}

/**
 * Read the ids the profile's `models` array hides. A provider with no `models`
 * array contributes nothing (built-in catalog reads all-visible); a model is
 * hidden only when its entry carries an explicit `visible: false`.
 * @param entry - one configurable provider paired with its namespace view.
 * @returns the profile-hidden model ids for that provider.
 */
export function hiddenModelsOf(entry: ConfigurableWithNs): ReadonlySet<string> {
  if (entry.view === undefined) return new Set()
  const models = pathOf(entry.view.value, [...entry.settingsPath, 'models'])
  if (!Array.isArray(models)) return new Set()
  const hidden = new Set<string>()
  for (const row of models) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue
    const visible = (row as Record<string, unknown>)['visible']
    if (visible === false) {
      const id = (row as Record<string, unknown>)['id']
      if (typeof id === 'string' && id.length > 0) hidden.add(id)
    }
  }
  return hidden
}

/** Walk a JSON-shaped value through a path; undefined for a missing segment. */
function pathOf(value: JsonValue, path: readonly string[]): unknown {
  let at: JsonValue | undefined = value
  for (const key of path) {
    if (typeof at !== 'object' || at === null || Array.isArray(at)) return undefined
    at = (at as Record<string, JsonValue | undefined>)[key]
    if (at === undefined) return undefined
  }
  return at
}

/**
 * The shared visibility directory for one Host generation. Publishes the
 * hidden-model set derived from the settings mirror and the provider
 * directory, refreshed when either source changes.
 */
export class ModelVisibilityDirectory {
  /** The reactive snapshot selectors read. */
  readonly store: SnapshotStore<ModelVisibilityState> = createSnapshotStore<ModelVisibilityState>({
    status: 'loading',
    error: null,
    hidden: new Map(),
  })

  private readonly unsubscribeMirror: () => void
  private readonly loadProviders: () => Promise<readonly LlmConfigurableProvider[]>
  private readonly onChange: () => void
  private providers: readonly LlmConfigurableProvider[] = []
  private generation = 0
  private disposed = false

  /**
   * @param loadProviders - fetches the Host configurable-provider directory.
   * @param describe - the settings describe face (shared mirror snapshot).
   * @param onChange - a callback when the derived hidden set changes, so the
   * caller can trigger a catalog-aware refresh.
   */
  constructor(
    loadProviders: () => Promise<readonly LlmConfigurableProvider[]>,
    private readonly describe: SettingsDescribeFace,
    onChange: () => void,
  ) {
    this.loadProviders = loadProviders
    this.onChange = onChange
    this.unsubscribeMirror = describe.subscribe(() => { if (this.derive()) onChange() })
    this.derive()
    void this.refresh()
  }

  /**
   * Refresh the provider directory and re-derive. Settles once the current
   * derivation is reflected.
   * @returns settlement of the fetch and derivation.
   */
  async refresh(): Promise<void> {
    if (this.disposed) return
    const generation = ++this.generation
    try {
      const providers = await this.loadProviders()
      if (this.disposed || generation !== this.generation) return
      this.providers = providers
      if (this.derive()) this.onChange()
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.store.set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        hidden: this.store.getSnapshot().hidden,
      })
    }
  }

  /**
   * Re-derive the hidden set from the current sources, notifying listeners
   * exactly when it changes.
   * @returns whether the published hidden set changed.
   */
  private derive(): boolean {
    if (this.disposed) return false
    const snapshot = this.describe.getSnapshot()
    const previous = this.store.getSnapshot().hidden
    if (snapshot.view === undefined) {
      // No answer yet: stay in the initial loading posture until the mirror
      // either resolves or reports a definite failure. A failure is published
      // as an error so the caller can distinguish it from an unreadied read.
      if (snapshot.error !== null) {
        this.store.set({ status: 'error', error: snapshot.error, hidden: new Map() })
        return previous.size !== 0
      }
      return false
    }
    const derived = new Map<string, ReadonlySet<string>>()
    for (const entry of joinVisibilityDirectory(this.providers, this.describe)) {
      const ids = hiddenModelsOf(entry)
      if (ids.size > 0) derived.set(entry.provider, ids)
    }
    this.store.set({ status: 'ready', error: null, hidden: derived })
    return !hiddenSetsEqual(previous, derived)
  }

  /** Scope teardown: stop deriving from the mirror and fetching providers. */
  dispose(): void {
    this.disposed = true
    this.generation += 1
    this.unsubscribeMirror()
  }
}

/** Whether two hidden-model key sets carry the same provider→ids relation. */
function hiddenSetsEqual(
  a: ReadonlyMap<string, ReadonlySet<string>>,
  b: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (a.size !== b.size) return false
  for (const [provider, ids] of a) {
    const other = b.get(provider)
    if (other === undefined || other.size !== ids.size) return false
    for (const id of ids) if (!other.has(id)) return false
  }
  return true
}
