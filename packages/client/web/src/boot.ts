/**
 * Web boot kernel. It owns only the module system, Cordis loader, and a
 * framework-free boot page; plugin composition and the renderer handoff are
 * `bootClient` and `mountClient`. The dynamic UI renderer receives the mount
 * point after every client entry activates.
 * @module @deepseek-ai/dsh-client-web/src/boot
 */
import { Context } from '@deepseek-ai/cordis'
import type {
  BootManifest, ClientModuleCreateOptions, ClientModuleSystem, DshWindow,
} from '@deepseek-ai/dsh-client-modules/client'
import { bootClient } from './boot-client.ts'
import { BootPage } from './boot-page.ts'
import { mountClient } from './mount.ts'
import { getStaticModules } from './seed.ts'
import { installWindowDragRecall } from './window-drag/recall.ts'
import './base.css'

/** Module transport hook replaced by jsdom tests. */
export type BootSeams = Pick<ClientModuleCreateOptions, 'loadBundle' | 'resolveAsset'>

/** Per-tab marker of the one automatic reload already spent on an outdated document. */
const STALE_RELOAD_KEY = 'dsh.boot.stale-reload'

/** Whether this tab already reloaded once to replace an outdated client build. */
function staleReloadAttempted(): boolean {
  try {
    return globalThis.sessionStorage.getItem(STALE_RELOAD_KEY) !== null
  } catch {
    // Blocked storage cannot record attempts; this one counts as the first.
    return false
  }
}

/** Spend this tab's one automatic stale-client reload. */
function markStaleReload(): void {
  try {
    globalThis.sessionStorage.setItem(STALE_RELOAD_KEY, '1')
  } catch {
    // Blocked storage cannot hold the guard; the recovery button still reloads.
  }
}

/** Forget the guard after a successful boot, so a later rebuild can still reload this tab once. */
function clearStaleReloadGuard(): void {
  try {
    globalThis.sessionStorage.removeItem(STALE_RELOAD_KEY)
  } catch {
    // Blocked storage holds no guard to clear.
  }
}

/** Browser boot entry consumed by `apps/web`. */
export class AppWebEntry {
  private readonly container: HTMLElement
  private readonly seams: BootSeams | undefined
  private readonly page: BootPage
  private ctx: Context | undefined
  private stopDragRecall: (() => void) | undefined
  private booting = true
  private modules!: ClientModuleSystem
  private manifest!: BootManifest

  /**
   * Draw the boot page; {@link run} starts the loader.
   * @param container - Application mount point.
   * @param seams - Optional module transport replacement.
   */
  constructor(container: HTMLElement, seams?: BootSeams) {
    this.container = container
    this.seams = seams
    this.page = new BootPage(container)
  }

  /**
   * Load and activate every client entry, then hand the mount point to the
   * UI renderer. Plugin failures remain visible on the boot page.
   * @param onFailure - Optional carrier-owned fatal presentation; keeps the boot page visible.
   * @returns Resolves after application mount or failure reporting.
   */
  async run(onFailure?: (reason: unknown) => void): Promise<void> {
    try {
      // Boot-readiness gate: whichever bootstrap applies the injection table
      // settles this deferred once every row has taken effect — the served
      // index resolves it in the rendered tail, so the await returns on the
      // next microtask; an asynchronous bootstrap resolves it after its last
      // row, or rejects it into the failure rendering below. An absent global
      // means no bootstrap owns the document and there is nothing to wait for.
      await (globalThis as { __DSH_BOOT_READY__?: { promise: Promise<void> } }).__DSH_BOOT_READY__?.promise
      const win = globalThis as DshWindow
      const moduleLoader = win.__ModuleLoader__
      if (moduleLoader === undefined) {
        throw new Error('web boot: window.__ModuleLoader__ bootstrap facade is missing')
      }
      // A pre-injected transport (the worker preview page) owns bundle and asset
      // bytes; its loadBundle and resolveAsset are the defaults and explicit seams still win. The global
      // is `ClientTransportHooks`, owned by @deepseek-ai/dsh-client-connection;
      // this structural slice reads two optional members without adding a
      // package edge.
      const transport = (globalThis as {
        __DSH_TRANSPORT__?: Pick<ClientModuleCreateOptions, 'loadBundle' | 'resolveAsset'>
      }).__DSH_TRANSPORT__
      this.modules = moduleLoader.create({
        boot: win.__DSH_BOOT__,
        staticModules: getStaticModules(),
        ...transport?.loadBundle === undefined ? {} : { loadBundle: transport.loadBundle },
        ...transport?.resolveAsset === undefined ? {} : { resolveAsset: transport.resolveAsset },
        onTransportError: () => {
          this.offerStaleRecovery()
        },
        ...this.seams,
      })
      this.manifest = this.modules.manifest

      const prefetching = this.prefetchImmediateTier()
      const ctx = new Context()
      this.ctx = ctx
      this.page.setTotal(this.manifest.plugins.length)
      await prefetching
      await bootClient({
        ctx,
        modules: this.modules,
        manifest: this.manifest,
        onEntryState: (name, state) => {
          if (onFailure === undefined || state !== 'failed') this.page.setState(name, state)
        },
      })
      // The shell owns the one watcher that keeps Electron's window drag rects in
      // step with the rows that own them (electron#32341), so no chrome row has to
      // know that trap. It installs before the first mount, so the surface the
      // renderer draws is the one the first frame measures.
      this.stopDragRecall = installWindowDragRecall({ document: this.container.ownerDocument })
      await mountClient(ctx, this.container)
      this.booting = false
      clearStaleReloadGuard()
    } catch (reason) {
      console.error(reason)
      if (onFailure !== undefined) onFailure(reason)
      else this.page.fail(reason instanceof Error ? reason.message : String(reason))
    }
  }

  /** Dispose the client plugin tree and whichever page owns the mount point. */
  async dispose(): Promise<void> {
    this.booting = false
    this.stopDragRecall?.()
    this.stopDragRecall = undefined
    const ctx = this.ctx
    this.ctx = undefined
    if (ctx !== undefined) await ctx.fiber.dispose()
    this.page.dispose()
  }

  /**
   * Offer the reload that replaces a client build this page can no longer
   * load. A classic script element exposes no status or headers, so any
   * bundle transport failure during boot is reported as a possibly outdated
   * document. One automatic attempt per tab keeps an unreachable Host from
   * reloading forever; the notice's button stays available for the user.
   */
  private offerStaleRecovery(): void {
    // After the first mount the running application owns its own recovery;
    // a reload here would discard a live session.
    if (!this.booting) return
    const reload = (): void => { globalThis.location.reload() }
    this.page.staleClient(reload)
    if (staleReloadAttempted()) return
    markStaleReload()
    setTimeout(reload, 0)
  }

  /** Prefetch stage-one bundles and their dynamic requests before concurrent plugin imports. */
  private async prefetchImmediateTier(): Promise<void> {
    await Promise.all(this.manifest.plugins
      .filter(row => row.immediately)
      .map(row => this.modules.prefetch(row.id).catch((_prefetchError: unknown) => {
        // Prefetch only starts transport early; the Loader import retries and reports this bundle failure.
      })))
  }
}
