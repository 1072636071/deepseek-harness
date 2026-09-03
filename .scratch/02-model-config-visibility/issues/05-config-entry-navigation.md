# 会话选模型下拉新增「模型配置」入口并导航

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 会话选模型下拉根菜单在「模型」「推理等级」之外新增一行「模型配置」入口。点击后通过新增注入回调精准导航到「设置→模型」分段，让用户落地即模型配置页而非设置首页，不必手动定位。未注册导航回调时入口静默隐藏。

**验收标准：**

- [x] 根菜单出现「模型配置」行，文案走类型化 locale 字典（zh/en）
- [x] 点击触发注入的导航回调，目标是「设置→模型」分段
- [x] 未注册导航回调时入口不渲染、无错误
- [x] 根菜单原有模型/推理等级导航与键盘操作无回归
- [x] 对应组件 spec + 注入边类型通过；`pnpm run test:gui` 绿

## 评论

- 2026-09-03 done。三段式接线：ui-settings 底座新增 `ctx.uiSettingsNav`（薄可观察服务，`openSection(id)` 发布单调 seq+sectionId 请求，保留最后一条供晚挂载外壳读取）；ui-settings-general 外壳经 inject `hooks.nav` 读取请求，`SettingsRoot` 按 seq 去重后 `setActiveId+setOpen` 落地分段；ui-model-selection 座面 inject 面加可选 `openModelConfig`，apply 里 `ctx.get('uiSettingsNav')` 存在时绑 `openSection('models')`、缺席时该行隐藏。locale `menu.config` zh/en 对齐。
- 审查：标准轴 0 硬违规 + 6 酌情项（采纳：英文注释化、去重 shell-contract 冗余 import、补 nav 订阅退订测试；保留：`'models'` 为跨界面透明键、cell 按钮骨架沿用既有 model/effort 行、事件→状态反应沿用 onboarding `openSection` 范式）；spec 轴 0 缺口，端到端链路（回调→openSection→store→hooks.nav→setActiveId('models')→只渲染该分段）与 'models' 键匹配 ui-settings-models 注册均核对通过。502 GUI 测试绿、ui-settings/general tsc 0 错、ui-model-selection 仅存 visibility/settings-models 既有测试错（非本次触及）。