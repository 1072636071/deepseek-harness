/**
 * ModelDirectoryResolver (`ctx.modelDirectories`): the root owner of per-session
 * {@link ModelDirectory} instances. Both selection entries (the /model popup
 * and the composer model seat) resolve their session's directory through
 * this service, which is what makes the dual entry one shared state.
 *
 * Per-session storage follows the client service pattern (InputTriggerService /
 * CommandUiRuntime): a lazy service-internal map whose entry is deleted by the
 * owning scope's disposer. The host `dsh-scope` ScopedLayers registry does
 * does not belong here: it derives scope from the host carrier mechanism
 * (object-keyed), while client scopes tag contexts with branded SessionId
 * strings, and it models global+shadow named registries — this is a
 * per-session singleton with no global layer to merge.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ModelCatalogDirectory } from './catalog.ts'
import { ModelDirectory } from './directory.ts'
import { ModelVisibilityDirectory } from './visibility.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelDirectories: ModelDirectoryResolver
  }
}

/** Live mutable state in one holder (service methods run behind the caller-ctx tracker). */
interface LiveState {
  /** Per-session directories; entries are deleted by their scope disposer. */
  readonly directories: Map<SessionId, ModelDirectory>
}

/** The cordis service surfaces the resolver constructor reads to build its stores. */
export interface ModelDirectoryResolverFaces {
  /** Session wire and the shared LLM/settings/connection faces it reads. */
  remote: {
    session: import('@deepseek-ai/dsh-api-remotes/client').ClientRemote['session']
    llm: Pick<import('@deepseek-ai/dsh-api-remotes/client').ClientRemote['llm'], 'listConfigurableProviders'>
  }
  /** The settings scope's describe face over the shared mirror. */
  settingsScope: {
    describe(): import('@deepseek-ai/dsh-client-ui-settings/client').SettingsDescribeFace
  }
}

/** The `ctx.modelDirectories` session model-selection service. */
export class ModelDirectoryResolver extends Service {
  static inject = ['sessions', 'remote', 'remote.session', 'remote.llm', 'settingsScope']

  private readonly live: LiveState = { directories: new Map() }
  private readonly catalog: ModelCatalogDirectory
  private visibility: ModelVisibilityDirectory | null = null

  /** The shared provider-model-visibility directory (settings-derived hidden set). */
  get modelVisibility(): ModelVisibilityDirectory | null {
    return this.visibility
  }

  /** Localized composer-block copy; this plugin owns the string it raises. */
  private readonly blockReason: () => string

  /**
   * @param ctx - owning root context (the service registers itself as `models`).
   * @param config - the bound translator for this plugin's own dictionary.
   */
  constructor(ctx: Context & ModelDirectoryResolverFaces, config: { blockReason: () => string }) {
    super(ctx, 'modelDirectories')
    this.blockReason = config.blockReason
    this.catalog = new ModelCatalogDirectory(ctx.remote.session)
    // The visibility directory derives the settings-hidden set from the
    // configurable-provider directory and the settings mirror, publishing it
    // on its own store. Consumers (the composer seat) subscribe to that store
    // directly, so a hidden-set change needs no catalog reload: the catalog
    // carries no visibility, and provider-directory changes already refresh
    // the catalog through their own forwarding events.
    this.visibility = new ModelVisibilityDirectory(
      () => ctx.remote.llm.listConfigurableProviders().then(
        response => response.ok ? response.value : Promise.reject(new Error(response.error.message)),
      ),
      ctx.settingsScope.describe(),
    )
    // Unsubscribe the mirror and stop refresh once this service's fiber goes:
    // the visibility directory owns no independent teardown site.
    ctx.effect(() => () => { this.visibility?.dispose() }, 'ui-model-selection: visibility teardown')
    void this.catalog.load().catch(() => { /* selectors expose the shared error */ })
    ctx.on('connection/reset', () => {
      this.catalog.resetGeneration()
      for (const directory of this.live.directories.values()) directory.resetConnected()
    })
    ctx.remote.$on('llm/adapters-updated', () => {
      this.catalog.refresh()
      void this.visibility?.refresh()
    })
    ctx.remote.$on('settings/document-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('credentials/reference-updated', () => { this.catalog.refresh() })
  }

  /**
   * Resolve the per-session shared directory (lazy; the scope disposer
   * removes and disposes it). Unknown sessions fail loud.
   * @param sessionId - the owning session.
   * @returns the resident directory both entries share.
   */
  directoryFor(sessionId: SessionId): ModelDirectory {
    const { live } = this
    const existing = live.directories.get(sessionId)
    if (existing !== undefined) return existing
    const sessions = this.ctx.sessions
    const actx = sessions.scope(sessionId)
    if (actx === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`)
    const binding = sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`)
    const directory = new ModelDirectory(
      this.ctx.remote.session,
      sessionId,
      () => sessions.subagentAddress(sessionId) === undefined,
      this.catalog,
      binding.session.projections.faceOf('modelSelection'),
    )
    live.directories.set(sessionId, directory)
    // The composer cannot read this plugin (the dependency runs one way), so
    // the block is pushed: the Host says whether an adapter serves the
    // session's route, and only a definite `false` makes the input inert.
    // `null` — before the first load, or after one failed — must not, or a
    // slow or unreachable Host would lock a working composer.
    const conversation = this.ctx.get('conversation')
    if (conversation !== undefined) {
      const publish = (): void => {
        conversation.blocks.set(sessionId, directory.store.getSnapshot().routable === false
          ? { reason: this.blockReason() }
          : undefined)
      }
      publish()
      actx.effect(() => {
        const stop = directory.store.subscribe(publish)
        return () => {
          stop()
          conversation.blocks.set(sessionId, undefined)
        }
      }, 'ui-model-selection: composer block')
    }
    actx.effect(() => () => {
      directory.dispose()
      live.directories.delete(sessionId)
    }, 'ui-model-selection: session directory')
    return directory
  }
}
