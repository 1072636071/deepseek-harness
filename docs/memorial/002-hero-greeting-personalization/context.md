# 002-hero-greeting-personalization

状态：已迁移并完结（实现落点改为外部插件 `E:\work\sp\dsh-web-ui-jx`；完整访谈记录含本文件全文照录，见 `E:\work\sp\dsh-web-ui-jx\docs\memorial\017-hero-greeting-and-new-session-lines\context.md` 附录，无需跨仓库查阅）

## 诉求

> 我想做一些个性化，关怀性调整：把新会话中的探索未至之境，改成：
>
> - 上午好，【用户名字】，有什么需要我搞定的么？
> - 下午好，【用户名字】，有什么需要我搞定的么？
> - 晚上好，【用户名字】，有什么需要我搞定的么？
> - 该休息了，【用户名字】，让我来做吧，好好休息哦。

## 追问记录

### 2026-09-03 事实调研（源码直读）

- 「探索未至之境」= locale key `hero.headline`，定义于 `packages/client/ui-conversation/src/client/locales.ts:65`（zh）/ `:213`（en: `Into the Unknown`）。
- 唯一渲染点 = `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx:124`，`{t('hero.headline')}` —— 目前**无参数**调用。
- 同文件 `:125` 紧邻渲染 `hero.preview`（「预览版」badge）。
- `t` 支持插值参数（例：`t('input.accessMode', { name })`、`EmptyHero.tsx:50` 的 `t('hero.chooseWorkspace')`），因此 `{name}` 型文案无需改 i18n 基础设施。
- zh 字典是 key-set 的 source of truth，en 用 `satisfies Record<ConversationKey, string>` 强制全量对齐 —— 新增 zh key 必须同步 en。
- **用户名当前全仓库不存在**：`packages/identity/anonymous-user-id` 只提供匿名 UUID（`$DSH_HOME/.anonymous-user-id`），README 明确「不要用它来识别用户」。client 侧无账号/登录/profile 概念，无 `userName` / `displayName`（仅 provider 的 displayName，无关）。
- 测试断言：5 处硬编码「探索未至之境」在 `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`（442/476/483/508/526）。录制快照（`snapshots/`）**不含**该字符串。
- `CONTRIBUTING.zh.md:23` 的「探索未至之境」是项目 tagline，**与本次改动无关**。
- 仓库约定（AGENTS.md）：客户端 UI 文案归语言区域所有，必须经类型化字典 + `t`，硬编码文案会被 `verify-client-ui-i18n` 拒绝。

### 2026-09-03 09:45 追问 Q1（用户名来源）→ 选 1「新增用户自填的设置项」

### 2026-09-03 09:50 补充事实调研（settings 基础设施）

- 设置持久化 = **Host user-settings 文档**（用户级，不是按工作区）。客户端经 `ctx.settingsScope.bind<T>({ namespace })` 读写，快照 `mode: 'host' | 'memory'`；memory 模式（远端浏览器）**不接受写入**，因此名字在 memory 模式下不持久。
- 现成范式（`ui-conversation` 自己的 Enter 行为设置，可直接照抄）：
  - `packages/client/ui-conversation/src/submission-settings.ts` — 字段常量 + schemastery schema + `ConversationSettings` 类型
  - `packages/client/ui-conversation/src/index.ts` — Host 侧 `settingsNamespace(...)` 注册
  - `packages/client/ui-conversation/src/client/apply.ts:106` — `ctx.settingsScope.bind`
  - `.../client/input/submission-policy.ts` — 包一层 policy，暴露 snapshot store + setter
  - `.../client/settings/EnterBehaviorRow.tsx` + `apply.ts:109` 的 `settings.general.item` 注入 — 设置界面里的一行
- 「通用设置」页 = `ui-settings-general`，内容是 `settings.general.item` 列表 slot，由各功能包自行贡献行；当前贡献者有 locale（语言）、ui-agent-preset、ui-chat、ui-conversation。**加一行无需改 ui-settings-general**。
- `EnterBehaviorRow` 是下拉（Menu）；用户名需要的是**文本输入行**，仓库内暂无同类先例（`ui-agent-preset` 的 displayName 是对话框内输入，不在设置页）。

### 2026-09-03 09:57 补充事实调研（独立成包的成本）

- 参照最小 client 插件 `packages/client/ui-brand-official`，一个新包需要 12 类文件：`package.json`（5 个 exports 入口 + `dsh.client.inject` + `platform` + peer/dev deps + `files` + `scripts.bundle`）、`tsconfig.json`、`tsdown.config.ts`、`src/index.ts`（Host 面）、`src/client/index.ts`（Client 面）、`src/invariant.ts`（仓库强制的包级不变式伴生文件）、`tests/invariant.client.spec.ts`、`tests/*.client.spec.tsx`、`README.md` + `README.zh.md` + `README.i18n.yaml`（doc-sync 双语门禁）。
- Host 面注册极轻：`src/index.ts` 只需 `ctx.inject(['settings'], c => c.settings.register(settingsNamespace(NS), Schema))`（见 `ui-conversation/src/index.ts` 全文 23 行）。
- **注册点只有两处**：`packages/bundle/web-app/cordis.patch.yml` 加一条（`ui-conversation` 在 :202）+ `packages/bundle/web-app/package.json` 的 dependencies 加一项（仓库约定：Raw/Web cordis.yml 中的裸插件必须出现在 resolver manifest 的 dependencies 里，由 `verify-cordis-config` 强制）。
- 覆盖率门禁 `test:coverage` 要求 `packages/*/*/src` **每文件 100%** —— 新包从零就要达标。
- **解耦的现成范式 = slot 占用**：`conversation.hero.brand.mark` 是 `kind:'single', scope:'root'` slot，由 `ui-conversation` 定义 + 提供 fallback（FishLogo），由 `ui-brand-official` 占用；`ui-brand-official` 反向 peerDep `ui-conversation`。hero 文案可以照抄这套：`ui-conversation` 新增 `conversation.hero.headline` slot（fallback = 现有 `t('hero.headline')`），独立包去占用它。

