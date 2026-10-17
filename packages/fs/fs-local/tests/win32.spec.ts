/** Host-independent binding tests for the Win32 DACL and replacement helpers. */

import { toNamespacedPath } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type GetFileSecurityW = (
  path: string,
  requestedInformation: number,
  descriptor: Buffer | null,
  length: number,
  needed: [number],
) => number
type SetFileSecurityW = (path: string, securityInformation: number, descriptor: Buffer) => number
type ReplaceFileW = (
  replaced: string,
  replacement: string,
  backup: null,
  flags: number,
  exclude: null,
  reserved: null,
) => number

interface NativeMock {
  getFileSecurityW: GetFileSecurityW
  setFileSecurityW: SetFileSecurityW
  replaceFileW: ReplaceFileW
  getLastError: () => number
}

async function importWithNative(native: NativeMock): Promise<typeof import('../src/win32.ts')> {
  vi.resetModules()
  vi.doMock('koffi', () => ({
    default: {
      load: () => ({
        func: (definition: string) => {
          if (definition.includes('GetFileSecurityW')) return native.getFileSecurityW
          if (definition.includes('SetFileSecurityW')) return native.setFileSecurityW
          if (definition.includes('ReplaceFileW')) return native.replaceFileW
          if (definition.includes('GetLastError')) return native.getLastError
          throw new Error(`unexpected native function: ${definition}`)
        },
      }),
    },
  }))
  return import('../src/win32.ts')
}

function successfulNative(descriptor: Buffer): NativeMock & { installed: Buffer[]; replacements: string[][] } {
  let lastError = 0
  const installed: Buffer[] = []
  const replacements: string[][] = []
  return {
    installed,
    replacements,
    getLastError: () => lastError,
    getFileSecurityW: (_path, _requested, output, _length, needed) => {
      needed[0] = descriptor.length
      if (output === null) {
        lastError = 122
        return 0
      }
      descriptor.copy(output)
      lastError = 0
      return 1
    },
    setFileSecurityW: (_path, information, value) => {
      expect(information).toBe(0x80000004)
      installed.push(Buffer.from(value))
      lastError = 0
      return 1
    },
    replaceFileW: (replaced, replacement, backup, flags, exclude, reserved) => {
      expect([backup, flags, exclude, reserved]).toEqual([null, 0, null, null])
      replacements.push([replaced, replacement])
      lastError = 0
      return 1
    },
  }
}

afterEach(() => {
  vi.doUnmock('koffi')
  vi.resetModules()
})

describe('Windows file-security helpers', () => {
  it('reads and installs a protected DACL before replacing the destination', async () => {
    const descriptor = Buffer.from([1, 2, 3, 4])
    const native = successfulNative(descriptor)
    const { copyFileDaclWin32, readFileDaclWin32, replaceFileWin32 } = await importWithNative(native)

    expect(await readFileDaclWin32('source')).toEqual(descriptor)
    await copyFileDaclWin32('source', 'temp')
    expect(native.installed).toEqual([descriptor])
    await replaceFileWin32('target', 'temp')
    expect(native.replacements).toEqual([[toNamespacedPath('target'), toNamespacedPath('temp')]])
  })

  it('maps descriptor-size probe failures to Node-style codes', async () => {
    const cases = [[2, 'ENOENT'], [3, 'ENOENT'], [5, 'EACCES'], [9999, 'EIO']] as const
    for (const [win32Code, code] of cases) {
      const native = successfulNative(Buffer.from([1]))
      native.getFileSecurityW = (_path, _requested, _output, _length, needed) => {
        needed[0] = 0
        return 0
      }
      native.getLastError = () => win32Code
      const { readFileDaclWin32 } = await importWithNative(native)
      await expect(readFileDaclWin32('source')).rejects.toMatchObject({ code, win32Code, path: 'source' })
    }
  })

  it('surfaces a descriptor read failure after the size probe', async () => {
    const native = successfulNative(Buffer.from([1, 2]))
    native.getFileSecurityW = (_path, _requested, _output, _length, needed) => {
      needed[0] = 2
      return 0
    }
    native.getLastError = () => 5
    const { readFileDaclWin32 } = await importWithNative(native)

    await expect(readFileDaclWin32('source')).rejects.toMatchObject({ code: 'EACCES', syscall: 'GetFileSecurityW' })
  })

  it('surfaces DACL installation and replacement failures', async () => {
    const setFailure = successfulNative(Buffer.from([1]))
    setFailure.setFileSecurityW = () => 0
    setFailure.getLastError = () => 5
    const setModule = await importWithNative(setFailure)
    await expect(setModule.copyFileDaclWin32('source', 'temp')).rejects.toMatchObject({
      code: 'EACCES',
      syscall: 'SetFileSecurityW',
      path: 'temp',
    })

    const replaceFailure = successfulNative(Buffer.from([1]))
    replaceFailure.replaceFileW = () => 0
    replaceFailure.getLastError = () => 2
    const replaceModule = await importWithNative(replaceFailure)
    await expect(replaceModule.replaceFileWin32('target', 'temp')).rejects.toMatchObject({
      code: 'ENOENT',
      syscall: 'ReplaceFileW',
      path: 'target',
    })
  })
})

