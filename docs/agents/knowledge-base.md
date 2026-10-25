# 知识库：WeKnora · deepseek-harness

本项目的团队知识库：凡本项目产生的**可复用结论**，一律入库；入库前先查重，入库后以库为准。本文件由 `weknora-kb-ops` 技能的 `kb-install.ps1` 生成骨架，**可自由补充**；重跑安装器不会覆盖（除非 `-Force`）。

## 库档案

| 项 | 值 |
| --- | --- |
| kb_id | `58dee114-72b0-4f08-98b7-e9c12c96516b` |
| 库名 | `dsh-agent-studio 项目知识库`（逻辑名 `deepseek-harness`；WeKnora 侧真名如此，**调工具一律传 kb_id，库名匹配会失败**） |
| UI | <http://123.206.125.149:8127/platform/knowledge-bases/58dee114-72b0-4f08-98b7-e9c12c96516b> |
| REST base | `http://123.206.125.149:8127/api/v1`，请求头 `X-API-Key: <key>` |
| 凭据腿 | 坚果云 `项目机密\Secret\WeKnora-知识库-API密钥.md` |

**凭据纪律**：`sk-` 开头的 key 只从凭据腿文件现取现用，不进仓库、不进文档、不进工单、不回显。

## 强制约束

见 `AGENTS.md`「知识库（WeKnora · deepseek-harness）」节（由安装器生成，两份规则文件逐字一致）。

## 写入通道

| 内容 | 通道 | 关键点 |
| --- | --- | --- |
| Markdown 文本 / 结论 | `POST /knowledge-bases/{kb}/knowledge/manual` | body：`title` / `content` / `status` / `tag_ids` / `channel` |
| 图片 | 灵枢 `memory_remember` 或官方 MCP `create_knowledge_from_file` | 图片必须开 `enable_multimodel` |
| 改已有文本条目 | `PUT /knowledge/manual/{id}` | **`status` 不可省略**，缺省被后端置 `draft` |
| 改标题 / 描述 | `PUT /knowledge/{id}` | 不收 `file_name` |
| 标签 | `GET/POST /knowledge-bases/{kb}/tags`、`PUT/DELETE /knowledge-bases/{kb}/tags/{tag_id}` | 同名建标返 409，先查后建 |
| 批量改标 | `PUT /knowledge/tags` | **replace 语义**：先读旧标取并集再整组写回 |
| 删除 | `delete_knowledge` | 高危，先备份 + 确认 |

> ⚠️ **不要用灵枢 `memory_remember` 传文本**——它只收图片，文本会写进灵枢记忆而不是知识库。

## REST 端点速查（含实测踩过的坑）

| 用途 | 方法与路径 |
| --- | --- |
| 列库 | `GET /knowledge-bases` |
| 列条目 | `GET /knowledge-bases/{kb}/knowledge?page=N&page_size=100` |
| 单条详情 | `GET /knowledge/{id}` |
| 混合检索 | `POST /knowledge-bases/{kb}/hybrid-search` |
| 建手工知识 | `POST /knowledge-bases/{kb}/knowledge/manual` |
| 改手工知识 | `PUT /knowledge/manual/{id}` |
| 上传文件 | `POST /knowledge-bases/{kb}/knowledge/file` |

- 混合检索 body 字段是 **`query_text`**；传 `query` → `400 query_text is required`；用 `/search/hybrid` → `404`。
- 手工知识的 `manual` 段必须挂在 `/knowledge/` 之下。记忆口诀：**库 → 知识 → 手工**。
- 返回的 `file_hash` 是 **MD5**（32 位）不是 SHA256。
- `PUT /knowledge/:id` **不收 `file_name`**；文件类条目 PUT 前须等 `parse_status=completed`。

完整菜谱见技能目录 `references/rest-cookbook.md`。

## 标签台账

跑一次体检拿实时台账：

```powershell
pwsh -File scripts/kb-check.ps1 -Workspace .
```

## 体检

```powershell
pwsh -File scripts/kb-check.ps1                      # 从本仓 AGENTS.md 自动读 kb_id
pwsh -File scripts/kb-check.ps1 -Query "检索词"        # 体检 + 检索冒烟
pwsh -File scripts/kb-check.ps1 -Json                # 机器可读输出
```