### 2026-09-03 10:00 追问 Q2（是否独立成包）→ 选 1「独立成包 + slot 占用」

### 2026-09-03 10:00 追问 Q3（时段划分边界）—— 已给出 A/B/C 三方案 + 对比图，待回答
推断（待确认）：时区取**浏览器本地时间** —— hero 是纯 client 渲染，Host 不参与，取服务端时区反而会与实际感受不符。

新浮现待澄清：hero 长时间停留时跨档（如 22:59 → 23:00）是否自动刷新问候语。

### 2026-09-03 10:04 追问 Q3（时段边界）→ 选 1「A：05 / 12 / 18 / 23」

### 2026-09-03 10:04 追问 Q4（未填名字 / memory 模式下的退化文案）—— 待回答
### 2026-09-03 10:06 追问 Q4 → 选 1「去掉名字和逗号，保留问候」

### 2026-09-03 10:06 追问 Q5（跨档是否自动刷新）—— 待回答
### 2026-09-03 10:09 追问 Q5 → 选 1「挂载时算一次，不刷新」

### 2026-09-03 10:09 追问 Q6–Q9（四项低风险默认值，一次性确认）—— 待回答
### 2026-09-03 10:13 用户回复：「你的想法很棒，其他的也自己决策」→ 授权我自行拍板 Q6–Q9

### 2026-09-03 10:13 范围变更：实现落点改为外部插件 dsh-web-ui-jx

用户原话：「我想放在这个插件里去做实现，并且给姜晓也加上新建会话的台词，还有给姜晓现在的台词加上一些颜文字。E:\work\sp\dsh-web-ui-jx」

源码调研（新项目 `E:\work\sp\dsh-web-ui-jx`，姜晓角色插件）：
- 包名 `dsh-web-ui-jx`，定位「独立插件，不复用 dsh-web-ui 任何包」；peerDeps 只有 react/react-dom。
- **尚未接入 slots**：`src/client/index.ts:164` 注释明写「后续工单用 slots/locale 等」。当前只往 body 挂 CharacterOverlay（角色浮层）+ SidebarEntry（侧边栏，展开含 SettingsCard）。
- 台词集中在一处：`src/client/state-machine/overlay-speech.ts` —— `STATE_SPEECH`（8 条：working/error/permission/done/nod-smile/frown-wave/happy/angry）+ `SURPRISE_LINES`（4 条惊吓台词池）。
- 人设见 `docs/character-profile.md`：古风 · 贵族 · 少女 · 剑士 · 很聪明 · 冷冽（异时间线赛博大明）。`docs/character-lines.md` 风格指引：半文半白 + 赛博点缀，一句 12 字内为佳，红线「**不甜腻、不卑微**」。
- 状态机 `overlay-state-machine.ts`：`OverlayState = idle | working | permission | error` + `PerformanceKind`（done/nod-smile/frown-wave/happy/angry/surprised）。**当前无「新建会话」态或钩子**。
- 会话数据可达：`ctx.get("sessions")`（ISessions），已用于会话气泡列 —— 新建会话可从这里监听。
- 持久化两条现成路径：client 侧 `createPersistentSetting`（`packages/dsh-session-bubble`，localStorage + `STORAGE_KEYS` 单点）；host 侧 `ctx.storageDomain` + `settings` 分节 `dsh-jx.*`（已有先例 `dsh-jx.aiTitle`）。
- 该项目自带 memorial 体系，最大编号 016 → 本次新开 017。

**关键阻塞**：`conversation.hero.headline` slot 不存在于 dsh-web-ui-jx，它必须由 deepseek-harness 的 `ui-conversation` 新增；而 dsh-web-ui-jx 要占用它就得新增对 `@deepseek-ai/dsh-client-ui-conversation` 的依赖 —— 与其「独立插件」定位有张力。

## 决策汇总

- **D1 [用户名来源]**：新增用户自填的设置项，持久化到 Host user-settings 文档（settings 基础设施），而非 OS 推断、首启询问或退化掉名字。
- **D2 [归属与解耦]**：独立成新 client 插件包（暂名 `ui-profile`），经**新增的 `conversation.hero.headline` slot** 占用 hero 文案；`ui-conversation` 保留原 `t('hero.headline')` 作为 fallback，反向依赖方向照 `ui-brand-official` → `conversation.hero.brand.mark` 的既有范式。不采用 ui-conversation 直接依赖新包，也不采用复用其 namespace。
- **D3 [时段划分]**：A 方案 —— 上午 05:00–11:59 / 下午 12:00–17:59 / 晚上 18:00–22:59 / 该休息 23:00–04:59（wrap-around 判定 `hour >= 23 || hour < 5`，边界需专门测试）。时区取浏览器本地时间。
- **D4 [无名字退化]**：去掉名字与逗号，保留问候语本身（「上午好，有什么需要我搞定的么？」），因此需要带名/不带名两套文案（zh+en 共 16 key），绝不跨 key 拼接句子。memory 模式（settings 不可写）走同一条路径。
- **D5 [刷新时机]**：挂载时计算一次，不挂 timer、不轮询。理由：hero 只在空会话显示，发消息即切走；新建会话会重新挂载，本身就是刷新时机。

## 待澄清

- Q6 英文文案定稿
- Q7 「预览版」badge 是否保留
- Q8 是否提供「关闭个性化问候」开关
- Q9 用户名的校验与长度上限
- 中文文案里的「么」是否应为「吗」（用户原话用「么」）