/**
 * Transient-replacement retry policy.
 *
 * A sharing conflict on the replaced file is normal on Windows (an indexer, antivirus
 * scanner, or a just-closed handle whose teardown has not completed), the documented
 * remedy is to retry, and `ReplaceFileW` is atomic — a failure leaves both the target
 * and the closed staging file intact, so a retry re-attempts the same swap with no
 * content rewrite. Measured before the fix: 5/40 and 16/60 sequential atomic writes
 * failed with 1175, and every failure succeeded on an immediate retry.
 */
describe('Windows replacement retry policy', () => {
  /** Native mock whose `replaceFileW` fails with `failures` transient errors, then succeeds. */
  function flakyNative(failures: number, win32Code: number): NativeMock & { calls: () => number; errors: () => number } {
    const native = successfulNative(Buffer.from([1]))
    let calls = 0
    let lastError = 0
    native.getLastError = () => lastError
    native.replaceFileW = () => {
      calls++
      if (calls <= failures) {
        lastError = win32Code
        return 0
      }
      lastError = 0
      return 1
    }
    return { ...native, calls: () => calls, errors: () => lastError }
  }

  it('retries a transient conflict and succeeds without rewriting content', async () => {
    const native = flakyNative(2, 1175) /* ERROR_UNABLE_TO_REMOVE_REPLACED */
    const { replaceFileWin32 } = await importWithNative(native)

    await expect(replaceFileWin32('target', 'temp')).resolves.toBeUndefined()
    expect(native.calls()).toBe(3)
  })

  it('retries every transient sharing code, not just 1175', async () => {
    for (const code of [32 /* ERROR_SHARING_VIOLATION */, 33 /* ERROR_LOCK_VIOLATION */, 1175]) {
      const native = flakyNative(1, code)
      const { replaceFileWin32 } = await importWithNative(native)
      await expect(replaceFileWin32('target', 'temp')).resolves.toBeUndefined()
      expect(native.calls(), `code ${code} was not retried`).toBe(2)
    }
  })

  it('surfaces the transient code after the bounded attempts are exhausted', async () => {
    const native = flakyNative(Number.POSITIVE_INFINITY, 1175)
    const { replaceFileWin32 } = await importWithNative(native)

    await expect(replaceFileWin32('target', 'temp')).rejects.toMatchObject({
      code: 'EIO',
      win32Code: 1175,
      syscall: 'ReplaceFileW',
      path: 'target',
    })
    // Bounded: one initial attempt plus four retries, never an unbounded loop.
    expect(native.calls()).toBe(5)
  })

  it('does not retry a permanent failure', async () => {
    for (const code of [2 /* ERROR_FILE_NOT_FOUND */, 5 /* ERROR_ACCESS_DENIED */]) {
      const native = flakyNative(Number.POSITIVE_INFINITY, code)
      const { replaceFileWin32 } = await importWithNative(native)
      await expect(replaceFileWin32('target', 'temp')).rejects.toMatchObject({ win32Code: code })
      expect(native.calls(), `code ${code} must not be retried`).toBe(1)
    }
  })
})
