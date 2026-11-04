/** Coding Tools persist while Standard, Creator, and custom presets remain selectable when disabled. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, openSettings, newEnglishPage } from './support.ts'

it('persists Coding Tools and limits the built-in PTC and Minimal choices in sessions and Settings', async () => {
  const scaffold = await launchWebScaffold({
    agentPresets: { default: 'standard', definitions: [{ id: 'custom', name: 'Custom mode', plugins: [] }] },
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  const tripwire = watchConsole(page)
  const livePresets = async () => (await scaffold.ctx.sessionController.list({}, new AbortController().signal))
    .items.map(item => item.projections?.values.agentPreset)
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page, 'en')
  const toggle = page.getByRole('switch', { name: 'Show coding view' })
  expect(await toggle.getAttribute('aria-checked')).toBe('true')
  expect(await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')).not.toMatch(/id: ui-settings(?:\r?\n|$)/)
  await toggle.click()
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
  expect(await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')).toContain('enabled: false')
  await page.reload()
  await openSettings(page, 'en')
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')

  await page.getByRole('button', { name: 'Agent presets', exact: true }).click()
  await expect.poll(() => page.getByRole('heading', { name: 'Agent presets', exact: true }).count()).toBe(1)
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  expect(await settings.getByRole('switch').count()).toBe(0)
  const visiblePresets = () => settings.locator('[data-agent-preset-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-agent-preset-id')))
  await expect.poll(visiblePresets).toEqual(['standard', 'cordis', 'custom'])
  await settings.getByRole('button', { name: 'Set as new task default: Custom mode', exact: true }).click()
  await settings.getByRole('button', { name: 'New task default: Custom mode', exact: true }).waitFor()
  await scaffold.ctx.settings.update('ui-settings', { enabled: true })
  await expect.poll(visiblePresets).toEqual(['standard', 'ptc', 'minimal', 'cordis', 'custom'])
  expect((await scaffold.ctx.agentPresets.remoteExportList()).presets.find(preset => preset.isDefault)?.id).toBe('custom')
  await settings.getByRole('button', { name: 'Set as new task default: Minimal mode', exact: true }).click()
  await settings.getByRole('button', { name: 'New task default: Minimal mode', exact: true }).waitFor()
  await scaffold.ctx.settings.update('ui-settings', { enabled: false })
  await expect.poll(visiblePresets).toEqual(['standard', 'cordis', 'custom'])
  await settings.getByRole('button', { name: 'New task default: Standard mode', exact: true }).waitFor()
  await expect.poll(async () => (await scaffold.ctx.agentPresets.remoteExportList()).presets.find(preset => preset.isDefault)?.id).toBe('standard')
  await expect.poll(() => settings.getByRole('button', { name: 'Let the agent help me create a preset', exact: true }).isEnabled()).toBe(true)
  await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  await expect.poll(livePresets).toEqual(['standard'])

  const roster = page.getByRole('group', { name: 'Choose the agent preset for your new task', exact: true })
  await roster.waitFor()
  await expect.poll(() => roster.getByRole('button').count()).toBe(3)
  expect(await roster.getByRole('button', { name: /^(PTC|Minimal) mode$/ }).count()).toBe(0)
  expect(await roster.getByRole('button', { name: 'Custom mode', exact: true }).count()).toBe(1)
  await roster.getByRole('button', { name: 'Creator mode', exact: true }).click()
  await expect.poll(livePresets, { timeout: 15_000 }).toEqual(['cordis'])

  await scaffold.ctx.settings.update('ui-settings', { enabled: true })
  await expect.poll(() => roster.getByRole('button').count()).toBe(5)
  expect(await roster.getByRole('button', { name: 'PTC mode', exact: true }).count()).toBe(1)
  expect(await roster.getByRole('button', { name: 'Minimal mode', exact: true }).count()).toBe(1)
  expect(await livePresets()).toEqual(['cordis'])
  await scaffold.ctx.settings.update('ui-settings', { enabled: false })
  // The kept Creator preset is pinned rather than dropped, so the row still
  // reports what the running session composes.
  await expect.poll(() => roster.getByRole('button').count()).toBe(3)
  await expect.poll(() => roster.getByRole('button', { name: 'Creator mode', exact: true })
    .getAttribute('aria-pressed')).toBe('true')
  expect(await livePresets()).toEqual(['cordis'])
  await scaffold.ctx.settings.update('ui-settings', { enabled: true })
  await expect.poll(() => roster.getByRole('button').count()).toBe(5)
  await roster.getByRole('button', { name: 'PTC mode', exact: true }).click()
  await expect.poll(livePresets, { timeout: 15_000 }).toEqual(['ptc'])
  await scaffold.ctx.settings.update('ui-settings', { enabled: false })
  // PTC is now hidden, but it is what the blank session will run, so it stays on
  // the row pinned beside Standard, Creator, and the custom preset.
  await expect.poll(() => roster.getByRole('button').count()).toBe(4)
  await expect.poll(() => roster.getByRole('button', { name: 'PTC mode', exact: true })
    .isDisabled()).toBe(true)
  await expect.poll(() => roster.getByRole('button', { name: 'PTC mode', exact: true })
    .getAttribute('aria-pressed')).toBe('true')
  expect(await livePresets()).toEqual(['ptc'])
  await roster.getByRole('button', { name: 'Standard mode', exact: true }).click()
  await expect.poll(livePresets, { timeout: 15_000 }).toEqual(['standard'])

  await page.reload()
  // The sessionless preset row is replaced when the saved Session is restored.
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor()
  await expect.poll(() => page.getByRole('group', { name: 'Choose the agent preset for your new task', exact: true })
    .getByRole('button').count()).toBe(3)
  await openSettings(page, 'en')
  await settings.getByRole('button', { name: 'General', exact: true }).click()
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
  await settings.getByRole('button', { name: 'Agent presets', exact: true }).click()
  await expect.poll(visiblePresets).toEqual(['standard', 'cordis', 'custom'])
  await settings.getByRole('button', { name: 'New task default: Standard mode', exact: true }).waitFor()
  await settings.getByRole('button', { name: 'Let the agent help me create a preset', exact: true }).click()
  await settings.waitFor({ state: 'detached' })
  await expect.poll(livePresets, { timeout: 15_000 }).toContain('cordis')
  expect((await scaffold.ctx.agentPresets.remoteExportList()).presets.find(preset => preset.isDefault)?.id).toBe('standard')
  expect(tripwire.pageErrors).toEqual([])
})
