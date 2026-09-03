# 003-deep-diving-playful-pool

状态：已完成（文案池待用户过目后实施）

## 诉求

> 还有把会话中，出现的深度求索中，换成随机出现一些俏皮话。
> 比如：
> token，token有token就干活。
> 摸鱼，摸鱼，不会被发现的。
> 天之道，损有余而补不住。
> 我不能偷懒。
> 准备大概100来条

## 追问记录

### 2026-09-03 事实调研（源码直读）

- 「深度求索中...」= locale key `chat.deepDiving`，定义于 `packages/client/ui-chat/src/client/locale.ts:31`（zh）/ `:144`（en: `Deep diving...`）。
- 唯一渲染点 = `packages/client/ui-chat/src/client/chat/ChatView.tsx:190`（`TurnStatus` 组件，`role="status" aria-live="polite"`）。
- 该组件**每秒重渲染**（`setInterval` tick 计算耗时）；运行满 15 秒后，文案后追加格式化时长（`formatRunDuration`，如「2分05秒」）。
- 测试影响：`packages/client/ui-chat/tests/chat-view.client.spec.tsx` 3 处断言引用该文案（1745 精确匹配；1805/1817 正则 `/^深度求索中\.\.\.2分0\d秒$/`）——改随机池后必须重写。
- i18n 门禁（`scripts/verify-client-ui-i18n.ts`）：产品文案必须住在 locale-owner 文件（`locale.ts` / `locales.ts` / `/locales/`）内，否则拒绝。**池子放 `locale.ts` 即合规**；zh/en 对等由字典自身的 `satisfies` 类型约束，脚本不强制池子对等。
- locale API：`LocaleFace.snapshot.active`（LocaleId）+ subscribe，client 侧可拿到当前语言 → 池子可按语言分桶。
- 该状态行**无 slot**；dsh-web-ui-jx 想接管只能再开槽或劫持 locale 注册（后者是单 key 单文案，放不下随机池，且覆盖他人字典非设计内扩展点）。

### 2026-09-03 10:45 追问 Q1–Q4 → 用户回复「可以，你全部自行决策」，授权我全部拍板

## 决策汇总

- **D1 [实现落点]**：宿主 `ui-chat` 直接改，池子内置 `packages/client/ui-chat/src/client/locale.ts`（locale-owner 文件，豁免 `verify-client-ui-i18n` 硬编码文案门禁）。否决给状态行开 slot（高频渲染内部元素，开槽过重）；否决插件劫持 locale 注册（单 key 单文案装不下池子，且覆盖他人字典非设计内扩展点）。
- **D2 [随机粒度]**：每轮一条。`TurnStatus` 挂载时经 `useState` 初始化器随机定一条，秒级重渲染不换条；运行满 15 秒后照旧在句尾追加时长。pick 接受 `random?: () => number` 注入（默认 `Math.random`），测试可控——与仓库「测试描述行为」的取向一致。
- **D3 [英文池]**：同步写 100 条英文，按 `LocaleFace.snapshot.active` 分桶选取。zh/en 对等是本仓库字典的硬约定；en 用户看到中文俏皮话是事故。
- **D4 [文案]**：100 条中文由我起草（含用户 4 条原话；「天之道，损有余而补不住」保留原写法当双关梗，不改回「补不足」）；英文按序对应翻译。用户过目后实施时原样使用。
- **D5 [兜底]**：保留 `chat.deepDiving` 这个 locale key 不动（zh「深度求索中...」/ en `Deep diving...`）作为池子为空或异常时的兜底；正常路径从池子随机。
- **D6 [测试]**：`tests/chat-view.client.spec.tsx` 3 处断言重写——1745 改为「状态行文本 ∈ zh 池」；1805/1817 的正则放宽为「池内文本 + 时钟」形态。注入 `random` 固定序列后可精确断言。

## 实施清单（待用户过目文案后执行）

1. `locale.ts`：导出 `DEEP_DIVING_POOL`（按 LocaleId 分桶的 100+100 条）与 `pickDeepDivingLine(random?)`。
2. `ChatView.tsx`：`TurnStatus` 挂载时取当前语言随机定一条，替换 `t('chat.deepDiving')`（保留该 key 作兜底）。
3. 重写 3 处测试断言（见 D6）。
4. 该 PR 按仓库约定附一条 Agent Note（`.agents/notes/`）。

## 完成声明

C1 诉求回应：随机俏皮话 + 约 100 条 → 文案池见 [pool.md](pool.md)。
C2 决策完备：D1–D6，无待定。
C3 待澄清清零：Q1–Q4 已全部拍板。
C4 调查闭环：无挂起工单，事实由源码直读。
C5 ADR：本仓库决策记录体系是 Agent Note（随实施 PR 提交），不设独立 ADR；决策与理由已完整记录于本文件。
