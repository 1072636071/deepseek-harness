# 会话选模型下拉按可见性过滤隐藏模型

**Status:** done

**Blocked by:** 02

**构建内容：** 消费 `ModelDirectoryResolver.modelVisibility`（02 建的可见性 seam），会话选模型下拉渲染时按各模型可见性裁剪：`visible=false` 的模型不再出现在模型列表（右列）中。当前会话已选中的模型即使被隐藏，其已选状态与展示仍保留（避免收起某模型让正在使用的会话丢模型），并沿用既有"已选项不可路由"提示逻辑。

（来源：02 审查将 PRD #4「提供与会话下拉」的消费侧归入本工单；02 只建读取 seam，本工单负责把 hidden 集接进 ModelSelect 渲染与过滤。）

**验收标准：**

- [ ] 被隐藏模型不出现在下拉模型列表（右列）

- [ ] 当前已选且被隐藏的模型仍显示、仍在已选态、保序

- [ ] 全部模型均隐藏时右列呈现现有空态文案并可用

- [ ] 可见性数据更新后无需刷新即反映（下拉打开时读取最新）

- [ ] ModelSelect 消费 `modelVisibility` 的 hidden 集做裁剪；`onChange→catalog.refresh` 的无效副作用在此接线中移除或收敛

- [ ] 对应组件 spec 通过（feed hidden 快照断言行为）；`pnpm run test:gui` 绿

## 评论

- 2026-09-03 由 02 审查移交 #4「会话下拉消费侧」：02 建 seam（ModelVisibilityDirectory + modelVisibility getter），本工单接线 ModelSelect 过滤 + 过滤组件测试。
- 2026-09-03 done。ModelSelect 注入 `visibility` store 并订阅，右列按 hidden 剪裁（当前已选隐藏保留——US9）；空态按过滤后剩余数判定（全隐藏 + 非当前选中 → 空态文案）；注入可选（无 settings scene 时 EMPTY_VISIBILITY 兜底全部可见）；移除 `ModelVisibilityDirectory.onChange→catalog.refresh` 无效副作用（删 onChange 参数 + hiddenSetsEqual）。补 5 个过滤测试（隐藏/保留当前/空态/动态更新）。审查三轮通过（终审无硬性违规）。
