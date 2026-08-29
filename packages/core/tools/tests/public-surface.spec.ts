import { describe, expect, it } from 'vitest'
import * as tools from '@deepseek-ai/dsh-tools'

/**
 * Pin the package's runtime value-export surface. The 2026-08 module split
 * (view cache / result materialization / execution state / god-file split)
 * re-exported every declaration through the package root; this snapshot fails
 * if a value export is dropped, renamed, or accidentally added. Type-only
 * exports are erased at runtime and are covered by the host typecheck instead.
 */
describe('public value-export surface', () => {
  it('exposes exactly the pinned runtime exports', () => {
    expect(Object.keys(tools).sort()).toEqual([
      'CodeRunFailedError',
      'JsonSchemaError',
      'RUN_CODE_NAME',
      'TOOL_ABORTED',
      'TOOL_ABORTED_BEFORE_DISPATCH',
      'TOOL_RUNTIME_SCHEDULER',
      'ToolArgsError',
      'ToolNotFoundError',
      'ToolOutputError',
      'ToolRuntime',
      'assertObjectJsonSchema',
      'assertSupportedJsonSchema',
      'default',
      'defineContentToolFixture',
      'defineTool',
      'jsonSchemaToPy',
      'jsonSchemaToTs',
      'parameterSchemaSpecToJsonSchema',
      'renderToolsSdk',
      'renderToolsSdkPy',
      'validateArgs',
      'validateJsonSchemaValue',
      'valueSchemaSpecToJsonSchema',
    ])
  })
})
