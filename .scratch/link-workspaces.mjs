/** One-off: print mklink /J commands linking every workspace @deepseek-ai package into root node_modules. */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const links = join(root, 'node_modules', '@deepseek-ai')
const manifests = []
for (const base of ['packages', 'vendor', 'apps', 'native']) {
  for (const entry of readdirSync(join(root, base))) {
    const dir = join(root, base, entry)
    if (!dir.startsWith(links) && existsSync(join(dir, 'package.json'))) manifests.push(join(dir, 'package.json'))
    let children = []
    try { children = readdirSync(dir) } catch { continue }
    for (const child of children) {
      const pj = join(dir, child, 'package.json')
      if (existsSync(pj)) manifests.push(pj)
    }
  }
}
for (const pj of manifests) {
  let m
  try { m = JSON.parse(readFileSync(pj, 'utf8')) } catch { continue }
  if (typeof m.name !== 'string' || !m.name.startsWith('@deepseek-ai/')) continue
  const target = join(links, m.name.slice('@deepseek-ai/'.length))
  if (existsSync(target)) continue
  const pkgDir = resolve(pj, '..')
  process.stdout.write(`mklink /J "${target.replaceAll('/', '\\')}" "${pkgDir.replaceAll('/', '\\')}"\n`)
}
