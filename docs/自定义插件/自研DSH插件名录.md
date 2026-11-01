# 自研 DSH 插件名录（本机 · profile web）

本机 DeepSeek Harness 装的自研插件台账：本地目录、git 地址（双上游列两处）、升级 DSH 后的检查步骤。根 [AGENTS.md](../../AGENTS.md) 的约定条目「Locally linked DSH plugins」与 [CODEBUDDY.md](../../CODEBUDDY.md) 约定里的同名条目规定升级后必查本文件第 2 节列出的插件。

数据截至 2026-11-01（宿主 rc.5 复查），取自 `C:\Users\jxc123\.dsh\profiles\web\package.json` 的 `dependencies`、`C:\Users\jxc123\.dsh\profiles\web\node_modules` 下的 junction 目标、各仓 `git remote -v`、npm 发布包的 `npm pack` 解包比对。

## 1. 范围与安装形态

profile 只有 `web` 装了插件（`headless` 的依赖数为 0）。判据：`package.json` 依赖值以 `link:` 开头 = 自研本地直挂（第 2 节）；纯版本号 = npm 装机（第 3 节本队维护的 fork、第 5 节第三方）。

8 个 `link:` 依赖各对应一个指向本地检出的 junction：`node_modules` 顶层 4 个（`dsh-agent-studio`、`dsh-providers-hub`、`dsh-web-ui-jx`、`win-shell-mcp`），`node_modules\@tdbm\` 作用域下 4 个（四个 `@tdbm/*`）。宿主基线版本（读自本检出的 `packages/*/*/package.json` 与 `vendor/*/package.json`）：`@deepseek-ai/cordis` 4.0.5、`@deepseek-ai/schemastery` 3.18.5、`@deepseek-ai/dsh-*` 0.2.1-rc.5（2026-11-01 合并上游 tag dsh-v0.2.1-rc.5；cordis/schemastery 未动）。profile 的 `node_modules` 下没有 `@deepseek-ai` 作用域（宿主包由检出提供，见 `C:\Users\jxc123\.dsh\profiles\node_modules`），peer 对照要从检出取版本。

## 2. link: 直挂本地检出（升级后逐台复查）

| 插件 | 本地目录 | git 地址 |
| --- | --- | --- |
| `@tdbm/dsh-lingshu-bootstrap` | `E:\work\sp\TencentDB-Agent-Memory\lingshu-bootstrap-plugin` | remote `origin` = <https://cnb.cool/hanjiangxue_xiaoxiao/Agent-Memory.git>（推送目标，四个插件目录都在它的 `main` 上）；只读上游 <https://github.com/Tencent/TencentDB-Agent-Memory>（该仓 README_CN 写作 `TencentCloud/TencentDB-Agent-Memory`，未配 remote，禁止向其推送） |
| `@tdbm/dsh-session-purge` | `E:\work\sp\TencentDB-Agent-Memory\session-purge-plugin` | 同 `origin`（同一仓的子目录） |
| `@tdbm/dsh-idle-sensor` | `E:\work\sp\TencentDB-Agent-Memory\idle-dsh-plugin` | 同 `origin` |
| `@tdbm/dsh-panel` | `E:\work\sp\TencentDB-Agent-Memory\panel-dsh-plugin` | 同 `origin` |
| `dsh-agent-studio` | `E:\work\ai-sp\dsh-agent-studio` | remote `team` = <https://cnb.cool/hanjiangxue_xiaoxiao/dsh-agent-team>（`main` 跟踪它）、`origin` = <https://github.com/thissensen/dsh-agent-studio.git>、`cnb` = <https://cnb.cool/hanjiangxue_xiaoxiao/dsh-agent-studio> |
| `dsh-providers-hub` | `E:\work\ai-sp\deepseek-harness-codearts` | 本仓 <https://cnb.cool/hanjiangxue_xiaoxiao/deepseek-harness-codearts>；上游 remote `origin` = <https://gitee.com/iJetLi/deepseek-harness-codearts>（`master` 跟踪它）。包原名 `dsh-codearts-auth`（0.2.0-rc.11 起改名） |
| `dsh-web-ui-jx` | `E:\work\sp\dsh-web-ui-jx` | 单上游 <https://cnb.cool/hanjiangxue_xiaoxiao/dsh-web-ui-jx>。非 fork：不引用 `dsh-web-ui` 任何包（该仓 `docs/adr/0001-dsh-bundle-plugin-not-skin.md`） |
| `win-shell-mcp` | `E:\work\sp\win-shell-mcp` | remote `origin` 与 `upstream` 同指 <https://cnb.cool/hanjiangxue_xiaoxiao/win-shell-mcp>（同一仓的两个 remote，不是双上游）；第二源 <https://github.com/1072636071/win-shell-mcp> 未配 remote |

TencentDB-Agent-Memory 仓另配 remote `cnb` = <https://cnb.cool/hanjiangxue_xiaoxiao/my-zvec-grep.git>，是 zvec-grep 上游镜像（`mzg/` 子树的来源），不是这四个插件的上游。

宿主判定插件兼容性的权威在 `packages/boot/app-boot/src/plugin-compatibility.ts`：manifest 声明 `engines.dsh` 时该范围单独决定、`peerDependencies` 被忽略，否则所有 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` peer 必须匹配，且预发布版本参与范围匹配（`semver.satisfies(runtimeVersion, range, { includePrerelease: true })`）。本机 8 台里 `dsh-agent-studio`（`engines.dsh= >=0.2.1-alpha.2`）与 `win-shell-mcp`（`engines.dsh= ^0.2.1-rc.2`）声明了 `engines.dsh`，其余六台没有 ⇒ 该两台的 peer 表不参与运行时判定；六台里 `dsh-providers-hub` 与 `dsh-web-ui-jx` 声明了版本区间、四台 `@tdbm/*` 用 `workspace:` 协议（按宿主运行时版本解析，见下表；判定由 semver 给出，每次升级后重跑第 4 节的对照脚本）。四台 `@tdbm/*` 的插件自身逻辑另由各自自带的 `node --test` 判定（2026-11-01 实测：idle 51、lingshu-bootstrap 221、session-purge 80 全过；panel 60 用例 57 过 3 挂——`panel-core.test.js` 的 `clientFunctionBody()` 用 `indexOf('\n    }\n')` 定位函数体，本机 `core.autocrlf=true` 把 client.js 重签出成 CRLF（`git ls-files --eol` = `i/lf w/crlf`）致守卫失配，LF 副本三守卫全过，纯本地行尾问题，与宿主版本无关，修法已拍板（方案 a）：插件目录加 `.gitattributes` 强制 `*.js eol=lf`，client.js 按新规则重签出为 `i/lf w/lf`，npm test 60/60 全过），这些用例不加载宿主实现（session-purge 的 endpoint 用例用 `module.registerHooks` 把 `@deepseek-ai/schemastery` 替成本地 shim），不比对宿主版本。

| 插件 | `engines.dsh`（有则单独决定） | 参与判定的 peer | 对宿主 dsh 0.2.1-rc.5 |
| --- | --- | --- | --- |
| `dsh-agent-studio` | `>=0.2.1-alpha.2` | 不参与（被 `engines.dsh` 覆盖） | 满足 |
| `win-shell-mcp` | `^0.2.1-rc.2` | 不参与（被 `engines.dsh` 覆盖） | 满足 |
| `dsh-providers-hub` | 无 | 3 个 `dsh-*` 写 `^0.1.2-rc.1 || ^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.1-rc.2`（`cordis`、`schemastery` 不参与该判定） | 满足 |
| `dsh-web-ui-jx` | 无 | 8 个 `dsh-*` 写 `^0.2.1-rc.2`（`cordis`、`react` 等不参与该判定） | 满足 |
| 四台 `@tdbm/*` | 无 | peerDependencies 全写 `workspace:~` / `workspace:*` ⇒ 按宿主运行时版本解析，满足 | 满足 |

## 3. 本队维护 fork，但按 npm 装机

| 插件 | profile 依赖值 | 装机形态 | git |
| --- | --- | --- | --- |
| `@liustack/modsearch` | `5.10.10` | npm 真实目录，非 junction | 上游 <https://github.com/liustack/modsearch.git>；本队 fork <https://github.com/1072636071/modsearch-and-more.git>（本地 `E:\work\sp\modsearch-and-more`，其 `package.json` 版本 5.9.0） |
| `@michengai/dsh-archive-manager` | `1.1.10` | npm 真实目录，非 junction | 上游 <https://github.com/MichengAI/dsh-archive-manager.git>；本队镜像 <https://cnb.cool/hanjiangxue_xiaoxiao/dsh-archive-manager>（本地 `E:\work\ai-sp\dsh-archive-manager`，其 `package.json` 版本 1.0.18） |

这两台的运行副本在 profile 里，改本地克隆不影响运行；升级 = 写新版本号重装，会覆盖 profile 内的手工改动。

`@michengai/dsh-archive-manager` 的运行副本有一处与任何已发布 tarball 都不同的文件：`lib\projcache.js` 的 SHA256 = `923301DE80DB4CF959E192F5D906CDF7D990036CDC906BD32F5B46D4BB0EE545`；npm 已发布的 1.1.10 是 `338456E6…`、1.1.18 与 1.1.20 都是 `817DA89D…`（2026-10-30 用 `npm pack` 解包比对）⇒ 该文件被手工改过。运行副本相对 1.1.10 的差异（Compare-Object 行集合差）是 57 行增、13 行删：新增 `mergeWouldChange`、bulk `persistence.list()` 一次取头、skipped/absent 计数、交接不阻塞激活、一条计时日志。`importPreviousProjectionCache` 在 1.1.10 已有。本机克隆 `E:\work\ai-sp\dsh-archive-manager`（1.0.18）落后于 1.1.10，其 `lib\projcache.js` 含 `importPreviousProjectionCache`、无 `mergeWouldChange`，且 git status 对该文件干净 ⇒ 该克隆自身未被改动。待确认：这些改动是否等价于上游后续修复；重装前先备份该文件。

## 4. 升级 DSH 后的检查步骤

前置条件：本机存在 `~/.dsh/profiles/web`（该 profile 不存在时本节整节跳过）。「升级 DSH」指本检出 `E:\work\sp\deepseek-harness` 更新到新宿主版本（该检出双上游：`origin` <https://github.com/1072636071/deepseek-harness.git>、`upstream` <https://github.com/deepseek-ai/deepseek-harness.git>）。

1. 记新基线：读本检出 `packages` 与 `vendor` 下各包的 `package.json` 版本（宿主基线三件：`cordis`、`schemastery`、`dsh-llm`），与第 2 节 peer 表逐行对照。通过判据：声明了版本区间的四台每行都仍成立；某行不成立时记录为待决项交人工裁决，不在本仓擅自改插件的 `peerDependencies`。
2. 逐台构建与自测：`dsh-agent-studio`（`pnpm build` + `pnpm test`）、`dsh-providers-hub`（`pnpm build:all` + `pnpm test`；其 `build` 只做 tsc，client 半区由 `build:all` 产 `lib/client/jet-hub.js`）、`dsh-web-ui-jx`（`pnpm build` + `pnpm test`；其 `build` 已串起 host 与 client 两半区，无 `build:all`）、`win-shell-mcp`（`pnpm build` 后另跑 `npm run build:native` 重建 napi 原生绑定，`native\*.node` 不入库）+ 四台 `@tdbm/*`（无构建步骤，`package.json` 只有 `test`，在其目录跑 `npm test`）。判据：退出码 0。
3. 重启进程：停掉 `dsh web` 再起（页面刷新不够，`dsh` 没有 reload 子命令）。判据：插件产物文件（`lib` 或 `dist` 下的文件；`dsh-agent-studio` 的 client 半区在 `client` 与 `client\parts`；四台 `@tdbm/*` 是包根的 `*.js`）的修改时间早于新进程启动时间。
4. 核对挂载：`pnpm dsh --profile web --dump-config` 里每台插件的行都存在，宿主 stderr 无 `warning: N entry/entries did not activate`（实测输出 `dsh: warning: 1 entry did not activate`）。四台 `@tdbm/*` 不写进 profile 的 `dsh.profile.bundles`，靠 `C:\Users\jxc123\.dsh\profiles\web\cordis.patch.yml` 的 insert 行挂载（`tdbm-panel`、`tdbm-idle-sensor`、`tdbm-session-purge`、`tdbm-lingshu-bootstrap`）。
5. 新会话验证工具面：老会话看不到新工具与 MCP 工具，必须开新会话确认。
6. 回写本文件：第 1 节基线版本与第 2 节 peer 表随实见更新；本机新增或移除 `link:` 插件时同步第 2 节名单。改完本文件后重跑第 4 节末尾的 peer 对照脚本核对表格未漂移。

peer 对照脚本（按宿主规则判定：manifest 有 `engines.dsh` 时该范围单独决定、peer 不参与；否则逐个 `@deepseek-ai/dsh-*` peer 用 `semver.satisfies(version, range, { includePrerelease: true })` 判定，判定列 `OK` = 满足、`FAIL` = 不满足）：

```js
// node peer-check.mjs（semver 从本仓 node_modules 解析）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

const checkout = 'E:\\work\\sp\\deepseek-harness'
const profileDir = 'C:\\Users\\jxc123\\.dsh\\profiles\\web'

function walk(root, depth, out = []) {
  if (depth < 0) return out
  for (const name of readdirSync(root)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(root, name)
    if (statSync(full).isDirectory()) walk(full, depth - 1, out)
    else if (name === 'package.json') out.push(full)
  }
  return out
}

const host = new Map()
for (const file of [...walk(join(checkout, 'packages'), 2), ...walk(join(checkout, 'vendor'), 2)]) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (pkg.name && !host.has(pkg.name)) host.set(pkg.name, pkg.version)
}

const runtime = '0.2.1-rc.5'   // 宿主运行时版本，取 packages/boot/app-boot/package.json 的 version
const satisfies = (version, range) => semver.satisfies(version, range, { includePrerelease: true })

const profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
for (const [name, spec] of Object.entries(profile.dependencies ?? {})) {
  if (!spec.startsWith('link:')) continue
  const pkg = JSON.parse(readFileSync(join(spec.slice(5), 'package.json'), 'utf8'))
  const engines = Object.hasOwn(pkg.engines ?? {}, 'dsh') ? pkg.engines.dsh : undefined
  if (engines) {
    console.log('## ' + name + ' (' + pkg.version + ') engines.dsh=' + engines
      + ' | ' + (satisfies(runtime, engines) ? 'OK' : 'FAIL') + '  [peers ignored]')
    continue
  }
  console.log('## ' + name + ' (' + pkg.version + ')')
  for (const [dep, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (dep !== '@deepseek-ai/dsh' && !dep.startsWith('@deepseek-ai/dsh-')) continue
    const requirement = ['workspace:^', 'workspace:~', 'workspace:*'].includes(range) ? runtime : range
    console.log('   ' + dep + ' wants ' + range + ' | ' + (satisfies(runtime, requirement) ? 'OK' : 'FAIL'))
  }
}
```

## 5. 非自研插件（不在核对范围，只登记来源）

`dsh-mcp-connector` 0.2.79 <https://github.com/duhu2000/dsh-mcp-connector.git>；`@wxg-prc-cpg/browser-skill-dsh-plugin` 0.3.3 <https://github.com/Tencent/BrowserSkill.git>；`dsh-deepseek-web-login` 1.0.3 <https://github.com/cv-superding/dsh-deepseek-web-login.git>；`dshmarket` 1.70.1 <https://github.com/dsh-market/dsh-market.git>；`@furongjun1999/dsh-memory` 0.8.1 <https://github.com/FuRongJun-1999/dsh-memory.git>（装在 dependencies 但未进 `dsh.profile.bundles` ⇒ 宿主不加载；profile patch 2026-10-28 的记录说旧的 `disabled: true` 指向空目标每次启动报 not found，已清理；要恢复须先加进 bundles）。这五台升级只改 profile 版本号。

## 6. 本机存在但未装

`E:\work\sp\dsh-mcp-ui-manage`（只有 .git、docs、AGENTS.md）与 `E:\work\sp\dsh-better-web-ui`（另有 LICENSE）都无插件代码；`E:\work\ai-sp\dsh-ops` 是独立插件仓（`package.json` name=dsh-ops、version=0.3.1、repository=<https://github.com/T-Auto/dsh-ops.git>、仓根有 `dsh-plugin.json` 与 `cordis.patch.yml`），未装进 profile，但 profile 的 `cordis.patch.yml` 仍留一行 `- id: dsh-ops-shell`（无 `name`）；`@linxin666/dsh-web-ui` 全家桶按 [README.md](./README.md) 的方案替换过，当前 profile 的 `node_modules` 下无 `@linxin666` 目录（已卸载）。这四项不进第 4 节流程。