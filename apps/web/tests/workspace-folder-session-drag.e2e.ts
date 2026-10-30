/** Session-row reorder inside one Workspace rendered under a folder header. */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const TITLES = ['Newest conversation', 'Middle conversation', 'Oldest conversation']

describe('web e2e: folder-mode session drag', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const fixture = await readFile(SEED, 'utf8')
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    const now = Date.now()
    const ids = []
    for (const [index, title] of TITLES.entries()) {
      const id = await seedSession(scaffold, fixture, `folder-drag-${index}`, undefined, {
        createdAt: now - (index + 1) * 60_000,
      })
      await workspace.attachSession(id)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title })
      ids.push(id)
    }
    const secondCwd = join(scaffold.workspaceCwd, 'second-ws')
    await mkdir(secondCwd)
    const secondWorkspace = await scaffold.ctx.workspaceRegistry.create(secondCwd)
    const folders = await scaffold.ctx.workspaceFolders.create({ title: 'Group one' })
    const folderId = folders.folders[0]!.folderId
    await scaffold.ctx.workspaceFolders.setMembership({ workspaceId: workspace.id, folderId })
    await scaffold.ctx.workspaceFolders.setMembership({ workspaceId: secondWorkspace.id, folderId })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.clock.setFixedTime(now)
    tripwire = watchConsole(page)
    await page.addInitScript(({ account, ids }) => {
      if (localStorage.getItem('dsh.workspace.view.v5') !== null) return
      localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: ids[0] }))
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({
        groupBy: 'folder', orderBy: 'updated', groupExpansion: { [account]: true },
        sessionOrderByAccount: { [account]: [...ids].reverse(), __flat_session_order__: [...ids].reverse() },
      }))
    }, { account: workspace.id, ids })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('reorders two session rows under a folder section', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-folder-session-drag'))
    const titles = () => page.locator('[role="treeitem"]:not([aria-expanded]) [class*="title"]').allTextContents()
    await page.getByRole('tree', { name: 'Sessions', exact: true }).getByText('Group one', { exact: true }).waitFor()
    await expect.poll(titles).toEqual(TITLES)
    const source = page.getByRole('treeitem').filter({ has: page.getByText(TITLES[2]!, { exact: true }) })
    const target = page.getByRole('treeitem').filter({ has: page.getByText(TITLES[0]!, { exact: true }) })
    await source.dragTo(target, { targetPosition: { x: 30, y: 3 } })
    const dragged = [TITLES[2], TITLES[0], TITLES[1]]
    await expect.poll(titles).toEqual(dragged)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('swaps adjacent rows when the pointer stays inside the near half', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-folder-session-drag-near-half'))
    const titles = () => page.locator('[role="treeitem"]:not([aria-expanded]) [class*="title"]').allTextContents()
    const row = (title: string) => page.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) })
    const start = [TITLES[2]!, TITLES[0]!, TITLES[1]!] as const
    await expect.poll(titles).toEqual(start)
    // Downward, released inside the next row's upper half: the pointer half alone
    // lands the row back on its own slot, which used to cancel the drop silently.
    await row(start[0]).dragTo(row(start[1]), { targetPosition: { x: 30, y: 3 } })
    const swapped = [start[1], start[0], start[2]] as const
    await expect.poll(titles).toEqual(swapped)
    // Upward, released inside the previous row's lower half.
    const box = await row(swapped[0]).boundingBox()
    if (box === null) throw new Error('missing session row box')
    await row(swapped[1]).dragTo(row(swapped[0]), { targetPosition: { x: 30, y: Math.round(box.height) - 3 } })
    await expect.poll(titles).toEqual([swapped[1], swapped[0], swapped[2]])
    expect(tripwire.pageErrors).toEqual([])
  })

  it('reorders adjacent Workspace rows inside a folder section', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-drag-folder'))
    const rows = () => page.locator('[data-row-key^="workspace:"]')
    const ids = async (): Promise<(string | null)[]> => rows().evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row-key')))
    const start = await ids()
    expect(start).toHaveLength(2)
    const source = page.locator('[data-row-key="' + start[0]! + '"]')
    const target = page.locator('[data-row-key="' + start[1]! + '"]')
    await source.dragTo(target, { targetPosition: { x: 40, y: 4 } })
    await expect.poll(ids).toEqual([start[1], start[0]])
    expect(tripwire.pageErrors).toEqual([])
  })

  it('reorders adjacent Workspace rows in the plain Workspace view', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-drag-plain'))
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('dsh.workspace.view.v5') ?? '{}') as Record<string, unknown>
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({ ...raw, groupBy: 'workspace' }))
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const ids = async (): Promise<(string | null)[]> => page.locator('[data-row-key^="workspace:"]')
      .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-row-key')))
    const start = await ids()
    expect(start).toHaveLength(2)
    const source = page.locator('[data-row-key="' + start[0]! + '"]')
    const target = page.locator('[data-row-key="' + start[1]! + '"]')
    await source.dragTo(target, { targetPosition: { x: 40, y: 4 } })
    await expect.poll(ids).toEqual([start[1], start[0]])
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps reordering after the folder folds and unfolds', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-folder-session-drag-folded'))
    // The Workspace-view case above leaves its own grouping persisted; return to folders.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('dsh.workspace.view.v5') ?? '{}') as Record<string, unknown>
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({ ...raw, groupBy: 'folder' }))
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const titles = () => page.locator('[role="treeitem"]:not([aria-expanded]) [class*="title"]').allTextContents()
    const folder = page.getByRole('treeitem').filter({ has: page.getByText('Group one', { exact: true }) })
    const start = await titles()
    expect(start).toHaveLength(3)
    await folder.click()
    await expect.poll(async () => (await titles()).length).toBe(0)
    await expect.poll(async () => folder.getAttribute('aria-expanded')).toBe('false')
    await folder.click()
    await expect.poll(titles).toEqual(start)
    // The row keys survive the fold, so the rows still animate and reorder.
    const row = (title: string) => page.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) })
    await row(start[0]!).dragTo(row(start[2]!), { targetPosition: { x: 30, y: 3 } })
    await expect.poll(titles).toEqual([start[1], start[0], start[2]])
    expect(tripwire.pageErrors).toEqual([])
  })
})
