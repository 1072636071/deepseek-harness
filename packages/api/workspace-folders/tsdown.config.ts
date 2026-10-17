import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-api-workspace-folders',
  ['lib/types/index.js'],
  { hostPhase: true },
)
