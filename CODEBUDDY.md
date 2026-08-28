# AGENTS.md

DeepSeek Harness 是一个全插件的 Cordis agent harness（智能体运行框架）。修改 `packages/` 前先阅读 [docs/architecture.md](docs/architecture.md)；文档工作遵循 [docs/AGENTS.md](docs/AGENTS.md)。

<a id="pre-release-stance-foundation-over-blast-radius"></a>

## 预发布立场：基础正确优先于改动波及面

**首个打 tag 的版本发布时删除本节。** 在此之前，宁可做正确的基础，也不写兼容性垫片：可自由重命名或重新打包，并更新所有引用。后端拒绝旧的磁盘落盘格式。SQLite 使用单调递增的 `SCHEMA_VERSION`；`dsh-session` 将 `SESSION_FORMAT_VERSION` 保持为 `0`，不做任何兼容性承诺。

**应用启动。** 只有 `dsh` profile 可以启动受支持的 Node 应用；禁止使用包可执行入口（bin）、demo 以及公开 SDK 的参数逃逸来启动应用（[规则](docs/architecture.md#application-launch)）。

## 仓库结构

```
vendor/      内置的 Cordis 源码 —— manifest 与同步流程见 vendor/README.md
packages/    @deepseek-ai/dsh-<pkg> workspace，位于 packages/<group>/<pkg>/
  core/        产品 API 主线：session、system-prompt、tools、agent、agent-loop
  api/         远端 BFF 组装与 Typert RPC 网关
  typert/      类型图生成器、loader 与运行时注册表
  llm/         LLM 能力：Service Definition/Consumer + DeepSeek providers
  e2b/         E2B POC：沙箱 + FS/子进程适配器
  shell/        bash 能力：Service Definition + local/pwsh providers + shell Consumers
  subprocess/  子进程能力 + 本地进程树 provider + 共享 Win32 库
  terminal/         持久会话
  fs/          文件系统能力 + 策略
  lsp/         语言服务器能力
  skill/       skill provider 注册表 + 本地实现 + catalog/loader 工具
  web/         web 能力：Service Definition + search/fetch providers + 工具 Consumer
  compaction/     上下文压缩能力 + 基础 provider
  context/     请求上下文插件
  subagent/    子智能体能力：Service Definition + providers + 委派 Consumers
  bundle/      可安装的 dsh --profile 补丁层 bundle
  workflow/    工作流能力 + worker 线程 provider + 工具 Consumer
  webhook/     webhook 入口
  todo/        todo_write 工具
  plan/        以已记录状态实现的 plan 模式
  preset/      由预置 cordis.yml 文件为每个会话组合 agent
  guard/       主循环卫生 + 工具超时插件
  self-modification/  agent 检视/挂载自身插件
  hooks/       Claude Code/Codex hook 桥接 + 传输协议库
  session/     持久会话数据：落盘、投射、标题、遥测
  identity/    匿名身份
  settings/    用户设置能力 + 文件 provider
  credentials/ 凭据/授权能力 + env/.env provider
  acp/         仅用于自动化的 Agent Client Protocol 服务端
  interaction/ 审批/交互能力、权限、命令、ask-user
  boot/        共享的 profile/应用启动粘合层
  sdk/         JSON-RPC 协议 + TypeScript 客户端/服务端
  examples/    可复用的组合 bundle（agent-spine）
  experimental/ 私有原型，不进入正式发布
  support/     开发/测试基础设施
  util/        零依赖工具
python/      Python SDK 与随包运行时（见 python/README.md）
native/      @deepseek-ai/node-addon-landlock-run 的源码权威位置（见 native/README.md）
.agents/     Agent 工作流与 Agent Notes（`notes/`）
docs/        架构、生成的目录清单、故障复盘、cookbook（见 docs/AGENTS.md）
scripts/     仓库门禁与生成器
website/     由选定的一份 docs/ 双语源生成的 VitePress 站点
```

包分组说明：[packages/README.md](packages/README.md)。

<a id="commands"></a>

## 命令

```sh
pnpm install            # pnpm workspaces，node ^22.19 || >=24
pnpm run clean           # 删除构建产物，以及已删除包遗留的安全残留
pnpm run test           # 单元测试
pnpm run test:coverage  # CI 覆盖率门禁：packages/*/*/src 每文件 100%
pnpm run test:e2e       # 真实 API 测试；无 DEEPSEEK_API_KEY 时自行跳过
pnpm run test:expected  # 各 owner 目录内的流程期望输出
pnpm run test:snapshot  # 免密钥的录制会话重放，走已发布 profile；过滤：-t <name>
pnpm run test:snapshot:record  # 重新录制期望输出（需要密钥）
pnpm run typecheck
pnpm run lint
pnpm run duplication    # 跨文件 TypeScript 克隆检测
pnpm run build          # tsc 产出 lib/types，tsdown 打包运行时
pnpm run hygiene        # knip + publint + workspace 约束 + NodeNext 消费方检查
pnpm run check:windows-wine  # 仅在诊断已知 Windows 失败时使用（需要 wine）；该信号由 CI 负责
pnpm run doc-sync       # 全部文档门禁；叶子清单在 scripts/run-gates.ts
pnpm run test:docs      # 快速文档检查（不构建；doc-quick 聚合）
pnpm run website:build  # VitePress 构建（同时充当死链检查）
pnpm dsh --profile headless "task"  # 从源码运行单个任务
pnpm run demo:ptc -- "task"  # headless PTC 模式运行
```

### 宿主机沙箱失败

如果必需的 `gh`、`pnpm`、构建、测试或生成器命令，因沙箱阻断凭据、网络、IPC、文件监视或嵌套 `sandbox-exec` 而失败，保持命令原样不变，用最小范围的宿主机提权重试。必须先有沙箱证据；绝不用该路径绕过测试失败或产品自身的沙箱。

<a id="run-relevant-checks-locally"></a>

### 本地运行相关检查

推送前按 [dsh-pre-push-checks](.agents/skills/dsh-pre-push-checks/SKILL.md) 运行检查；只汇报实际执行过的命令。`gh stack sync` 之后立即验证；检查未通过不得合并。

- 证据要与覆盖面匹配：聚焦的行为测试、模型/用户输出快照、文档用 `doc-sync`、已发布路径用构建后冒烟、provider 用真实 API e2e。
- 绝不为了提交或推送而默认跑全量套件，或重复跑一个已通过的检查。穷尽覆盖率与平台矩阵由 CI 负责；只有在明确要求、诊断 CI、或变更本身不可约地涉及全仓库时，才在本地全量演练。
- CI 的覆盖率门禁是 `test:coverage`，不是 `test`（[原因](docs/testing.md)）。

## 密钥 / .env

真实 API 测试读取 `DEEPSEEK_API_KEY`、可选的 `DEEPSEEK_BASE_URL` 以及根目录 `.env`；而被启动的应用改为从 Harness home 目录的 `settings.yaml` 解析其模型。cordis.yml 在插件 `config` 与条目 `disabled` 下允许 `!!js`（绝不允许 `!js`）；其他元数据保持字面量，因此条件组合同样使用 overlay（[入门](docs/cordis-primer.md#loader-configuration)）。绝不提交凭据。CI e2e 在没有密钥时跳过；密钥策略由 [testing.md](docs/testing.md) 负责。

<a id="conventions"></a>

## 约定

- 每个 npm 包都命名为 `@deepseek-ai/dsh-<name>`；内置包需重新划分作用域（[映射](docs/rescope.md)）并设为 `private: true`。`@deepseek-ai/cordis` 是每个 harness 包的 peerDependency（同时列入 dev 依赖）。
- 全面使用 ESM（`"type": "module"`）。跨包引用使用包名，本地相对导入使用 `.ts` 扩展名。配置子进程在纯净 Node 下运行已构建的 `lib/`；源码级回归测试使用各自声明的启动器（[测试策略](docs/testing.md#test-subprocess-launch-modes)）。`dsh` CLI 的源码启动经由 tsx 的仅 ESM 钩子（`node --import tsx/esm`）执行；它能触及的模块必须保持 ESM（不得有仅 CJS 的导出）—— 在整个 engines 支持范围内都不可依赖 Node 原生 TypeScript 模式（[源码启动契约](.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.md)）。Raw/Web 的 `cordis.yml` 中的裸插件必须出现在其 resolver manifest 的 `dependencies` 里；由 `verify-cordis-config` 强制。
- **注册即副作用**：所有贡献都通过 `ctx.effect()` / `ctx.on()` 完成；注册表的 `register()` 返回释放器（disposer）。
- **运行时不变式只断言自己拥有的关系。** 校验权威事件流或可变数据，而不是服务或方法是否存在、插件元数据或 effect，也不是固定的纯示例。若不存在合理的关系，一个带解释的空伴生文件就是正确结果（[包级不变式规则](packages/AGENTS.md)）。
- **类型化事件使用声明合并**，并采用可扩展合并的 map。事件 JSDoc 需要 `@mode` 以及 payload 的 `@param`；不出现在 payload 中的作用域键需要 `@dshScopeScan unsupported`。公开服务方法要记录参数与非 void 返回值。`SessionEventMap` 的每个成员都是读取即必需：不认识其类型的构建会拒绝该日志；只有结构性的格式变更才提升 `SESSION_FORMAT_VERSION`（[机制](.agents/notes/implemented/simplification/2026-08-25-fail-closed-session-event-vocabulary.md)）。
- **按判别标签 switch。** 闭合联合以 `assertNever` 收尾；可扩展合并的联合走一条有文档说明的 default 分支。
- **waterfall 监听器必须调用 `next()`** 以完成委托；不调用它就返回会短路整条链（[语义](docs/cordis-primer.md#cordis-waterfall-semantics)）。
- **模型可见 ⟺ 已记录**：任何进入模型请求的内容都必须能从会话日志重建；新增模型可见输入需要配套一个会话事件。
- **用插件而不是改主循环**：新行为挂在有文档的扩展点上；修改 `agent-loop` 必须同步更新 docs/architecture.md。
- **能力接缝由 Service Definition / Service Provider / Consumer 三种角色构成。** 它必须完整，不能只有单一角色；仅当角色会独立演化时才拆分（[术语表](docs/glossary.md#capability-seam)）。
- **优先使用维护良好的依赖而非手写**，前提是它确实能删掉自有代码与测试（[策略](.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)）。
- **包边界上显式优于隐式**：默认值是所属实现里一个显式的 `resolve(request): Spec` 步骤，绝不能是 `run()` 内部隐藏的 `?? default`（`dsh-shell` 的 request/spec 拆分即为范式）。
- **插件中不硬编码可调项**：随部署变化的选择必须是经校验的 `Config` 字段、可从 cordis.yml 修改；`DEFAULT_*` 常量或测试钩子不算可配置。协议常量、外部规范与安全不变式保持固定。
- **配置错误要大声失败**：自包含时在加载期失败，否则在最早可解析的位置失败；绝不静默跳过缺失的引用目标。
- **跨边界的不可透明 id 使用品牌类型**（`dsh-brand` 的 `Branded<B>`），绝不使用裸 `string`。
- **在有类型保证的同进程边界信任 TypeScript。** 不要仅仅针对静态接口已经要求的值，添加运行时校验、回退行为或恶意输入测试；校验点放在 parser/config、入队、模型/工具 JSON、持久化/文件、worker、进程以及传输边界上。
- **源码平面与产物平面绝不混用。** 静态门禁和测试通过 tsconfig `paths` 把 workspace 导入解析到 `src`，并在干净的树上通过；消费已构建 `lib/` 的门禁要声明该依赖（[布局](docs/development.md#typescript-project-layout)）。
- **保持编译面显式。** 同时含 Host 与 Client 程序的包，暴露按面划分的叶子配置和一个仅用于 solution 的根配置；仓库级程序以某个面配置为种子，绝不用根 solution（[布局](docs/development.md#typescript-project-layout)）。
- **空的 `catch` 要写明吞掉了什么**，以及为什么不会有别的东西到达此处；`try` 只保留一条语句。
- **注释保持局部。** 不要复述代码；除非本地必需，不要解释远处行为；不要扩写无关注释（[理由](.agents/notes/implemented/process/2026-08-09-concrete-prose-names-actors-and-recorded-facts.md)）。
- **并列取值优先保持对称**；无解释的不对称通常意味着漏掉了一次提取。
- **测试描述行为，而非正确性。** 行为过时就连同其测试一起改掉；在 PR 中说明原因。
- **非平凡变更必须在同一个 PR 中包含一条 Agent Note；** 只有机械/局部编辑可豁免（[范围](.agents/notes/README.md#when-to-write-one)）。归档的 note 是冻结的：绝不编辑，也不当作当前权威（[归档策略](.agents/notes/README.md#archiving-and-deletion)）。
- **客户端 UI 文案归语言区域所有。** 产品文本必须经类型化字典和 `t`，或经本地化基础类型 props；`verify-client-ui-i18n` 会拒绝硬编码文案（[决策](.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)）。
- **测试策略** —— [docs/testing.md](docs/testing.md)。每个非平凡的、模型或产品用户可见的变更都要更新一个免密钥的录制会话快照；[快照归属](snapshots/AGENTS.md) 把顶层目录树留给会话驱动的用例，其他期望输出留在各自 owner 目录。fixture 需在 macOS/Linux 上重放；修 fixture，而不是修归一化器。
- **提前设计每个工具的 UI 呈现。** Host presenter 保持纯函数；Web 卡片由原始事件和持久化的结果元数据推导（[cookbook](docs/cookbook/adding-a-tool.md)）。
- **为能力接缝、生命周期路径与转录输出规划单元、e2e 与快照覆盖**；缺失的快照框架支持在同一变更中一并补齐。
- **两个 SDK 都要投射主循环。** `agent-loop`、会话生命周期与 `SessionEventMap` 的变更，要在同一 PR 中更新 TypeScript 与 Python SDK 的期望输出；`pnpm run test` 两者都不覆盖（[覆盖面](docs/testing.md#when-a-snapshot-test-is-required)）。
- **有意识地选择 PR 历史。** 拆分独立变更，并在扩散前先修好引入问题的原 PR。独立分支/堆栈分支可以 merge-forward 或 rebase。重写历史使用 `--force-with-lease`，远端有变动就中止，绝不使用裸 `--force`；在采用更新的基线前，先保留进行中的 merge-forward 检查点（[理由](.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)）。
- **标签：** 每个 PR 一个 `kind/*`，所有实质性变更打上全部相关 `area/*`，并使用原生 Issue Type（[分类](.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)）。
- TODO 标记：按紧急程度使用 `FIXME`/`TODO`/`XXX`（[语义](docs/development.md)）。
- 文件以恰好一个行尾换行结束；`git diff --cached --check`（pre-commit）负责把关。

## 防御式编程模式

在做生命周期、并发、子进程或 teardown 相关工作前，先读 [docs/defensive-patterns.md](docs/defensive-patterns.md)。

## 类型安全与文档

全部代码在 `strict: true` 与 `noImplicitAny` 下编译；每个残留的 `any` 都要说明为何无法收窄。每个模块和导出都要有简洁的 JSDoc 说明其不自明的契约；类函数导出包含 `@param`/`@returns`，由 `verify-export-jsdoc` 强制。继承声明的成员、插件协议槽位以及构造函数，把文档留在声明它们的 Service Definition、协议或类上。

注释与文档陈述完整的契约和上下文，而不是推理过程记录。使用直接、具体的术语。不要使用隐喻。在写下 `contract`、`boundary`、`shape` 之前，先问是否有更精确的词能命名该对象：写 `response fields`、`JSON validation` 或 `ESM exports`，而不是 `response shape`、`validation boundary` 或 `module shape`。`contract` 只保留给前置条件、后置条件、不变式、兼容性承诺，以及调用方、被调方、实现者、提供者、生产者或消费者所依赖的其他义务。`boundary` 只保留给真实的进程、传输、安全、事务或生命周期边界。不要叙述控制流或测试、保留评审历史、复述代码。要保留行为、失败、时序、归属与安全使用方面的事实；并链接其理由。决策依据使用 [dsh-prose-standard](.agents/skills/dsh-prose-standard/SKILL.md)。把可机械校验的不变式接入一个会被执行的顶层门禁，并证明每条改动的验收路径都会拒绝一个非法用例。使用狭窄且有理由的例外，而不是全局关闭某条规则。

每次代码变更都要配套文档：一并更新受影响的 README 与 JSDoc 契约。常规双语文档工作遵循 [docs/AGENTS.md](docs/AGENTS.md)；只有用户明确调用时才可运行 `dsh-translate-docs`。描述当前状态的散文、每段一个物理行、每个事实只有一个归属地、以及字数预算，均规定在那里。

## 编辑本指令文件

在根目录和 `packages/`，`CLAUDE.md` 是指向 `AGENTS.md` 的符号链接；编辑真实文件即可。每条规则保持自包含，同时链接到高层文档。清晰度不受损时就压缩；当必需内容确实需要更多空间时，调高 `verify-doc-budgets` 的上限。

## 内置源码策略

`vendor/` 中的包是钉定版本的源码副本（manifest 与上游 SHA 记录在 [vendor/README.md](vendor/README.md)）。按其中的同步流程更新；重新应用或退役已登记的本地改动；重跑 `pnpm run test && pnpm run build`。

## 多代理要求

AGENTS.md 和 CODEBUDDY.md 内容必须保持一致。

AGENTS.md

## Agent skills

### Issue tracker

本仓库的 issue 与 PRD 以本地 markdown 形式存放于仓库 `.scratch/` 下，不使用远程 tracker。参见 `docs/agents/issue-tracker.md`。

### triage 标签

采用五种标准 triage 角色（标签字符串与角色名一致，未覆盖）：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。参见 `docs/agents/triage-labels.md`。

### 领域文档

单一上下文布局：仓库根目录 `CONTEXT.md` + `docs/adr/`。参见 `docs/agents/domain.md`。

### 临时文件

所有临时脚本统一放在仓库 `.temp/scripts/` 下；其他临时文件（脚本输出、日志等）也要分类，放在 `.temp/` 的子目录下（如 `.temp/output/`、`.temp/logs/`），保证仓库根目录干净。
