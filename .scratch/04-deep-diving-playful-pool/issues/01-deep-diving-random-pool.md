# 思考状态行随机俏皮话池（zh/en 各 100 条）

**Status:** done

**构建内容：** 用户等待模型思考时，状态行每轮随机显示一条俏皮话——中文界面出中文池、英文界面出英文池；运行满 15 秒后句尾照旧追加时长（如「2分05秒」）。同一轮思考期间文案不变，不闪屏。

**验收标准：**

- [ ] 文案池住在 `ui-chat` 的 locale 归属文件内（豁免硬编码文案门禁），zh / en 各 100 条逐条对应，内容与 `docs/memorial/003-deep-diving-playful-pool/pool.md` 定稿一致
- [ ] 抽取为接受 `random` 注入的纯函数（默认 `Math.random`）；当前语言经 LocaleFace 快照读取
- [ ] 状态行组件挂载时经 state 初始化器定一条；秒级计时重渲染不重抽
- [ ] `chat.deepDiving` locale key 保留为兜底
- [ ] 15 秒阈值与时长拼接行为不变（俏皮话与时长分属不同节点）
- [ ] 原三处精确断言重写：status 文本 ∈ 当前语言池；注入固定 random 序列可精确断言到某一条；时长断言放宽为「池内文本 + 时长」形态
- [ ] i18n 门禁通过；PR 按仓库约定附一条 Agent Note

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **Agent Note（完成）**：实现已落地。文案池逐字抄入 `ui-chat` locale 归属文件 `locale.ts`（zh/en 各 100 条，已脚本校验与 `pool.md` 完全一致）；新增 `pickDeepDivingPhrase(localeId, random=Math.random)` 纯函数；`TurnStatus` 挂载时 `useState` 初始化器定一条，秒级重渲染不重抽；`activeLocale` 经 LocaleFace 快照（`ctx.locale.getSnapshot().active`）注入；`chat.deepDiving` 保留兜底；15s 阈值与时长拼接不变；原三处断言已重写（精确/英文池/正则）。残险：本沙箱 pnpm 符号链接无法被 node ESM 解析，`pnpm run typecheck` 与 `pnpm vitest run` 无法在此环境跑通，需在你的环境复核。未提交。
