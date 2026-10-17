/**
 * Windows security-descriptor helpers for atomic local-file replacement. Koffi loads lazily so
 * non-Windows processes never open Win32 libraries.
 * @module @deepseek-ai/dsh-fs-local/win32
 */

import { toNamespacedPath } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

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
type GetLastError = () => number

interface Win32Bindings {
  getFileSecurityW: GetFileSecurityW
  setFileSecurityW: SetFileSecurityW
  replaceFileW: ReplaceFileW
  getLastError: GetLastError
}

interface Win32ErrnoException extends NodeJS.ErrnoException {
  win32Code: number
}

const DACL_SECURITY_INFORMATION = 0x00000004
const PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000
const ERROR_FILE_NOT_FOUND = 2
const ERROR_PATH_NOT_FOUND = 3
const ERROR_ACCESS_DENIED = 5
/** ERROR_SHARING_VIOLATION — the replaced/staging file is still held open by another process. */
const ERROR_SHARING_VIOLATION = 32
/** ERROR_LOCK_VIOLATION — a byte-range lock still covers the replaced file. */
const ERROR_LOCK_VIOLATION = 33
/** ERROR_UNABLE_TO_REMOVE_REPLACED — the replaced file could not be unlinked during the swap. */
const ERROR_UNABLE_TO_REMOVE_REPLACED = 1175

/**
 * Win32 codes worth retrying: the replacement is refused because some other
 * process momentarily holds the replaced file (an indexer, antivirus scanner,
 * or a just-closed handle whose kernel teardown has not completed). On this
 * platform such sharing conflicts are transient by construction — the
 * documented remedy is to retry — and a failed `ReplaceFileW` leaves both the
 * target and the staging file intact, so a retry re-attempts the same swap
 * without rewriting any content.
 */
const TRANSIENT_REPLACE_CODES: ReadonlySet<number> = new Set([
  ERROR_SHARING_VIOLATION,
  ERROR_LOCK_VIOLATION,
  ERROR_UNABLE_TO_REMOVE_REPLACED,
])

/** Total `ReplaceFileW` attempts (1 initial + retries) before surfacing the failure. */
const REPLACE_ATTEMPTS = 5

/** Delay before retry N (0-based): 5ms, 10ms, 20ms, 40ms — bounded, no busy loop. */
function replaceRetryDelayMs(retryIndex: number): number {
  return 5 * 2 ** retryIndex
}

let bindings: Win32Bindings | undefined

async function win32(): Promise<Win32Bindings> {
  if (bindings !== undefined) return bindings
  const koffi = (await import('koffi')).default
  const advapi32 = koffi.load('advapi32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  bindings = {
    getFileSecurityW: advapi32.func('int __stdcall GetFileSecurityW(const char16_t *path, uint32_t requested, void *descriptor, uint32_t length, _Out_ uint32_t *needed)') as GetFileSecurityW,
    setFileSecurityW: advapi32.func('int __stdcall SetFileSecurityW(const char16_t *path, uint32_t information, const void *descriptor)') as SetFileSecurityW,
    replaceFileW: kernel32.func('int __stdcall ReplaceFileW(const char16_t *replaced, const char16_t *replacement, const char16_t *backup, uint32_t flags, void *exclude, void *reserved)') as ReplaceFileW,
    getLastError: kernel32.func('uint32_t __stdcall GetLastError()') as GetLastError,
  }
  return bindings
}

function errnoCode(win32Code: number): string {
  switch (win32Code) {
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
      return 'ENOENT'
    case ERROR_ACCESS_DENIED:
      return 'EACCES'
    default:
      return 'EIO'
  }
}

function win32Error(syscall: string, win32Code: number, path: string): Win32ErrnoException {
  const code = errnoCode(win32Code)
  const error = new Error(`${syscall} ${code} (Win32 ${win32Code}): ${path}`) as Win32ErrnoException
  error.code = code
  error.errno = win32Code
  error.syscall = syscall
  error.path = path
  error.win32Code = win32Code
  return error
}

/**
 * Read a file's self-relative DACL security descriptor.
 * @param path - existing file whose DACL is read.
 * @returns a descriptor buffer accepted by `SetFileSecurityW`.
 */
export async function readFileDaclWin32(path: string): Promise<Buffer> {
  const api = await win32()
  const nativePath = toNamespacedPath(path)
  const needed: [number] = [0]
  api.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, null, 0, needed)
  if (needed[0] === 0) throw win32Error('GetFileSecurityW', api.getLastError(), path)

  const descriptor = Buffer.alloc(needed[0])
  if (api.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, descriptor, descriptor.length, needed) === 0) {
    throw win32Error('GetFileSecurityW', api.getLastError(), path)
  }
  return descriptor.subarray(0, needed[0])
}

/**
 * Copy an existing file's DACL onto another file and protect it from staging-parent inheritance.
 * The destination must still be empty when confidentiality depends on this call.
 * @param source - existing file whose DACL is copied.
 * @param destination - existing file that receives the protected DACL.
 */
export async function copyFileDaclWin32(source: string, destination: string): Promise<void> {
  const descriptor = await readFileDaclWin32(source)
  const api = await win32()
  const information = (DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION) >>> 0
  if (api.setFileSecurityW(toNamespacedPath(destination), information, descriptor) === 0) {
    throw win32Error('SetFileSecurityW', api.getLastError(), destination)
  }
}

/**
 * Replace a Windows file while preserving the replaced file's ACL and other replace metadata.
 *
 * A sharing conflict on the replaced file is transient on Windows (an indexer, antivirus
 * scanner, or a just-closed handle still being torn down), so the documented remedy is to
 * retry. `ReplaceFileW` is atomic and all-or-nothing: when it fails, the target keeps its
 * original content and the closed staging file is still present, so a retry re-attempts the
 * same swap with no content rewrite. Only `TRANSIENT_REPLACE_CODES` are retried; every other
 * failure (a missing target, a denied path) is permanent and surfaces immediately.
 *
 * @param replaced - existing destination file.
 * @param replacement - closed staging file on the same volume.
 */
export async function replaceFileWin32(replaced: string, replacement: string): Promise<void> {
  const api = await win32()
  const nativeReplaced = toNamespacedPath(replaced)
  const nativeReplacement = toNamespacedPath(replacement)
  for (let attempt = 0; ; attempt++) {
    if (api.replaceFileW(nativeReplaced, nativeReplacement, null, 0, null, null) !== 0) return
    const win32Code = api.getLastError()
    if (attempt >= REPLACE_ATTEMPTS - 1 || !TRANSIENT_REPLACE_CODES.has(win32Code)) {
      throw win32Error('ReplaceFileW', win32Code, replaced)
    }
    await delay(replaceRetryDelayMs(attempt))
  }
}
