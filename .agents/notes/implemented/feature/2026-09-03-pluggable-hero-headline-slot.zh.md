# Agent Note: Pluggable hero headline slot

Status: implemented

## Problem

新会话空态的大标题（「探索未之之境」/ "Into the Unknown"）在空态 hero 里直接渲染 `hero.headline` 这个 locale key。外部角色插件（dsh-web-ui-jx）无法替换它，但这句标题恰恰是角色插件应该拥有的文案。该位置没有任何扩展点，而 dsh 的 slot 机制是单向的：slot 的声明与渲染点必须住在宿主代码里，插件自己永远造不出一个会被渲染的槽。

## Decision

`ui-conversation` 在 `conversation.hero.brand.mark` 旁声明一个 `conversation.hero.headline` slot（single、root 作用域）。空态 hero 经 `renderSlot` 渲染标题，fallback 在原样式节点内渲染现有 `hero.headline` key。不新增任何 locale key。无占用者时渲染结果与之前完全一致，既有的五处骨架断言原样通过。占用者自带文案（时段问候、角色台词）——问候逻辑与文案都留在宿主之外。

## Alternatives considered

- 插件 client 侧 DOM 劫持：标题 class 是 CSS module 哈希名，只能按可见文案匹配，切语言即失效，且把插件与宿主 DOM 结构强耦合。否决。
- 把问候逻辑搬进 `ui-conversation`、用户名从角色插件的存储读取：逻辑劈在两个仓库，还要跨仓库读配置。否决。
- 角色插件只在气泡里问候：宿主零改动，但用户要的正是大标题这个位置。否决。

## Consequences

宿主永久多出一个已声明的 slot，`ui-conversation` 的公开 slot 面扩大一项。角色插件因此新增对宿主 conversation 包的 peer 依赖——与 `ui-brand-official` 占用 brand-mark 席位的依赖方向一致。fallback 使宿主测试与 client-UI-i18n 门禁零改动；带 fallback 开席位是当下最便宜的契约，日后撤掉该席位即是破坏性变更。
