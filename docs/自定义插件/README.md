# 自定义插件加载方案：以 dsh-web-ui Fork 为例

本文档说明如何将第三方开源插件替换为自己 Fork 的版本，以 `1072636071/dsh-web-ui`（从 `zhu1090093659/dsh-web-ui` Fork）为例。

## 1. 仓库分析

### 基本信息

| 字段 | 值 |
|------|-----|
| 仓库 | [1072636071/dsh-web-ui](https://github.com/1072636071/dsh-web-ui) |
| 上游 | [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) |
| 类型 | Fork（TypeScript） |
| 默认分支 | `main` |
| 自定义分支 | **`jiangxiao`** — 你的插件代码所在分支 |
| 许可证 | Apache-2.0 |

**分支说明：**
- `main` — 与上游同步的基线分支
- `jiangxiao` — 你的自定义插件代码分支，所有修改在此分支上进行

### 目录结构

```
dsh-web-ui/
├── packages/
│   ├── dsh-web-ui-all/               ← 聚合包（一键安装全家桶）
│   │   ├── package.json              ← 声明 dsh.bundle.patch
│   │   ├── cordis.patch.yml          ← insert 12 个子包行（id: web-ui-*）
│   │   ├── src/                      ← 宿主半区代码
│   │   └── lib/                      ← 构建产物
│   ├── dsh-liangshen/                ← 梁神模式 agent 预设
│   ├── dsh-task-board/               ← 任务看板
│   ├── dsh-git-graph/                ← Git 图谱
│   ├── dsh-aionui-panel/             ← 右侧面板（文件树/预览/SCM）
│   ├── dsh-ssh/                      ← SSH 远程运维
│   ├── dsh-pet/                      ← 鲸鱼娘宠物
│   ├── dsh-remote-web-ui/            ← 移动端远程
│   ├── dsh-live-stats/               ← 实时吞吐统计
│   ├── dsh-tool-describe-image/      ← 图像理解工具
│   ├── dsh-web-ui-settings/          ← 设置中心
│   ├── dsh-community-plugins/        ← 社区插件管理
│   ├── dsh-skins/                    ← 皮肤中心
│   └── skins/                        ← 皮肤资产
├── scripts/
│   ├── link-profile.mjs              ← 将子包链接到 ~/.dsh/profiles/node_modules
│   ├── aggregate.mjs                 ← 从 aggregate.yml 生成 cordis.patch.yml
│   └── ...
├── shared/                           ← 共享代码
├── docs/                             ← 文档
└── gallery/                          ← 皮肤预览图
```

### 插件加载原理

每个子包都是标准的 DSH Bundle：

```
package.json 中声明:
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"   ← 这个包是一个 profile 层
    }
  }
```

聚合包 `dsh-web-ui-all` 的 `cordis.patch.yml` 以 `insert` 方式挂载全部子包：

```yaml
# packages/dsh-web-ui-all/cordis.patch.yml
- insert:
    - id: web-ui-liangshen
      name: '@linxin666/dsh-liangshen'
    - id: web-ui-task-board
      name: '@linxin666/dsh-client-ui-task-board'
    - id: web-ui-dsh-aionui-panel
      name: '@linxin666/dsh-client-ui-aionui-panel'
    # ... 共 12 个子包，行 id 统一带 web-ui- 前缀
```

这些 `name:` 字段通过 Node 包名解析查找。`link-profile.mjs` 脚本将仓库子包软链到 `~/.dsh/profiles/node_modules/@linxin666/` 下，确保本地构建产物被正确解析。

## 2. 替换方案

### 方案一：本地开发替换（推荐）

克隆到本地，构建后通过 `link:` 协议安装。

```bash
# 1. 克隆 fork（切换到 jiangxiao 分支）
git clone -b jiangxiao https://github.com/1072636071/dsh-web-ui.git
cd dsh-web-ui

# 2. 安装依赖并构建所有子包
pnpm install
pnpm -r build

# 3. 卸载已安装的 npm 版本（如果之前装过）
pnpm dsh plugin --profile web remove @linxin666/dsh-web-ui-all
pnpm dsh plugin --profile web remove @linxin666/dsh-liangshen
pnpm dsh plugin --profile web remove @linxin666/dsh-ssh
pnpm dsh plugin --profile web remove @linxin666/dsh-client-ui-task-board
pnpm dsh plugin --profile web remove @linxin666/dsh-client-ui-aionui-panel

# 4. 将子包链接到 profile 的 node_modules
node scripts/link-profile.mjs

# 5. 安装本地聚合包
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-all

# 6. 重启 dsh web
dsh web
```

> `link-profile.mjs` 会在 `~/.dsh/profiles/node_modules/@linxin666/` 下创建目录链接（junction，Windows 上兼容），使每个子包可以被 Node 解析到本地仓库的构建产物。

### 方案二：仅替换单个子包

如果只想替换某个插件（如梁神模式），不装全家桶：

```bash
# 克隆、构建、链接后
dsh plugin --profile web add link:$(pwd)/packages/dsh-liangshen
```

### 方案三：从 Git 直接安装（部署用）

```bash
dsh plugin --profile web add github:1072636071/dsh-web-ui#jiangxiao:packages/dsh-web-ui-all
```

> Git 安装会在 `prepare` 阶段自动构建。pnpm >= 10 需要先在 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 中添加对应包名。

## 3. 冲突处理

### 行 id 冲突

聚合包的行 id 统一带 `web-ui-` 前缀（如 `web-ui-dsh-aionui-panel`），独立安装的插件使用原 id（如 `dsh-aionui-panel`）。两者**不冲突，可以共存**，但同一插件双源加载没有额外收益，建议只保留一个来源。

### 配置覆盖

如果之前通过 `cordis.patch.yml` 按 id 写了配置行，注意：

| 来源 | 行 id |
|------|-------|
| 聚合包（dsh-web-ui-all） | `web-ui-描述图像` |
| 独立安装 | `describe-image` |

聚合包下配置行要用 `web-ui-` 前缀的 id。

## 4. 验证

```bash
# 查看完整组合树，确认 web-ui-* 行已挂载
dsh --profile web --dump-config | grep web-ui-

# 侧边栏出现对应入口（重启 dsh web 后）
# 注意：页面刷新不够，必须重启 dsh web 进程
```

## 5. 排障

| 现象 | 原因 | 解决 |
|------|------|------|
| 侧边栏无新入口 | 未重启 `dsh web` 进程 | 重启进程 |
| `Cannot find package '@linxin666/dsh-*'` | 子包未链接到 profile | 重新执行 `node scripts/link-profile.mjs` |
| pnpm 安装报 `ERR_PNPM_IGNORED_BUILDS` | 构建脚本被 pnpm 阻止 | 将包名加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` |
| 安装后版本不对 | pnpm 11 `minimumReleaseAge` 门禁 | 在 profile 的 `pnpm-workspace.yaml` 加 `minimumReleaseAgeExclude: ['@linxin666/*']` |

## 6. 原理总结

DSH 的插件加载链路：

```
cordis.patch.yml 中的 name: '@linxin666/dsh-xxx'
    → Node 包名解析
    → ~/.dsh/profiles/node_modules/@linxin666/dsh-xxx/  （link-profile 创建的软链）
    → 该包的 package.json 声明 dsh.bundle.patch
    → 该包自己的 cordis.patch.yml 被作为 profile 层应用
    → 插件行被挂载到 Cordis 上下文
```

替换关键：**将 npm 已发布版本换成本地仓库的 `link:` 安装**，确保 `link-profile.mjs` 正确链接子包。