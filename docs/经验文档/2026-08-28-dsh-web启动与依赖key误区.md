# dsh web 启动排查与「依赖 key 假设」误区

日期：2026-08-28 ｜ 环境：Windows + git-bash，node 24.14，pnpm 11.7 ｜ 分支：jiangxiao（基于 0.1.2-alpha.1）

## 一句话结论

启动 `dsh web` 失败与 `DEEPSEEK_API_KEY` 完全无关：真实阻塞是「已删除包的构建残留弄坏 client 构建」；而"需要 DeepSeek key"的说法是照抄仓库文档默认假设、未核查本机配置造成的误判。

## 踩坑记录

### 1. 仓库文档的默认假设 ≠ 本机运行前提（本次核心教训）

- 根 `AGENTS.md` 命令表把 `dsh --profile headless` 注释成 "needs DEEPSEEK_API_KEY"，`Secrets / .env` 一节写着 "Real-API tests and demos read DEEPSEEK_API_KEY"。据此下结论"启动项目需要 DeepSeek key"是错的。
- 实际情况：`~/.dsh/settings.yaml` 里 `agent-default-model` 绑定 `kimi-coding/k3-256k`，模型经 `llm-pi-ai` provider（kimi-coding→`KIMI_CODING_API_KEY`、openrouter→`OPENROUTER_API_KEY`）解析；密钥存在 `~/.dsh/.credentials.yaml`。`DEEPSEEK_API_KEY` 仅约束仓库自带的真实 API 测试路径（`test:e2e`、`test:snapshot:record`）。
- 规范做法：判断运行前提前先读 `~/.dsh/settings.yaml`、`.credentials.yaml` 与 `.env` 分层，把文档说法当线索而非结论。本次已顺手修正 `AGENTS.md` 三处歧义（删命令注释里的 key 要求；Secrets 一节主语收窄为 Real-API tests 并补一句"a launched app resolves its model from the Harness home settings.yaml instead"）。

### 2. `dsh web` 必须基于构建产物启动，源码态只有 dump-config 免构建

- `pnpm dsh --profile <name> --dump-config` 走 tsx 源码直跑，不要求 `lib/` 产物、不需要任何 key，是验证插件树组合的最快手段（headless 树 372 行条目，秒级出结果）。
- `dsh web` 挂载时 `typert-loader` 会 import 各包的 `lib/typert.host.js`、`client-modules` 会 import `lib/client.js`；缺产物则 boot 直接 fail-loud 崩掉。所以 launch web 前必须先 `pnpm run build`。
- 前端 `apps/web/dist`（11MB）此前已构建过，静态服务由 `web-runtime` 行解析 dist 后经 `frontend-static` fallback 座位挂载。

### 3. 被删除包的 gitignore 残留会毒化 client 构建

- 症状：`pnpm run build` 在 tsdown client 阶段报 7 个 `MISSING_EXPORT`，指向 `lib/types/api-proxy.js` 引用 `dsh-agent-presets`/`dsh-api-remotes` 中不存在的导出。
- 根因：commit `4f00a8b82a refactor(api): remove ApiProxy package` 已删包，但 `packages/host/apiproxy/` 下残留旧 `lib/`（被 gitignore，`git status` 不可见），client 构建把它卷进来。
- 修复：`pnpm run clean`（自带"清已删包残留"职责，本次删了 264 个路径）→ 全量重建通过。推论：凡在 master 合并后出现"引用了源码里根本不存在的导出"类构建错误，先怀疑残留产物，clean 再 build。

### 4. 管道吃掉退出码，误报构建成功

- `pnpm run build 2>&1 | tail -25` 的退出码是 `tail` 的，构建失败也报"completed exit 0"。
- 规范做法：长任务命令 `> 日志文件 2>&1; echo EXIT=$?` 全量落盘，事后 grep 定位；不要 `| tail`。

### 5. web 鉴权与「假 404/401」

- 启动日志会打印带 token 的正规地址：`dsh web: http://127.0.0.1:3080/?token=…`，并自动打开默认浏览器。
- 验证姿势：`curl -sL -c jar -b jar <token-url>` → 303 换 cookie → 200 拿到 SPA（title "DSH Local Build"）。匿名访问 `/`、`/api` 返回 401 属正常鉴权，不是没起来；`favicon.svg` 等静态资源免鉴权可用作存活探针。
- 启动窗口内日志可能出现 `webserver: no upgrade route "/api/events.mux"`：是浏览器在插件树挂载完成前发起的瞬时升级请求，挂载齐后自愈，可忽略。

## 可复用的启动流程

```sh
pnpm install                                  # 产物/残留不确定时先 pnpm run clean
pnpm run build > .tmp-build.log 2>&1          # 全量构建（勿 | tail）
pnpm dsh --profile headless --dump-config     # 免密钥快速验证插件树组合
pnpm dsh web > .tmp-dsh-web.log 2>&1 &        # 启动；从日志取 token URL 验证
```

## 插件机制速查（本次研读沉淀）

- 一切皆 Cordis 插件：TS 模块导出 `name`、`inject`（依赖服务名，决定装载等待）、`Config`（schemastery 校验、可被 cordis.yml 覆盖）、`apply(ctx)`；注册一律经 `ctx.effect()`/`ctx.on()`，可逆、随插件卸载回卷。
- 组合顺序：profile（`$DSH_HOME/profiles/<name>`）→ 依序叠 `dsh.profile.bundles` 各 bundle 的 `cordis.patch.yml`（`dsh-base` 打头）→ profile 自身补丁 → home 级 `cordis.patch.yml` → `--patch` 覆盖层 → 遥测开关。补丁按 id 整行替换或 insert；行序无装载语义。
- 事件五种分发：`emit`/`waterfall`/`parallel`/`serial`/`bail`；waterfall 监听必须调 `next()` 传递，单决策事件短路即裁决。
- 能力接缝三件套：Service Definition / Provider / Consumer，缺一不成接缝。
