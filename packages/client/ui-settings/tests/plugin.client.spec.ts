import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { SettingsSchemaService } from '../src/client/schema.ts'
import { SettingsScopeBinder } from '../src/client/settings-scope.ts'
import { UiSettingsNavService } from '../src/client/settings-nav.ts'

function bench() {
  const describeCall = vi.fn().mockResolvedValue({
    ok: true, value: { writable: true, hasDocument: true, namespaces: [] },
  })
  const ctx = new Context()
  ctx.provide('connection', { api: {}, isLoopback: true } as never)
  const remote = new TestRemote(ctx, { settings: { describe: describeCall } })
  return { ctx, describeCall, remote, fiber: ctx.plugin({ inject: [...inject], apply }) }
}

describe('settings domain base plugin', () => {
  it('mounts the scope service under settingsScope and reads once eagerly', async () => {
    const { ctx, describeCall, fiber } = bench()
    await fiber.await()
    expect(ctx.get('settingsScope')).toBeInstanceOf(SettingsScopeBinder)
    expect(ctx.get('settingsSchema')).toBeInstanceOf(SettingsSchemaService)
    await vi.waitFor(() => { expect(describeCall).toHaveBeenCalledTimes(1) })
  })

  it('refreshes the mirror on document commits and connection resets, once each', async () => {
    const { ctx, describeCall, remote, fiber } = bench()
    await fiber.await()
    await vi.waitFor(() => { expect(describeCall).toHaveBeenCalledTimes(1) })
    remote.emit('settings/document-updated', ['ui-test', 0])
    await vi.waitFor(() => { expect(describeCall).toHaveBeenCalledTimes(2) })
    ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(describeCall).toHaveBeenCalledTimes(3) })
  })

  it('fiber disposal retires the service and its invalidation subscriptions', async () => {
    const { ctx, describeCall, remote, fiber } = bench()
    await fiber.await()
    await vi.waitFor(() => { expect(describeCall).toHaveBeenCalledTimes(1) })
    await fiber.dispose()
    expect(ctx.get('settingsScope')).toBeUndefined()
    expect(ctx.get('settingsSchema')).toBeUndefined()
    remote.emit('settings/document-updated', ['ui-test', 0])
    ctx.emit('connection/reset')
    await Promise.resolve()
    expect(describeCall).toHaveBeenCalledTimes(1)
  })
})

describe('uiSettingsNav capability', () => {
  it('is provided as a settings-navigation service and publishes a monotonic open request', async () => {
    const { ctx, fiber } = bench()
    await fiber.await()
    const nav = ctx.get('uiSettingsNav')
    expect(nav).toBeInstanceOf(UiSettingsNavService)
    expect(nav?.store.getSnapshot()).toBeNull()

    const seen: unknown[] = []
    const unsubscribe = nav!.store.subscribe(() => { seen.push(nav!.store.getSnapshot()) })
    nav!.openSection('models')
    nav!.openSection('plugins')
    unsubscribe()

    expect(seen).toEqual([
      { seq: 1, sectionId: 'models' },
      { seq: 2, sectionId: 'plugins' },
    ])
    // The last request stays readable so a late-mounting shell still lands on it.
    expect(nav!.store.getSnapshot()).toEqual({ seq: 2, sectionId: 'plugins' })
  })

  it('is retired with the fiber (HMR safety)', async () => {
    const { ctx, fiber } = bench()
    await fiber.await()
    expect(ctx.get('uiSettingsNav')).toBeInstanceOf(UiSettingsNavService)
    await fiber.dispose()
    expect(ctx.get('uiSettingsNav')).toBeUndefined()
  })
})
