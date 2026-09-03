/**
 * Cross-plugin settings navigation (`ctx.uiSettingsNav`). The settings shell
 * lives in a presentation package the settings base must not depend on, so an
 * entry that wants to land the user on a settings section — the composer's
 * model-config row — cannot reach the shell's modal state directly. It publishes
 * an open request here; the shell subscribes to the same store through its
 * inject face and applies it. Keeping the request here (an observable over the
 * base layer) satisfies the one-way layering rule: behavior crosses packages
 * through an injected service, not a value import.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/**
 * A pending request for the settings panel to open on one section.
 */
export interface SettingsNavRequest {
  /**
   * Monotonic id, so the shell can tell a fresh request from one it already
   * applied (a repeat click on the same section still carries a new seq).
   */
  readonly seq: number
  /** The `settings.section` key to land on; the shell falls back to the first row when it is gone. */
  readonly sectionId: string
}

/** The `ctx.uiSettingsNav` settings-navigation capability face. */
export interface UiSettingsNav {
  /** The observable pending-open request the settings shell reads. */
  readonly store: SnapshotStore<SettingsNavRequest | null>
  /**
   * Request that the settings panel open on one section.
   * @param sectionId - the settings.section key to navigate to.
   */
  openSection(sectionId: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin capability that opens the settings panel on a section. */
    uiSettingsNav: UiSettingsNav
  }
}

/**
 * Provides the settings-navigation capability over one observable open request.
 * The store starts empty (`null`); a published request stays readable until a
 * newer one replaces it, which is what lets a late-mounting shell still land
 * on the last requested section.
 */
export class UiSettingsNavService extends Service implements UiSettingsNav {
  readonly store = createSnapshotStore<SettingsNavRequest | null>(null)
  private seq = 0

  /** @param ctx - the providing plugin's context (registers as `uiSettingsNav`). */
  constructor(ctx: Context) {
    super(ctx, 'uiSettingsNav')
  }

  openSection(sectionId: string): void {
    this.store.set({ seq: ++this.seq, sectionId })
  }
}
