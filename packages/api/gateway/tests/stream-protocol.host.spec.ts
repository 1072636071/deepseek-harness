import { describe, expect, it } from 'vitest'
import {
  parseRemoteStreamClientMessage,
  parseRemoteStreamServerFrame,
  parseRemoteStreamServerMessage,
} from '../src/stream-protocol.ts'

describe('Remote stream wire protocol', () => {
  it('accepts every client message variant', () => {
    expect(parseRemoteStreamClientMessage(JSON.stringify({
      type: 'open', streamId: 'stream-1', endpoint: 'feed/follow', payload: { cursor: 1 },
    }))).toEqual({
      type: 'open', streamId: 'stream-1', endpoint: 'feed/follow', payload: { cursor: 1 },
    })
    expect(parseRemoteStreamClientMessage(JSON.stringify({
      type: 'cancel', streamId: 'stream-1',
    }))).toEqual({ type: 'cancel', streamId: 'stream-1' })
  })

  it.each([
    { type: 'open', streamId: '', endpoint: 'feed/follow', payload: {} },
    { type: 'open', streamId: 'stream-1', endpoint: '', payload: {} },
    { type: 'open', streamId: 'stream-1', endpoint: 'feed/follow' },
    { type: 'cancel', streamId: 'stream-1', extra: true },
    { type: 'unknown', streamId: 'stream-1' },
  ])('rejects an invalid client message: %j', (message) => {
    expect(() => parseRemoteStreamClientMessage(JSON.stringify(message)))
      .toThrow('api gateway: invalid Remote stream client message')
  })

  it('accepts every server message variant', () => {
    expect(parseRemoteStreamServerMessage(JSON.stringify({
      type: 'item', streamId: 'stream-1', value: null,
    }))).toEqual({ type: 'item', streamId: 'stream-1', value: null })
    expect(parseRemoteStreamServerMessage(JSON.stringify({
      type: 'item', streamId: 'stream-1',
    }))).toEqual({ type: 'item', streamId: 'stream-1' })
    expect(parseRemoteStreamServerMessage(JSON.stringify({
      type: 'error',
      streamId: 'stream-1',
      error: { code: 'offline', message: 'connection lost', details: {} },
    }))).toEqual({
      type: 'error',
      streamId: 'stream-1',
      error: { code: 'offline', message: 'connection lost', details: {} },
    })
    expect(parseRemoteStreamServerMessage(JSON.stringify({
      type: 'end', streamId: 'stream-1',
    }))).toEqual({ type: 'end', streamId: 'stream-1' })
  })

  it.each([
    { type: 'item', streamId: '', value: 'item' },
    { type: 'item', streamId: 'stream-1', extra: true },
    { type: 'end', streamId: 'stream-1', extra: true },
    { type: 'error', streamId: 'stream-1', error: [] },
    { type: 'error', streamId: 'stream-1', error: { code: 1, message: 'failure', details: {} } },
    { type: 'error', streamId: 'stream-1', error: { code: 'failed', message: 1, details: {} } },
    { type: 'error', streamId: 'stream-1', error: { code: 'failed', message: 'failure', details: [] } },
    { type: 'unknown', streamId: 'stream-1' },
  ])('rejects an invalid server message: %j', (message) => {
    expect(() => parseRemoteStreamServerMessage(JSON.stringify(message)))
      .toThrow('api gateway: invalid Remote stream server message')
  })

  it.each(['not json', 'null', '[]', '1'])('rejects a non-message payload: %s', (text) => {
    expect(() => parseRemoteStreamServerMessage(text)).toThrow('api gateway: Remote stream message')
  })

  it('accepts a coalesced batch of logical frames and rejects a malformed member', () => {
    const members = [
      JSON.stringify({ type: 'item', streamId: 'stream-1', value: 1 }),
      JSON.stringify({ type: 'end', streamId: 'stream-2' }),
    ]
    expect(parseRemoteStreamServerMessage(JSON.stringify({ type: 'batch', frames: members })))
      .toEqual({ type: 'batch', frames: members })
    expect(parseRemoteStreamServerFrame(members[0] as string))
      .toEqual({ type: 'item', streamId: 'stream-1', value: 1 })

    // Outer batch validation checks only member fields (non-empty strings);
    // member content is enforced when each frame is parsed.
    expect(parseRemoteStreamServerMessage(JSON.stringify({
      type: 'batch', frames: [JSON.stringify({ type: 'batch', frames: [] })],
    }))).toEqual({ type: 'batch', frames: [JSON.stringify({ type: 'batch', frames: [] })] })
    expect(() => parseRemoteStreamServerFrame(JSON.stringify({ type: 'batch', frames: [] })))
      .toThrow('api gateway: invalid Remote stream server message')
    expect(() => parseRemoteStreamServerFrame('not json'))
      .toThrow('api gateway: Remote stream message')
    expect(() => parseRemoteStreamServerMessage(JSON.stringify({ type: 'batch', frames: [] })))
      .toThrow('api gateway: invalid Remote stream server message')
    expect(() => parseRemoteStreamServerMessage(JSON.stringify({ type: 'batch', frames: 'nope' })))
      .toThrow('api gateway: invalid Remote stream server message')
  })
})
