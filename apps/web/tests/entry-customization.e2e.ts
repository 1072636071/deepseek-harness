/** Default-loaded entry controls activate through the real Web profile and Loader. */
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold, type WebConsoleTripwire } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

describe('default navigation entry customization', () => {
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let tripwire: WebConsoleTripwire

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  })

  afterAll(async () => {
    try { await browser?.close() } finally { await scaffold?.close() }
  })

  it('keeps only More in the navigation and pins panel rows back through its menu', async () => {
    onTestFailed(() => saveFailureShot(page, 'entry-customization'))
    const nav = page.getByRole('navigation', { name: 'Global panels' })
    const more = nav.getByRole('button', { name: 'More', exact: true })
    for (const reload of [false, true]) {
      if (reload) {
        // Pin choices live in memory, so a reload returns every panel row to the menu.
        await page.reload({ waitUntil: 'load' })
      }
      await more.waitFor()
      expect(await nav.getByRole('button').count()).toBe(1)
      await more.click()
      const menu = page.getByRole('menu')
      const tasks = menu.getByRole('menuitem', { name: 'Automation tasks', exact: true })
      await tasks.waitFor()
      expect(await menu.getByRole('menuitem').allTextContents())
        .toEqual(['Plugins', 'Automation tasks', 'Browse other plugins', 'Create your plugin'])
      expect(await menu.getByRole('separator').count()).toBe(1)
      // The pin control is its own button: it toggles the row without opening the panel.
      await menu.getByRole('button', { name: 'Pin Plugins to the sidebar', exact: true }).click()
      expect(await menu.getByRole('button', { name: 'Unpin Plugins from the sidebar', exact: true }).getAttribute('aria-pressed')).toBe('true')
      expect(await nav.getByRole('button', { name: 'Plugins', exact: true }).count()).toBe(1)
      await tasks.click()
      await page.getByRole('heading', { name: 'Automation tasks', exact: true }).waitFor()
      await more.click()
      await tasks.waitFor()
      expect(await tasks.getAttribute('aria-current')).toBe('page')
      await menu.getByRole('menuitem', { name: 'Browse other plugins', exact: true }).click()
      await menu.waitFor({ state: 'detached' })
      await page.getByRole('heading', { name: 'Plugins', exact: true }).waitFor()
    }
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
