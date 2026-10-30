import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  treeRowKeys, type FolderHeaderNode, type GroupNode, type SessionNode,
} from '../src/client/tree.ts'

const sid = (id: string): SessionId => id as SessionId

function row(id: string, blank = false): SessionNode {
  return {
    id: sid(id), title: id, blank, running: false, runningSubagentCount: 0,
    completed: false, pinned: false, archived: false, updatedAt: 0,
  }
}

function group(key: string, sessions: readonly SessionNode[], expanded: boolean): GroupNode {
  return {
    key, workspaceId: undefined, cwd: undefined, createdAt: undefined, label: key,
    sessionCount: sessions.length, status: 'inactive', expanded, containsCurrent: false, sessions,
  }
}

const folder = (folderId: string, expanded: boolean): FolderHeaderNode => ({
  folderId, title: folderId, workspaceIds: [], expanded,
})

/** Build the single input shape the Session tree feeds {@link treeRowKeys}. */
function keys(options: {
  groups: readonly GroupNode[]
  children?: ReadonlyMap<string | undefined, readonly GroupNode[]>
  folderMode?: boolean
  sections?: readonly { folder: FolderHeaderNode; groups: readonly GroupNode[] }[]
  loose?: readonly GroupNode[]
  watermark?: (key: string) => number
  baseline?: (key: string) => number
}): string[] {
  return treeRowKeys({
    groups: options.groups,
    childrenByParent: options.children ?? new Map([[undefined, options.groups]]),
    folderMode: options.folderMode ?? false,
    sections: options.sections ?? [],
    loose: options.loose ?? [],
    watermarkOf: options.watermark ?? (() => 5),
    baselineOf: options.baseline ?? (() => 5),
  })
}

describe('treeRowKeys', () => {
  it('reports the empty-state row when no group renders', () => {
    expect(keys({ groups: [] })).toEqual(['empty'])
  })

  it('renders no row when no group reaches the root of a non-folder tree', () => {
    const orphan = group('orphan', [row('orphan-1')], true)
    expect(keys({ groups: [orphan], children: new Map() })).toEqual([])
  })

  it('keeps a nested Workspace between its parent header and the parent rows', () => {
    const child = group('child', [row('child-1')], true)
    const parent = group('parent', [row('parent-1')], true)
    const children = new Map<string | undefined, readonly GroupNode[]>([
      [undefined, [parent]],
      ['parent', [child]],
    ])
    expect(keys({ groups: [parent, child], children })).toEqual([
      'workspace:parent', 'workspace:child', 'session:child-1', 'session:parent-1',
    ])
  })

  it('keeps a folded Workspace header alone because deriveGroups hands it no rows', () => {
    const folded = group('folded', [], false)
    expect(keys({ groups: [folded] })).toEqual(['workspace:folded'])
  })

  it('renders the overflow row after the group rows when the baseline truncates them', () => {
    const open = group('open', [row('a'), row('b'), row('c')], true)
    expect(keys({ groups: [open], watermark: () => 2, baseline: () => 2 })).toEqual([
      'workspace:open', 'session:a', 'session:b', 'overflow:open',
    ])
  })

  it('admits the blank row plus the raised watermark of ordinary rows', () => {
    const sessions = [row('blank', true), row('s1'), row('s2'), row('s3')]
    const open = group('open', sessions, true)
    expect(keys({ groups: [open], watermark: () => 1, baseline: () => 2 })).toEqual([
      'workspace:open', 'session:blank', 'session:s1', 'overflow:open',
    ])
  })

  it('leads each folder section with its header and skips a folded folder members', () => {
    const first = group('first', [row('first-1')], true)
    const second = group('second', [row('second-1')], true)
    const loose = group('loose', [row('loose-1')], true)
    expect(keys({
      groups: [first, second, loose],
      folderMode: true,
      sections: [
        { folder: folder('f1', true), groups: [first] },
        { folder: folder('f2', false), groups: [second] },
      ],
      loose: [loose],
    })).toEqual([
      'folder:f1', 'workspace:first', 'session:first-1',
      'folder:f2',
      'workspace:loose', 'session:loose-1',
    ])
  })
})
