/** Copy for the More menu rows: navigation actions, pin toggles, and Creator draft prompts per region. */
export const en = {
  install: 'Browse other plugins',
  create: 'Create your plugin',
  pin: 'Pin {panel} to the sidebar',
  unpin: 'Unpin {panel} from the sidebar',
  'createPrompt.sidebar': 'Create a DSH plugin with a left sidebar entry.',
  'createPrompt.conversation': 'Create a DSH conversation view plugin.',
  'createPrompt.rightbar': 'Create a DSH plugin with a right sidebar entry.',
} as const

/** Chinese counterpart of the entry-customization dictionary. */
export const zh: Record<keyof typeof en, string> = {
  install: '浏览更多插件',
  create: '创建你的插件',
  pin: '将「{panel}」固定到侧边栏',
  unpin: '取消固定「{panel}」',
  'createPrompt.sidebar': '创建一个带左侧栏入口的 DSH 插件。',
  'createPrompt.conversation': '创建一个 DSH 会话视图插件。',
  'createPrompt.rightbar': '创建一个带右侧栏入口的 DSH 插件。',
}
