# PRD：hero 标题 slot 化——新会话大标题可被插件接管

**Status:** ready-for-agent

## 问题陈述

用户希望把新会话空态的大标题「探索未至之境」换成按时段 + 用户名的个性化问候语，并明确要求这一能力由外部角色插件（dsh-web-ui-jx）承载。

当前做不到：大标题由 `ui-conversation` 写死——locale key 直接渲染在空态 hero 组件里，没有任何 slot。dsh 的 slot 机制是单向的：声明与渲染点必须在宿主代码里，插件只能占用已存在的 slot。因此宿主必须先开一个槽，「可插拔」才有落点。

## 解决方案

在 `ui-conversation` 的 slot 注册表中新增一个 hero 标题 slot（single、root 作用域，与现有的 brand.mark / workspace / agentPreset 同类），渲染点改为经 renderSlot 输出，并提供**现有文案作为 fallback**。

效果：
- 没有任何插件占用时，界面与今天完全一致（「探索未至之境」）；
- 插件占用时显示插件文案；
- 插件卸载即自动回落，不残留空白标题。

## 用户故事

1. 作为插件作者，我想占用新会话大标题 slot，以便用我自己的文案替换「探索未至之境」。
2. 作为未安装任何占用插件的用户，我想看到原有的「探索未至之境」，以便界面不因缺少插件而发生任何变化。
3. 作为卸载了占用插件的用户，我想让标题自动回落到原文案，以便不残留空白或报错。
4. 作为维护者，我想让既有测试与 i18n 门禁零改动即可通过，以便宿主侧改动面收敛到最小。
5. 作为读屏用户，我想让标题保持为普通文本语义，以便读屏软件正常播报。
6. 作为未来要占用同一 slot 的其他插件作者，我想让占用方式与 brand.mark 完全同构，以便零学习成本。

## 实现决策

- 新增 slot `conversation.hero.headline`：kind `single`、scope `root`，声明在 `ui-conversation` 的 conversation slot children 里，与 `conversation.hero.brand.mark` 并列。
- 渲染点：空态 hero 的标题文本改为 `renderSlot` 调用；fallback 渲染现有 locale key `hero.headline` 的结果，包在原样式节点里。
- **不新增任何 locale key**。`hero.headline`（zh「探索未至之境」/ en "Into the Unknown"）原样保留，继续作为 fallback 文案来源。
- 「预览版」badge 不动——它是标题的兄弟节点，slot 只替换标题文本节点。
- 占用范式与 `conversation.hero.brand.mark` / `ui-brand-official` 完全一致（占用方反向 peerDep `ui-conversation`）。
- 时段判定、用户名、全部问候文案都在占用插件侧（见 dsh-web-ui-jx tracker 的 25 号 PRD），宿主不引入任何问候逻辑。

## 测试决策

- 既有空态骨架测试的 5 处「探索未至之境」断言必须原样通过——它们命中的就是 fallback，这条不变式同时验证「无占用者时行为零变化」。
- 新增行为测试：注册占用者后标题显示占用者文案；释放后回落 `hero.headline`。先例：brand.mark slot 的占用/回落测试。
- 回归面：空态各 phase（hero / settling / engaging）切换测试保持全绿，确认 slot 化没有改变 phase 判定。

## 超出范围

- 时段/用户名问候逻辑与文案（dsh-web-ui-jx tracker 25 号 PRD）。
- badge、hero 布局、glow 等任何视觉调整。
- 其他 hero 区域（workspace chip、agent preset）的 slot 化。

## 补充说明

- 决策与访谈全文：`docs/memorial/002-hero-greeting-personalization`（本仓库）与 dsh-web-ui-jx `docs/memorial/017-hero-greeting-and-new-session-lines`（含 ADR-0033）。
- 配套插件侧实现：dsh-web-ui-jx `.scratch/25-hero-greeting-and-new-session-lines/PRD.md`。本 PRD 是其前置依赖。
- 被否决的替代方案（client 侧 DOM 劫持、问候逻辑写进宿主、放弃大标题）及理由见上述 memorial，不再重复。
